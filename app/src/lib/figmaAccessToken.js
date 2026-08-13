const STORAGE_KEY = "shader-studio.figmaAccessToken";
const CHANGE_EVENT = "shader-studio:figma-access-token";

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

function writeStore(token) {
  localStorage.setItem(STORAGE_KEY, token || "");
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** @returns {string} */
export function getFigmaAccessToken() {
  return readStore().trim();
}

/** @param {string} token */
export function setFigmaAccessToken(token) {
  writeStore((token || "").trim());
}

export function clearFigmaAccessToken() {
  writeStore("");
}

export function subscribeFigmaAccessToken(listener) {
  const onStorage = (event) => {
    if (event.key && event.key !== STORAGE_KEY) return;
    listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}
