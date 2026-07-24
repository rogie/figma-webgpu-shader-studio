import { isSupabaseConfigured } from "../lib/supabase.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
    body: JSON.stringify({
      provider,
      model,
      messages,
      source,
      kind,
      fileName,
      features,
      skills,
    }),
    signal,
  });

  if (!response.ok) {
    let message = `Chat request failed (${response.status})`;
    try {
      const json = await response.json();
      if (json?.error) message = String(json.error);
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
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      try {
        const event = JSON.parse(data);
        if (event.type === "delta" && typeof event.text === "string") {
          yield { type: "delta", text: event.text };
        } else if (event.type === "done") {
          yield { type: "done" };
        } else if (event.type === "error") {
          yield {
            type: "error",
            message: event.message || "Chat stream error",
          };
        }
      } catch {
        // ignore malformed SSE lines
      }
    }
  }

  yield { type: "done" };
}
