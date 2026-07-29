import defaultInputUrl from "../assets/default-input.png";
import defaultVideoUrl from "../assets/default-input.mp4";

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
