import defaultInputUrl from "../assets/default-input.png";

// Load the bundled portrait so effect shaders have a useful photographic input
// immediately. createImageBitmap preserves the source dimensions and alpha.
export async function makeSampleBitmap() {
  const response = await fetch(defaultInputUrl);
  if (!response.ok) {
    throw new Error(`Unable to load default preview image (${response.status})`);
  }
  return createImageBitmap(await response.blob());
}
