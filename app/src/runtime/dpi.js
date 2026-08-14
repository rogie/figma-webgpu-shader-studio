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
