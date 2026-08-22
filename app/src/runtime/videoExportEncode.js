export const VIDEO_EXPORT_MAX_DIM = 4096;

export const VIDEO_FORMAT_OPTIONS = [
  { value: "mp4", label: "MP4" },
  { value: "webm", label: "WebM" },
];

export const IMAGE_FORMAT_OPTIONS = [
  { value: "image/webp", label: "WebP" },
  { value: "image/png", label: "PNG" },
  { value: "image/jpeg", label: "JPEG" },
];

export const EMBED_FORMAT_OPTIONS = [
  { value: "code", label: "Code" },
  { value: "iframe", label: "iFrame" },
];

export function resolveImageExportFormat(value) {
  return value === "image/png" || value === "image/jpeg" ? value : "image/webp";
}

export function imageExportHasQuality(format) {
  const type = resolveImageExportFormat(format);
  return type === "image/webp" || type === "image/jpeg";
}

export function resolveImageExportQuality(value) {
  const quality = Number(value);
  if (!Number.isFinite(quality)) return 100;
  return Math.min(100, Math.max(1, Math.round(quality)));
}

export function imageExportQualityFactor(value, format) {
  if (!imageExportHasQuality(format)) return undefined;
  return resolveImageExportQuality(value) / 100;
}

export function resolveEmbedFormat(value) {
  return value === "iframe" ? "iframe" : "code";
}

const MP4_CODEC_PREFERENCE = ["avc", "hevc", "av1"];
const WEBM_CODEC_PREFERENCE = ["vp9", "av1", "vp8"];

export function resolveVideoExportFormat(value) {
  return String(value) === "webm" ? "webm" : "mp4";
}

export function videoExportFileExtension(format, mimeType) {
  const mime = String(mimeType || "");
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  return resolveVideoExportFormat(format);
}

export function preferredExportVideoCodecs(format, supportedCodecs = []) {
  const preference =
    resolveVideoExportFormat(format) === "webm"
      ? WEBM_CODEC_PREFERENCE
      : MP4_CODEC_PREFERENCE;
  const supported = new Set(supportedCodecs);
  if (!supported.size) return preference;
  return preference.filter((codec) => supported.has(codec));
}

export function evenExportSize(width, height) {
  const even = (value) => Math.max(2, Math.round(Number(value) || 1) & ~1);
  return { width: even(width), height: even(height) };
}

/**
 * Probe whether this browser can build a VideoFrame from a WebGPU canvas.
 * Mediabunny CanvasSource uses the same constructor, so a successful probe
 * means export can skip GPU→CPU readback.
 */
export function canConstructVideoFrameFromCanvas(
  canvas,
  VideoFrameClass = globalThis.VideoFrame
) {
  if (typeof VideoFrameClass !== "function" || !canvas) return false;
  let frame = null;
  try {
    frame = new VideoFrameClass(canvas, {
      timestamp: 0,
      duration: 1000,
    });
    return frame.codedWidth > 0 && frame.codedHeight > 0;
  } catch {
    return false;
  } finally {
    try {
      frame?.close?.();
    } catch {
      /* ignore */
    }
  }
}

export async function copyImageDataToCanvas(encodeContext, encodeCanvas, imageData) {
  if (
    imageData.width === encodeCanvas.width &&
    imageData.height === encodeCanvas.height
  ) {
    encodeContext.putImageData(imageData, 0, 0);
    return;
  }
  const bitmap = await createImageBitmap(imageData);
  try {
    encodeContext.drawImage(
      bitmap,
      0,
      0,
      encodeCanvas.width,
      encodeCanvas.height
    );
  } finally {
    bitmap.close?.();
  }
}