import { loadModule } from "../runtime/loader.js";

const COMPLETE_FENCE_RE =
  /```(?:typescript|ts|tsx|javascript|js|jsx)?[^\n]*\n([\s\S]*?)```/gi;
const OPEN_FENCE_RE =
  /```(?:typescript|ts|tsx|javascript|js|jsx)?[^\n]*\n/gi;
const SUMMARY_TAG_RE = /<summary>\s*([\s\S]*?)\s*<\/summary>/i;
const DESCRIPTION_TAG_RE =
  /<description>\s*([\s\S]*?)\s*<\/description>/i;
const METADATA_TAG_RE = /<\/?(?:summary|description)>/gi;

export function isPlanMode(mode) {
  return mode === "plan";
}

function normalizeModuleSource(body) {
  return body.replace(/^\uFEFF/, "").replace(/\s+$/, "") + "\n";
}

function sanitizeMetadataText(value, maxLength) {
  const text = String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_#>`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, maxLength).trim() : null;
}

export function extractAssistantMetadata(text) {
  const input = String(text || "");
  const summaryMatch = input.match(SUMMARY_TAG_RE);
  const descriptionMatch = input.match(DESCRIPTION_TAG_RE);
  return {
    summary: sanitizeMetadataText(summaryMatch?.[1], 240),
    description: sanitizeMetadataText(descriptionMatch?.[1], 1000),
  };
}

function displayProse(text) {
  return String(text || "").replace(METADATA_TAG_RE, "").trim();
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
 * Select code that is safe to auto-apply after a chat stream stops.
 * A complete fence can survive a missing terminal event, while an open fence
 * is only trusted after the provider explicitly completed the response.
 * @param {string} text
 * @param {{ streamCompleted?: boolean, aborted?: boolean }} [options]
 * @returns {string|null}
 */
export function extractAutoApplyModuleSource(
  text,
  { streamCompleted = false, aborted = false } = {}
) {
  if (aborted) return null;
  return extractModuleSource(text, {
    allowIncomplete: Boolean(streamCompleted),
  });
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
    const metadata = extractAssistantMetadata(text);
    return {
      prose: displayProse(text),
      source: null,
      incomplete: false,
      ...metadata,
    };
  }
  const completeSource = extractModuleSource(text, { allowIncomplete: false });
  const incomplete = completeSource == null;
  OPEN_FENCE_RE.lastIndex = 0;
  const openMatch = OPEN_FENCE_RE.exec(text);
  const fenceIndex = openMatch ? openMatch.index : -1;
  const rawProse =
    fenceIndex >= 0 ? text.slice(0, fenceIndex).trim() : text.trim();
  const metadata = extractAssistantMetadata(rawProse);
  return {
    prose: displayProse(rawProse),
    source,
    incomplete,
    ...metadata,
  };
}

export function buildAppliedModuleCheckpoint(text, appliedSource) {
  if (!appliedSource) return null;
  const { prose, summary, description } = splitAssistantContent(text);
  return {
    source: appliedSource,
    summary: summary || prose,
    description,
  };
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
 * @returns {"openai" | "anthropic" | "gemini" | "grok" | "cursor" | null}
 */
function normalizeProvider(provider) {
  if (
    provider === "openai" ||
    provider === "anthropic" ||
    provider === "gemini" ||
    provider === "grok" ||
    provider === "cursor"
  ) {
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
    if (known === "grok") {
      return "API quota or rate limit exceeded. Check your Grok plan/billing at console.x.ai, or switch model/provider.";
    }
    if (known === "cursor") {
      return "Cursor usage limit exceeded. Check your Cursor plan at cursor.com/dashboard, or switch model/provider.";
    }
    return "API quota or rate limit exceeded. Check your plan/billing for the selected provider, or switch model/provider.";
  }
  if (/no longer available|not available to new users/i.test(text)) {
    if (known === "gemini") {
      return "That model is no longer available for your API key. Pick a newer Gemini model from the list.";
    }
    return "That model is no longer available for your API key. Pick another model from the list.";
  }
  if (/usage_limit_exceeded|usage limit exceeded/i.test(text)) {
    if (known === "cursor") {
      return "Cursor usage limit exceeded. Check your Cursor plan at cursor.com/dashboard, or switch model/provider.";
    }
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
