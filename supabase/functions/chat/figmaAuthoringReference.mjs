const FIGMA_AUTHORING_URL = "https://raw.githubusercontent.com/figma/mcp-server-guide/main/skills/figma-shaders/references/authoring.md";
const MAX_BYTES = 64 * 1024;
const REQUIRED_SECTIONS = [
  /^# Shader source authoring\s*$/m,
  /^## Required module contract\s*$/m,
  /^## Runtime lifecycle\s*$/m,
  /^## Animation and mouse input\s*$/m,
];

async function readReference(fetcher, signal) {
  const response = await fetcher(FIGMA_AUTHORING_URL, {
    headers: { Accept: "text/plain" },
    redirect: "error",
    signal,
  });
  if (!response.ok || response.redirected ||
      (response.url && response.url !== FIGMA_AUTHORING_URL) ||
      !/^text\/(plain|markdown)(?:;|$)/i.test(response.headers.get("content-type") || "") ||
      Number(response.headers.get("content-length")) > MAX_BYTES || !response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  let complete = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        break;
      }
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) return null;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  if (!REQUIRED_SECTIONS.every((section) => section.test(text)) ||
      !text.includes("figma:shaders") || !text.includes("frame.mousePosition")) {
    return null;
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return Object.freeze({ text, revision: `sha256:${hex}` });
}

export function createFigmaAuthoringReferenceLoader({
  fetcher = (...args) => globalThis.fetch(...args),
  now = Date.now,
  timeoutMs = 2_500,
  refreshMs = 5 * 60_000,
  retryMs = 30_000,
  maxAgeMs = 24 * 60 * 60_000,
} = {}) {
  let lastGood = null;
  let nextRetry = 0;
  let pending = null;

  function cachedReference(time) {
    return lastGood && time - lastGood.checkedAt < maxAgeMs ? lastGood.reference : null;
  }

  async function refresh() {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, timeoutMs);
    });
    try {
      const reference = await Promise.race([
        readReference(fetcher, controller.signal).catch(() => null),
        timeout,
      ]);
      const time = now();
      if (reference) {
        lastGood = { reference, checkedAt: time };
        return reference;
      }
      nextRetry = time + retryMs;
      return cachedReference(time);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  return function load() {
    const time = now();
    if (lastGood && time - lastGood.checkedAt < refreshMs) {
      return Promise.resolve(cachedReference(time));
    }
    if (pending) return pending;
    if (time < nextRetry) return Promise.resolve(cachedReference(time));
    pending = refresh().finally(() => { pending = null; });
    return pending;
  };
}

export const loadFigmaAuthoringReference = createFigmaAuthoringReferenceLoader();
