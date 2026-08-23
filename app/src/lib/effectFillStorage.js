import {
  fillFromInputSource,
  normalizeComposition,
  paintForInputSource,
  parseCompositionShaderId,
} from "./composition.js";

export const EFFECT_FILL_STORAGE_KEY = "figma-shader-studio:effect-fills";

export function effectFillStorageKeys(shaderId) {
  const parsed = parseCompositionShaderId(shaderId);
  if (!parsed) return typeof shaderId === "string" && shaderId ? [shaderId] : [];
  const bare = String(parsed.id || "").replace(/^(cloud:|draft:)/, "");
  return [...new Set([shaderId, parsed.key, parsed.id, bare].filter(Boolean))];
}

function isEphemeralUrl(url) {
  return (
    typeof url === "string" &&
    (url.startsWith("blob:") || url.startsWith("data:"))
  );
}

function paintMediaUrl(fill) {
  return fill?.paint?.image?.url || fill?.paint?.video?.url || "";
}

export function effectFillIsLive(fill) {
  const paint = fill?.paint;
  if (!paint || typeof paint !== "object") return false;
  if (paint.type === "solid" || paint.type === "gradient") return true;
  const url = paintMediaUrl(fill);
  return typeof url === "string" && url.length > 0;
}

export function effectFillIsDurable(fill) {
  const paint = fill?.paint;
  if (!paint || typeof paint !== "object") return false;
  if (paint.type === "solid" || paint.type === "gradient") return true;
  const url = paintMediaUrl(fill);
  return typeof url === "string" && url.length > 0 && !isEphemeralUrl(url);
}

export function persistableEffectFill(fill) {
  const normalized = normalizeComposition({ fill }).fill;
  const paint = normalized.paint;
  if (!paint || typeof paint !== "object") return normalized;
  const nextPaint = { ...paint };
  let changed = false;
  if (nextPaint.image && isEphemeralUrl(nextPaint.image.url)) {
    const { url: _url, ...image } = nextPaint.image;
    nextPaint.image = image;
    changed = true;
  }
  if (nextPaint.video) {
    const video = { ...nextPaint.video };
    if (isEphemeralUrl(video.url)) {
      delete video.url;
      changed = true;
    }
    if (isEphemeralUrl(video.poster)) {
      delete video.poster;
      changed = true;
    }
    nextPaint.video = video;
  }
  return changed ? { ...normalized, paint: nextPaint } : normalized;
}

function readFillMap(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(EFFECT_FILL_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function readEffectFill(shaderId, storage = globalThis.localStorage) {
  if (!shaderId) return null;
  const map = readFillMap(storage);
  for (const key of effectFillStorageKeys(shaderId)) {
    const stored = map[key];
    if (stored && typeof stored === "object") {
      return normalizeComposition({ fill: stored }).fill;
    }
  }
  return null;
}

export function writeEffectFill(
  shaderId,
  fill,
  storage = globalThis.localStorage,
) {
  if (!shaderId) return;
  try {
    const map = readFillMap(storage);
    const stored = persistableEffectFill(fill);
    for (const key of effectFillStorageKeys(shaderId)) {
      map[key] = stored;
    }
    storage?.setItem(EFFECT_FILL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage can be unavailable in private contexts; fill memory still works.
  }
}

export function lookupEffectFill(
  store,
  shaderId,
  storage = globalThis.localStorage,
) {
  if (store && shaderId) {
    for (const key of effectFillStorageKeys(shaderId)) {
      if (store.has(key)) return store.get(key);
    }
  }
  return readEffectFill(shaderId, storage);
}

export function rememberEffectFill(
  store,
  shaderId,
  fill,
  storage = globalThis.localStorage,
) {
  if (!shaderId || !fill) return;
  const normalized = normalizeComposition({ fill }).fill;
  if (store) {
    for (const key of effectFillStorageKeys(shaderId)) {
      store.set(key, normalized);
    }
  }
  writeEffectFill(shaderId, normalized, storage);
}

export function resolveSessionEffectFill({
  sessionId,
  store = null,
  fallbackSource = "image",
  storage = globalThis.localStorage,
  sampleUrls = {},
  documentFill = null,
} = {}) {
  let memoryFill = null;
  if (store && sessionId) {
    for (const key of effectFillStorageKeys(sessionId)) {
      if (store.has(key)) {
        memoryFill = store.get(key);
        break;
      }
    }
  }
  const stored = readEffectFill(sessionId, storage);
  const paintUrl = stored?.paint?.image?.url || stored?.paint?.video?.url || "";
  const storedDefaultPhoto =
    typeof paintUrl === "string" &&
    sampleUrls.image &&
    paintUrl === sampleUrls.image;
  const fallback = () => {
    if (fallbackSource === "vector") {
      const fill = fillFromInputSource("vector");
      const paint = paintForInputSource("vector", sampleUrls);
      return paint ? { ...fill, paint } : fill;
    }
    const fill = fillFromInputSource(fallbackSource);
    const paint = paintForInputSource(fallbackSource, sampleUrls);
    return paint ? { ...fill, paint } : fill;
  };
  if (effectFillIsLive(memoryFill)) return memoryFill;
  if (
    effectFillIsDurable(documentFill) &&
    (!effectFillIsDurable(stored) || storedDefaultPhoto)
  ) {
    return normalizeComposition({ fill: documentFill }).fill;
  }
  if (effectFillIsDurable(stored) && !storedDefaultPhoto) return stored;
  if (effectFillIsDurable(documentFill)) {
    return normalizeComposition({ fill: documentFill }).fill;
  }
  return fallback();
}
