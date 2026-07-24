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
