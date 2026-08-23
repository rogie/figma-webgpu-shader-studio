import defaultInputUrl from "../assets/default-input.png";
import defaultVideoUrl from "../assets/default-input.mp4?url";
import defaultVectorUrl from "../assets/default-input.svg";

export { defaultVideoUrl };

const VECTOR_RASTER_SIZE = 1024;
const MAX_SVG_RASTER = 4096;

/** Rasterize an SVG blob so WebGPU can use it as image input. */
export async function rasterizeSvgBlob(blob, fallbackSize = VECTOR_RASTER_SIZE) {
  const typed =
    blob.type === "image/svg+xml"
      ? blob
      : new Blob([await blob.arrayBuffer()], { type: "image/svg+xml" });
  const url = URL.createObjectURL(typed);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to decode SVG."));
      img.src = url;
    });
    let width = image.naturalWidth || fallbackSize;
    let height = image.naturalHeight || fallbackSize;
    const maxDim = Math.max(width, height);
    if (maxDim > MAX_SVG_RASTER) {
      const scale = MAX_SVG_RASTER / maxDim;
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Load the bundled photo so effect shaders have a useful photographic input
// immediately. createImageBitmap preserves the source dimensions and alpha.
export async function makeSampleBitmap() {
  const response = await fetch(defaultInputUrl);
  if (!response.ok) {
    throw new Error(`Unable to load default preview image (${response.status})`);
  }
  return createImageBitmap(await response.blob());
}

export async function makeSampleVideoBlob() {
  const response = await fetch(defaultVideoUrl);
  if (!response.ok) {
    throw new Error(`Unable to load default preview video (${response.status})`);
  }
  return response.blob();
}

/** Rasterize the bundled single-color SVG sample for WebGPU frame.input. */
export async function makeSampleVectorBitmap() {
  const response = await fetch(defaultVectorUrl);
  if (!response.ok) {
    throw new Error(
      `Unable to load default preview vector (${response.status})`
    );
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to decode SVG sample."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = VECTOR_RASTER_SIZE;
    canvas.height = VECTOR_RASTER_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, VECTOR_RASTER_SIZE, VECTOR_RASTER_SIZE);
    ctx.drawImage(image, 0, 0, VECTOR_RASTER_SIZE, VECTOR_RASTER_SIZE);
    return createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}
