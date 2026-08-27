import { isSupabaseConfigured } from "../lib/supabase.js";
import {
  buildChatRequest,
  chatStreamCompletionEvent,
  createChatSseParser,
} from "../lib/chatPayload.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const RESPONSE_IDLE_TIMEOUT_MS = 60_000;
const CURSOR_IDLE_TIMEOUT_MS = 300_000;

export async function listAvailableProviderModels(
  provider,
  apiKey,
  { signal } = {}
) {
  if (!isSupabaseConfigured || !apiKey?.trim()) return [];

  const response = await fetch(`${supabaseUrl}/functions/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "x-user-api-key": apiKey.trim(),
    },
    body: JSON.stringify({ action: "list-models", provider }),
    signal,
  });

  if (!response.ok) {
    let message = `${provider} model discovery failed (${response.status})`;
    try {
      const json = await response.json();
      if (typeof json?.error === "string") message = json.error;
      else if (json?.error?.message) message = String(json.error.message);
    } catch {
      // Keep the status-based message.
    }
    throw new Error(message);
  }

  const payload = await response.json();
  return Array.isArray(payload?.models) ? payload.models : [];
}

/**
 * Stream a chat completion via the Supabase Edge Function proxy.
 * Yields { type: "status"|"delta"|"done"|"error", phase?, text?, message? }.
 *
 * @param {object} options
 * @param {string} options.provider
 * @param {string} options.model
 * @param {string} options.apiKey
 * @param {Array<{role: string, content: string, attachments?: object[]}>} options.messages
 * @param {string} options.source
 * @param {string} options.kind
 * @param {string} options.fileName
 * @param {{ isAnimated?: boolean, usesMouse?: boolean }} [options.features]
 * @param {string} [options.skills]
 * @param {"agent"|"plan"} [options.mode]
 * @param {string} [options.cursorAgentId]
 * @param {AbortSignal} [options.signal]
 */
export async function* streamChat({
  provider,
  model,
  apiKey,
  messages,
  source,
  kind,
  fileName,
  features,
  skills,
  mode,
  cursorAgentId,
  signal,
}) {
  if (!isSupabaseConfigured) {
    yield {
      type: "error",
      message: "Supabase is not configured. Set VITE_SUPABASE_URL and publishable key.",
    };
    return;
  }
  if (!apiKey?.trim()) {
    yield {
      type: "error",
      message: "Add your API key in Settings before chatting.",
    };
    return;
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "x-user-api-key": apiKey.trim(),
    },
    body: JSON.stringify(buildChatRequest({
      provider,
      model,
      messages,
      source,
      kind,
      fileName,
      features,
      skills,
      mode,
      cursorAgentId,
    })),
    signal,
  });

  if (!response.ok) {
    let message = `Chat request failed (${response.status})`;
    try {
      const json = await response.json();
      if (typeof json?.error === "string") message = json.error;
      else if (json?.error?.message) message = String(json.error.message);
      else if (json?.message) message = String(json.message);
      else if (json) message = JSON.stringify(json);
    } catch {
      try {
        const text = await response.text();
        if (text) message = text;
      } catch {
        // keep default
      }
    }
    yield { type: "error", message };
    return;
  }

  if (!response.body) {
    yield { type: "error", message: "No response body from chat proxy." };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createChatSseParser();
  const idleTimeoutMs =
    provider === "cursor" ? CURSOR_IDLE_TIMEOUT_MS : RESPONSE_IDLE_TIMEOUT_MS;
  const idleSeconds = Math.round(idleTimeoutMs / 1000);
  let sawDone = false;
  let sawError = false;
  let receivedEvent = false;

  while (true) {
    let timeoutId;
    const read = reader.read();
    let result;
    try {
      result = await Promise.race([
        read,
        new Promise((resolve) => {
          timeoutId = window.setTimeout(
            () => resolve({ timedOut: true }),
            idleTimeoutMs
          );
        }),
      ]);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
    if (result.timedOut) {
      await reader.cancel();
      yield {
        type: "error",
        message: receivedEvent
          ? `The model stopped responding for ${idleSeconds} seconds. The partial reply was preserved; try again.`
          : `The model did not start responding within ${idleSeconds} seconds. Try again or choose a faster model.`,
      };
      return;
    }
    const { done, value } = result;
    const events = done
      ? parser.push(decoder.decode(), { flush: true })
      : parser.push(decoder.decode(value, { stream: true }));
    for (const event of events) {
      receivedEvent = true;
      if (event.type === "done") sawDone = true;
      if (event.type === "error") sawError = true;
      yield event;
    }
    if (done) break;
  }

  const completion = chatStreamCompletionEvent(provider, { sawDone, sawError });
  if (completion) yield completion;
}
