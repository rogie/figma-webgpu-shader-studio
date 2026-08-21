const STORAGE_KEY = "shader-studio.providerKeys";

const EMPTY = { openai: "", anthropic: "", gemini: "", grok: "", cursor: "" };

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      openai: typeof parsed.openai === "string" ? parsed.openai : "",
      anthropic: typeof parsed.anthropic === "string" ? parsed.anthropic : "",
      gemini: typeof parsed.gemini === "string" ? parsed.gemini : "",
      grok: typeof parsed.grok === "string" ? parsed.grok : "",
      cursor: typeof parsed.cursor === "string" ? parsed.cursor : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

function writeStore(next) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      openai: next.openai || "",
      anthropic: next.anthropic || "",
      gemini: next.gemini || "",
      grok: next.grok || "",
      cursor: next.cursor || "",
    })
  );
  window.dispatchEvent(new Event("shader-studio:provider-keys"));
}

/** @returns {{ openai: string, anthropic: string, gemini: string, grok: string, cursor: string }} */
export function getProviderKeys() {
  return readStore();
}

/** @param {"openai"|"anthropic"|"gemini"|"grok"|"cursor"} provider */
export function getProviderKey(provider) {
  const keys = readStore();
  return (keys[provider] || "").trim();
}

/** @param {"openai"|"anthropic"|"gemini"|"grok"|"cursor"} provider @param {string} key */
export function setProviderKey(provider, key) {
  const next = readStore();
  next[provider] = (key || "").trim();
  writeStore(next);
}

/** @param {"openai"|"anthropic"|"gemini"|"grok"|"cursor"} provider */
export function clearProviderKey(provider) {
  setProviderKey(provider, "");
}

export function subscribeProviderKeys(listener) {
  const onStorage = (event) => {
    if (event.key && event.key !== STORAGE_KEY) return;
    listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("shader-studio:provider-keys", listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("shader-studio:provider-keys", listener);
  };
}
