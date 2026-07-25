import { isSupabaseConfigured } from "../lib/supabase.js";
import {
  buildChatRequest,
  createChatSseParser,
} from "../lib/chatPayload.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const RESPONSE_IDLE_TIMEOUT_MS = 60_000;

/**
 * Stream a chat completion via the Supabase Edge Function proxy.
 * Yields { type: "delta"|"done"|"error", text?, message? }.
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
  let sawDone = false;
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
            RESPONSE_IDLE_TIMEOUT_MS
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
          ? "The model stopped responding for 60 seconds. The partial reply was preserved; try again."
          : "The model did not start responding within 60 seconds. Try again or choose a faster model.",
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
      yield event;
    }
    if (done) break;
  }

  if (!sawDone) yield { type: "done" };
}
