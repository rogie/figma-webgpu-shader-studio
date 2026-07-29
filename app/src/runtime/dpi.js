/** Current device pixel ratio (1 on non-retina, often 2/3 on retina). */
export function getDevicePixelRatio() {
  if (typeof window === "undefined") return 1;
  return Math.max(1, Number(window.devicePixelRatio) || 1);
}

/**
 * Convert a CSS-pixel box into a device-pixel buffer size, capped by maxDim.
 * Returns both the buffer size and the original CSS size for canvas styling.
 */
export function cssSizeToDevicePixels(cssWidth, cssHeight, maxDim = 2048) {
  const dpr = getDevicePixelRatio();
  const cssW = Math.max(1, Number(cssWidth) || 1);
  const cssH = Math.max(1, Number(cssHeight) || 1);
  let width = Math.max(1, Math.round(cssW * dpr));
  let height = Math.max(1, Math.round(cssH * dpr));
  const scale = Math.min(1, maxDim / Math.max(width, height));
  if (scale < 1) {
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }
  return { width, height, dpr, cssWidth: cssW, cssHeight: cssH };
}
