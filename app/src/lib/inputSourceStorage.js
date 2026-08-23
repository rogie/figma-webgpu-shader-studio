const INPUT_SOURCE_STORAGE_KEY = "figma-shader-studio:input-sources";

export function readInputSource(
  shaderId,
  storage = globalThis.localStorage,
) {
  try {
    const map = JSON.parse(storage?.getItem(INPUT_SOURCE_STORAGE_KEY) || "{}");
    const source = map[shaderId] || null;
    return source === "vector" ? "image" : source;
  } catch {
    return null;
  }
}

export function writeInputSource(
  shaderId,
  source,
  storage = globalThis.localStorage,
) {
  try {
    const map = JSON.parse(storage?.getItem(INPUT_SOURCE_STORAGE_KEY) || "{}");
    map[shaderId] = source === "vector" ? "image" : source;
    storage?.setItem(INPUT_SOURCE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage can be unavailable in private contexts; input choice is optional.
  }
}
