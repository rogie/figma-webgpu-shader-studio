export const HTML_IN_CANVAS_FLAG = "chrome://flags/#canvas-draw-element";

export const HTML_IN_CANVAS_SETUP =
  "Enable chrome://flags/#canvas-draw-element (Canary or Brave).";

export const HTML_INPUT_WIDTH = 960;
export const HTML_INPUT_HEIGHT = 720;

let cachedSupport = null;

/** Feature-detect HTML-in-Canvas paint + WebGPU element copy. */
export function supportsHtmlInCanvas() {
  if (cachedSupport !== null) return cachedSupport;
  if (typeof document === "undefined") {
    cachedSupport = false;
    return false;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("layoutsubtree", "");
    const ctx = canvas.getContext("2d");
    cachedSupport =
      typeof ctx?.drawElementImage === "function" &&
      typeof canvas.requestPaint === "function";
  } catch {
    cachedSupport = false;
  }
  return cachedSupport;
}

export function supportsCopyElementImageToTexture(device) {
  return typeof device?.queue?.copyElementImageToTexture === "function";
}
