const FENCE_RE =
  /```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)```/gi;

/**
 * Extract the last fenced TypeScript/JS module from assistant text.
 * @param {string} text
 * @returns {string|null}
 */
export function extractModuleSource(text) {
  if (!text) return null;
  let match;
  let last = null;
  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(text)) !== null) {
    last = match[1];
  }
  if (last == null) return null;
  return last.replace(/^\uFEFF/, "").replace(/\s+$/, "") + "\n";
}

/**
 * Light validation before applying into the editor.
 * @param {string} source
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateModuleSource(source) {
  const trimmed = (source || "").trim();
  if (!trimmed) {
    return { ok: false, reason: "Empty code block." };
  }
  if (trimmed.length < 40) {
    return { ok: false, reason: "Code block looks too short to be a module." };
  }
  if (!/\bexport\b/.test(trimmed)) {
    return { ok: false, reason: "Code block is missing an export." };
  }
  return { ok: true };
}

/**
 * Split assistant prose from the trailing code fence for display.
 * @param {string} text
 */
export function splitAssistantContent(text) {
  const source = extractModuleSource(text);
  if (!source) {
    return { prose: text.trim(), source: null };
  }
  const fenceIndex = text.search(/```(?:typescript|ts|javascript|js)?\s*\n/i);
  const prose =
    fenceIndex >= 0 ? text.slice(0, fenceIndex).trim() : text.trim();
  return { prose, source };
}

/**
 * Turn provider/proxy error blobs into a short UI message.
 * @param {unknown} raw
 */
function summarizeProviderError(text) {
  if (/quota|rate.?limit|RESOURCE_EXHAUSTED|429/i.test(text)) {
    return "API quota or rate limit exceeded. Check your plan/billing (for Gemini: ai.google.dev), or switch model/provider.";
  }
  if (/no longer available|not available to new users/i.test(text)) {
    return "That model is no longer available for your API key. Pick a newer Gemini model from the list.";
  }
  if (/API key not valid|API_KEY_INVALID|invalid api key/i.test(text)) {
    return "API key is invalid. Update it in Settings.";
  }
  return null;
}

export function formatChatError(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "Chat failed.";

  const early = summarizeProviderError(text);
  if (early) return early;

  let message = text;
  try {
    const json = JSON.parse(text);
    const nested =
      json?.error?.message ||
      json?.message ||
      (typeof json?.error === "string" ? json.error : null);
    if (nested) message = String(nested);
  } catch {
    const messageMatch = text.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (messageMatch?.[1]) {
      message = messageMatch[1].replace(/\\"/g, '"').replace(/\\n/g, " ");
    }
  }

  const summarized = summarizeProviderError(message);
  if (summarized) return summarized;

  if (message.length > 280) return `${message.slice(0, 277)}…`;
  return message;
}
