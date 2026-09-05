export const PREVIEW_PIXEL_RATIO_STORAGE_KEY = "figma-shader-preview-pixel-ratio";

const previewPixelRatioListeners = new Set();

/** Follow the display instead of the app's 1x/2x preview preference. */
export const PREVIEW_PIXEL_RATIO_NATIVE = "native";

/** Current device pixel ratio (1 on non-retina, often 2/3 on retina). */
export function getDevicePixelRatio() {
  const pixelRatio = globalThis.window?.devicePixelRatio;
  return Math.max(1, Number(pixelRatio) || 1);
}

export function normalizePreviewPixelRatioMode(mode, { allowNative = false } = {}) {
  if (mode === "1x") return "1x";
  if (allowNative && mode === PREVIEW_PIXEL_RATIO_NATIVE) {
    return PREVIEW_PIXEL_RATIO_NATIVE;
  }
  return "2x";
}

/** Buffer scale for a preview mode. Native tracks the display, not app settings. */
export function previewPixelRatioForMode(
  mode,
  pixelRatio = getDevicePixelRatio()
) {
  if (mode === "1x") return 1;
  if (mode === PREVIEW_PIXEL_RATIO_NATIVE) {
    return Math.max(1, Number(pixelRatio) || 1);
  }
  return 2;
}

export function readPreviewPixelRatioMode(
  storage = typeof localStorage === "undefined" ? null : localStorage
) {
  try {
    return storage?.getItem(PREVIEW_PIXEL_RATIO_STORAGE_KEY) === "1x"
      ? "1x"
      : "2x";
  } catch {
    return "2x";
  }
}

export function writePreviewPixelRatioMode(
  mode,
  storage = typeof localStorage === "undefined" ? null : localStorage
) {
  const normalized = mode === "1x" ? "1x" : "2x";
  try {
    storage?.setItem(PREVIEW_PIXEL_RATIO_STORAGE_KEY, normalized);
  } catch {
    // Rendering should continue when storage is unavailable.
  }
  previewPixelRatioListeners.forEach((listener) => listener(normalized));
  return normalized;
}

export function subscribePreviewPixelRatioMode(listener) {
  previewPixelRatioListeners.add(listener);
  return () => previewPixelRatioListeners.delete(listener);
}

/**
 * Convert a CSS-pixel box into a device-pixel buffer size, capped by maxDim.
 * Returns both the buffer size and the original CSS size for canvas styling.
 */
export function cssSizeToDevicePixels(
  cssWidth,
  cssHeight,
  maxDim = 2048,
  pixelRatio = getDevicePixelRatio()
) {
  const dpr = Math.max(1, Number(pixelRatio) || 1);
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

/**
 * Choose a stable supersampling tier for the current preview zoom.
 * Never downsample below the shader's logical output size.
 */
export function adaptiveRenderScale(
  zoom,
  baseWidth,
  baseHeight,
  {
    maxScale = 2,
    maxPixels = 8 * 1024 * 1024,
    maxDimension = 4096,
  } = {}
) {
  const z = Math.max(1, Number(zoom) || 1);
  const width = Math.max(1, Number(baseWidth) || 1);
  const height = Math.max(1, Number(baseHeight) || 1);
  const tier = z < 1.25 ? 1 : z < 1.75 ? 1.5 : 2;
  const pixelScale = Math.sqrt(maxPixels / (width * height));
  const dimensionScale = maxDimension / Math.max(width, height);
  return Math.max(
    1,
    Math.min(tier, maxScale, pixelScale, dimensionScale)
  );
}
