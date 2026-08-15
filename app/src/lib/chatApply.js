import { loadModule } from "../runtime/loader.js";

const COMPLETE_FENCE_RE =
  /```(?:typescript|ts|tsx|javascript|js|jsx)?[^\n]*\n([\s\S]*?)```/gi;
const OPEN_FENCE_RE =
  /```(?:typescript|ts|tsx|javascript|js|jsx)?[^\n]*\n/gi;

function normalizeModuleSource(body) {
  return body.replace(/^\uFEFF/, "").replace(/\s+$/, "") + "\n";
}

/**
 * Extract the last fenced TypeScript/JS module from assistant text.
 * @param {string} text
 * @param {{ allowIncomplete?: boolean }} [options]
 * @returns {string|null}
 */
export function extractModuleSource(text, { allowIncomplete = false } = {}) {
  if (!text) return null;

  let match;
  let last = null;
  COMPLETE_FENCE_RE.lastIndex = 0;
  while ((match = COMPLETE_FENCE_RE.exec(text)) !== null) {
    last = match[1];
  }
  if (last != null) {
    return normalizeModuleSource(last);
  }

  if (!allowIncomplete) return null;

  let openMatch;
  let lastOpen = null;
  OPEN_FENCE_RE.lastIndex = 0;
  while ((openMatch = OPEN_FENCE_RE.exec(text)) !== null) {
    lastOpen = openMatch;
  }
  if (!lastOpen) return null;
  const body = text.slice(lastOpen.index + lastOpen[0].length);
  if (!body.trim()) return null;
  return normalizeModuleSource(body);
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
  try {
    loadModule(source);
    return { ok: true };
  } catch (error) {
    const reason = error?.message || String(error);
    return {
      ok: false,
      reason,
      autoHealable: /^(Compile|Syntax) error:/i.test(reason),
    };
  }
}

/**
 * Split assistant prose from the trailing code fence for display.
 * @param {string} text
 */
export function splitAssistantContent(text) {
  const source = extractModuleSource(text, { allowIncomplete: true });
  if (!source) {
    return { prose: text.trim(), source: null };
  }
  OPEN_FENCE_RE.lastIndex = 0;
  const openMatch = OPEN_FENCE_RE.exec(text);
  const fenceIndex = openMatch ? openMatch.index : -1;
  const prose =
    fenceIndex >= 0 ? text.slice(0, fenceIndex).trim() : text.trim();
  return { prose, source };
}

export function chatApplyTargetStatus({
  requestShaderKey,
  activeShaderKey,
  baselineSource,
  currentSource,
}) {
  if (requestShaderKey !== activeShaderKey) return "different-shader";
  if (baselineSource !== currentSource) return "source-changed";
  return "current";
}

/**
 * @param {string} [provider]
 * @returns {"openai" | "anthropic" | "gemini" | null}
 */
function normalizeProvider(provider) {
  if (provider === "openai" || provider === "anthropic" || provider === "gemini") {
    return provider;
  }
  return null;
}

/**
 * Turn provider/proxy error blobs into a short UI message.
 * @param {string} text
 * @param {string} [provider]
 */
function summarizeProviderError(text, provider) {
  const known = normalizeProvider(provider);
  if (/quota|rate.?limit|RESOURCE_EXHAUSTED|429/i.test(text)) {
    if (known === "gemini") {
      return "API quota or rate limit exceeded. Check your Gemini plan/billing at ai.google.dev, or switch model/provider.";
    }
    if (known === "openai") {
      return "API quota or rate limit exceeded. Check your OpenAI plan/billing, or switch model/provider.";
    }
    if (known === "anthropic") {
      return "API quota or rate limit exceeded. Check your Anthropic plan/billing, or switch model/provider.";
    }
    return "API quota or rate limit exceeded. Check your plan/billing for the selected provider, or switch model/provider.";
  }
  if (/no longer available|not available to new users/i.test(text)) {
    if (known === "gemini") {
      return "That model is no longer available for your API key. Pick a newer Gemini model from the list.";
    }
    return "That model is no longer available for your API key. Pick another model from the list.";
  }
  if (/API key not valid|API_KEY_INVALID|invalid api key/i.test(text)) {
    return "API key is invalid. Update it in Settings.";
  }
  return null;
}

/**
 * @param {unknown} raw
 * @param {{ provider?: string }} [options]
 */
export function formatChatError(raw, options = {}) {
  const text = String(raw ?? "").trim();
  if (!text) return "Chat failed.";

  const provider = options.provider;
  const early = summarizeProviderError(text, provider);
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

  const summarized = summarizeProviderError(message, provider);
  if (summarized) return summarized;

  if (message.length > 280) return `${message.slice(0, 277)}…`;
  return message;
}
