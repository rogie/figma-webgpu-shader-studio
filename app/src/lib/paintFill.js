export const PAINT_FILL_TYPES = [
  "solid",
  "gradient",
  "image",
  "video",
  "webcam",
];

export const DEFAULT_PAINT_SIZE = 1024;

export function isPaintFillType(type) {
  return PAINT_FILL_TYPES.includes(type);
}

export function graphTypeForPaint(type) {
  if (type === "video" || type === "webcam") return "video";
  if (type === "html") return "html";
  if (type === "shader") return "shader";
  return "image";
}

export function sampleFallbackPaint(defaultImageUrl) {
  return {
    type: "image",
    image: { url: defaultImageUrl, scaleMode: "fill" },
  };
}

export function fillLoadErrorMessage(fill, error) {
  return `Fill ${fill?.id || "input"} could not load${
    error?.message ? `: ${error.message}` : ""
  }. Showing the sample image instead.`;
}

export function resolvePaintFill(
  fill,
  { defaultImageUrl = "", defaultVideoUrl = "" } = {}
) {
  if (!fill || !isPaintFillType(fill.type)) return fill;
  if (fill.type === "video") {
    const url =
      typeof fill.video?.url === "string" && fill.video.url
        ? fill.video.url
        : defaultVideoUrl;
    return {
      ...fill,
      video: {
        scaleMode: "fit",
        scale: 50,
        ...(fill.video && typeof fill.video === "object" ? fill.video : {}),
        url,
      },
    };
  }
  if (fill.type === "image") {
    const url =
      typeof fill.image?.url === "string" && fill.image.url
        ? fill.image.url
        : defaultImageUrl;
    return {
      ...fill,
      image: {
        scaleMode: "fit",
        ...(fill.image && typeof fill.image === "object" ? fill.image : {}),
        url,
      },
    };
  }
  return fill;
}

export function paintFillAlpha(fill) {
  if (fill?.alpha != null && fill.alpha !== "") {
    const alpha = Number(fill.alpha);
    if (Number.isFinite(alpha)) return clamp01(alpha > 1 ? alpha / 100 : alpha);
  }
  if (fill?.opacity != null && fill.opacity !== "") {
    const opacity = Number(fill.opacity);
    if (Number.isFinite(opacity)) {
      return clamp01(opacity > 1 ? opacity / 100 : opacity);
    }
  }
  return 1;
}

export function hexToRgba(color, alpha = 1) {
  const hex = String(color || "#D9D9D9").replace("#", "");
  const hasHexAlpha = hex.length === 4 || hex.length === 8;
  const normalized =
    hex.length === 3 || hex.length === 4
      ? hex
          .split("")
          .map((part) => part + part)
          .join("")
      : hex.padEnd(hasHexAlpha ? 8 : 6, "0").slice(0, hasHexAlpha ? 8 : 6);
  const rgb = Number.parseInt(normalized.slice(0, 6), 16);
  if (!Number.isFinite(rgb)) {
    return { r: 217, g: 217, b: 217, a: clamp01(alpha) };
  }
  const hexAlpha =
    hasHexAlpha && normalized.length >= 8
      ? Number.parseInt(normalized.slice(6, 8), 16) / 255
      : 1;
  return {
    r: (rgb >> 16) & 255,
    g: (rgb >> 8) & 255,
    b: rgb & 255,
    a: clamp01(alpha * hexAlpha),
  };
}

export function paintImageSource(fill) {
  if (fill?.type === "webcam") {
    const url =
      (typeof fill.webcam?.snapshot === "string" && fill.webcam.snapshot) ||
      (typeof fill.image?.url === "string" && fill.image.url) ||
      "";
    return {
      url,
      scaleMode: fill.webcam?.scaleMode || fill.image?.scaleMode || "fill",
      scale: fill.webcam?.scale ?? fill.image?.scale ?? 50,
      opacity: fill.webcam?.opacity ?? fill.image?.opacity ?? 1,
    };
  }
  if (fill?.type === "video" && fill.video) {
    return { ...fill.video };
  }
  return fill?.image && typeof fill.image === "object"
    ? { ...fill.image }
    : { url: "", scaleMode: "fill", scale: 50, opacity: 1 };
}

export function rgbaCss({ r, g, b, a }) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function interpolationClause(gradient) {
  const space = String(gradient?.interpolationSpace || "srgb").toLowerCase();
  if (!space || space === "srgb") return "";
  if (space === "oklch" || space === "hsl") {
    const hue = String(gradient?.hueInterpolation || "shorter").toLowerCase();
    return `in ${space} ${hue} hue`;
  }
  return `in ${space}`;
}

export function buildGradientCss(gradient) {
  const stops = [...(gradient?.stops || [])]
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((stop) => {
      const color = rgbaCss(
        hexToRgba(stop.color, (stop.opacity ?? 100) / 100)
      );
      return `${color} ${Number(stop.position) || 0}%`;
    });
  const stopList = stops.length
    ? stops.join(", ")
    : `${rgbaCss(hexToRgba("#D9D9D9"))} 0%, ${rgbaCss(hexToRgba("#737373"))} 100%`;
  const clause = interpolationClause(gradient);
  const interpolation = clause ? ` ${clause}` : "";
  const angle = Number(gradient?.angle) || 0;
  const centerX = Number.isFinite(Number(gradient?.centerX))
    ? Number(gradient.centerX)
    : 50;
  const centerY = Number.isFinite(Number(gradient?.centerY))
    ? Number(gradient.centerY)
    : 50;
  switch (gradient?.type) {
    case "radial":
      return `radial-gradient(circle at ${centerX}% ${centerY}%${interpolation}, ${stopList})`;
    case "angular":
      return `conic-gradient(from ${angle}deg${interpolation}, ${stopList})`;
    default:
      return `linear-gradient(${angle}deg${interpolation}, ${stopList})`;
  }
}

export function coverContainRect(
  scaleMode,
  srcWidth,
  srcHeight,
  dstWidth,
  dstHeight
) {
  const srcRatio = srcWidth / Math.max(1, srcHeight);
  const dstRatio = dstWidth / Math.max(1, dstHeight);
  const cover = scaleMode !== "fit";
  if ((cover && srcRatio > dstRatio) || (!cover && srcRatio <= dstRatio)) {
    const height = dstHeight;
    const width = height * srcRatio;
    return { x: (dstWidth - width) / 2, y: 0, width, height };
  }
  const width = dstWidth;
  const height = width / srcRatio;
  return { x: 0, y: (dstHeight - height) / 2, width, height };
}

export function paintSize(host) {
  const width = Math.round(
    host?.inputTexture?.width || host?.stageCssSize?.width || DEFAULT_PAINT_SIZE
  );
  const height = Math.round(
    host?.inputTexture?.height ||
      host?.stageCssSize?.height ||
      DEFAULT_PAINT_SIZE
  );
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

export async function rasterizePaintFill(
  fill,
  width = DEFAULT_PAINT_SIZE,
  height = DEFAULT_PAINT_SIZE
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const type = fill?.type;
  if (type === "solid") {
    paintSolid(ctx, fill, canvas.width, canvas.height);
  } else if (type === "gradient") {
    paintGradient(ctx, fill, canvas.width, canvas.height);
  } else if (type === "image" || type === "webcam") {
    await paintImageLayer(
      ctx,
      paintImageSource(fill),
      canvas.width,
      canvas.height
    );
  } else {
    paintSolid(ctx, { color: "#D9D9D9", alpha: 1 }, canvas.width, canvas.height);
  }

  return createImageBitmap(canvas);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function paintSolid(ctx, fill, width, height) {
  const color = hexToRgba(fill?.color, paintFillAlpha(fill));
  ctx.globalAlpha = 1;
  ctx.fillStyle = rgbaCss(color);
  ctx.fillRect(0, 0, width, height);
}

function paintGradient(ctx, fill, width, height) {
  const gradient = fill?.gradient || {};
  const stops = [...(gradient.stops || [])].sort(
    (a, b) => Number(a.position) - Number(b.position)
  );
  const angle = ((Number(gradient.angle) || 0) * Math.PI) / 180;
  const centerX =
    ((Number.isFinite(Number(gradient.centerX))
      ? Number(gradient.centerX)
      : 50) /
      100) *
    width;
  const centerY =
    ((Number.isFinite(Number(gradient.centerY))
      ? Number(gradient.centerY)
      : 50) /
      100) *
    height;

  let paint;
  if (gradient.type === "radial") {
    paint = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      Math.hypot(width, height) / 2
    );
  } else if (gradient.type === "angular" && ctx.createConicGradient) {
    // CSS conic 0deg is 12 o'clock; canvas 0 is 3 o'clock.
    paint = ctx.createConicGradient(angle - Math.PI / 2, centerX, centerY);
  } else {
    const dx = Math.sin(angle);
    const dy = -Math.cos(angle);
    paint = ctx.createLinearGradient(
      width / 2 - (dx * width) / 2,
      height / 2 - (dy * height) / 2,
      width / 2 + (dx * width) / 2,
      height / 2 + (dy * height) / 2
    );
  }

  if (!stops.length) {
    paint.addColorStop(0, rgbaCss(hexToRgba("#D9D9D9")));
    paint.addColorStop(1, rgbaCss(hexToRgba("#737373")));
  } else {
    for (const stop of stops) {
      const offset = clamp01((Number(stop.position) || 0) / 100);
      paint.addColorStop(
        offset,
        rgbaCss(hexToRgba(stop.color, (stop.opacity ?? 100) / 100))
      );
    }
  }
  ctx.save();
  ctx.globalAlpha = layerOpacity(gradient.opacity ?? fill?.opacity ?? fill?.alpha, 1);
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

async function paintImageLayer(ctx, image, width, height) {
  const url = typeof image?.url === "string" ? image.url : "";
  if (!url) {
    paintSolid(ctx, { color: "#D9D9D9", alpha: 1 }, width, height);
    return;
  }
  const source = await loadImage(url);
  const scaleMode = image?.scaleMode || "fill";
  const scale = Number(image.scale);
  ctx.save();
  ctx.globalAlpha = layerOpacity(image?.opacity, 1);
  if (scaleMode === "tile") {
    // Fig fill picker uses CSS background-size: N% (width of the destination).
    const tileScale = Number.isFinite(scale) ? scale / 100 : 0.5;
    const tileWidth = Math.max(1, width * tileScale);
    const tileHeight = Math.max(
      1,
      tileWidth * (source.height / Math.max(1, source.width))
    );
    const patternCanvas = document.createElement("canvas");
    patternCanvas.width = tileWidth;
    patternCanvas.height = tileHeight;
    patternCanvas.getContext("2d").drawImage(source, 0, 0, tileWidth, tileHeight);
    ctx.fillStyle = ctx.createPattern(patternCanvas, "repeat");
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return;
  }
  const rect = coverContainRect(
    scaleMode,
    source.width,
    source.height,
    width,
    height
  );
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function layerOpacity(value, fallback = 1) {
  if (value == null || value === "") return fallback;
  const opacity = Number(value);
  if (!Number.isFinite(opacity)) return fallback;
  return clamp01(opacity > 1 ? opacity / 100 : opacity);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!url.startsWith("data:") && !url.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load fill image."));
    image.src = url;
  });
}
