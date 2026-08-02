import defaultInputUrl from "../assets/default-input.png";
import defaultVideoUrl from "../assets/default-input.mp4";
import defaultVectorUrl from "../assets/default-input.svg";

const VECTOR_RASTER_SIZE = 1024;

// Load the bundled photo so effect shaders have a useful photographic input
// immediately. createImageBitmap preserves the source dimensions and alpha.
export async function makeSampleBitmap() {
  const response = await fetch(defaultInputUrl);
  if (!response.ok) {
    throw new Error(`Unable to load default preview image (${response.status})`);
  }
  return createImageBitmap(await response.blob());
}

export function getSampleVideoUrl() {
  return defaultVideoUrl;
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
