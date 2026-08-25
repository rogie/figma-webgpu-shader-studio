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

function paintMediaAssetPath(fill) {
  return (
    fill?.paint?.image?.assetPath || fill?.paint?.video?.assetPath || ""
  );
}

export function effectFillIsLive(fill) {
  if (fill?.type === "shader" && fill.shaderId) return true;
  const paint = fill?.paint;
  if (!paint || typeof paint !== "object") return false;
  if (
    paint.type === "solid" ||
    paint.type === "gradient" ||
    paint.type === "webcam"
  ) {
    return true;
  }
  if (paintMediaAssetPath(fill)) return true;
  const url = paintMediaUrl(fill);
  return typeof url === "string" && url.length > 0;
}

export function effectFillIsDurable(fill) {
  if (fill?.type === "shader" && fill.shaderId) return true;
  const paint = fill?.paint;
  if (!paint || typeof paint !== "object") return false;
  if (
    paint.type === "solid" ||
    paint.type === "gradient" ||
    paint.type === "webcam"
  ) {
    return true;
  }
  if (paintMediaAssetPath(fill)) return true;
  const url = paintMediaUrl(fill);
  return typeof url === "string" && url.length > 0 && !isEphemeralUrl(url);
}

function normalizeEffectFills(fills) {
  if (Array.isArray(fills)) {
    return normalizeComposition({ fills }).fills;
  }
  if (fills && typeof fills === "object") {
    return normalizeComposition({ fill: fills }).fills;
  }
  return [];
}

function persistableNormalizedEffectFill(normalized) {
  const paint = normalized.paint;
  if (!paint || typeof paint !== "object") return normalized;
  const nextPaint = { ...paint };
  let changed = false;
  if (
    nextPaint.image &&
    (nextPaint.image.assetPath || isEphemeralUrl(nextPaint.image.url))
  ) {
    const { url: _url, ...image } = nextPaint.image;
    nextPaint.image = image;
    changed = true;
  }
  if (nextPaint.video) {
    const video = { ...nextPaint.video };
    if (video.assetPath || isEphemeralUrl(video.url)) {
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

export function persistableEffectFills(fills) {
  return normalizeEffectFills(fills).map(persistableNormalizedEffectFill);
}

export function persistableEffectFill(fill) {
  return persistableEffectFills(fill ? [fill] : [])[0] || null;
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

function storedEffectFills(shaderId, storage) {
  if (!shaderId) return { found: false, fills: [] };
  const map = readFillMap(storage);
  for (const key of effectFillStorageKeys(shaderId)) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
    const stored = map[key];
    if (Array.isArray(stored) || (stored && typeof stored === "object")) {
      return { found: true, fills: normalizeEffectFills(stored) };
    }
  }
  return { found: false, fills: [] };
}

export function readEffectFills(shaderId, storage = globalThis.localStorage) {
  return storedEffectFills(shaderId, storage).fills;
}

export function readEffectFill(shaderId, storage = globalThis.localStorage) {
  return readEffectFills(shaderId, storage)[0] || null;
}

export function writeEffectFills(
  shaderId,
  fills,
  storage = globalThis.localStorage,
) {
  if (!shaderId) return;
  try {
    const map = readFillMap(storage);
    const stored = persistableEffectFills(fills);
    for (const key of effectFillStorageKeys(shaderId)) {
      map[key] = stored;
    }
    storage?.setItem(EFFECT_FILL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage can be unavailable in private contexts; fill memory still works.
  }
}

export function writeEffectFill(
  shaderId,
  fill,
  storage = globalThis.localStorage,
) {
  writeEffectFills(shaderId, fill ? [fill] : [], storage);
}

export function lookupEffectFills(
  store,
  shaderId,
  storage = globalThis.localStorage,
) {
  if (store && shaderId) {
    for (const key of effectFillStorageKeys(shaderId)) {
      if (store.has(key)) return normalizeEffectFills(store.get(key));
    }
  }
  return readEffectFills(shaderId, storage);
}

export function lookupEffectFill(
  store,
  shaderId,
  storage = globalThis.localStorage,
) {
  return lookupEffectFills(store, shaderId, storage)[0] || null;
}

export function rememberEffectFills(
  store,
  shaderId,
  fills,
  storage = globalThis.localStorage,
) {
  if (!shaderId) return;
  const normalized = normalizeEffectFills(fills);
  if (store) {
    for (const key of effectFillStorageKeys(shaderId)) {
      store.set(key, normalized);
    }
  }
  writeEffectFills(shaderId, normalized, storage);
}

export function rememberEffectFill(
  store,
  shaderId,
  fill,
  storage = globalThis.localStorage,
) {
  if (!fill) return;
  rememberEffectFills(store, shaderId, [fill], storage);
}

function effectFillStackIsLive(fills) {
  return fills.some(effectFillIsLive);
}

function effectFillStackIsDurable(fills) {
  return fills.some(effectFillIsDurable);
}

function isLegacyDefaultSample(fills, sampleUrls) {
  if (fills.length !== 1 || !sampleUrls.image) return false;
  const fill = fills[0];
  return (
    fill?.paint?.type === "image" &&
    fill.paint.image?.url === sampleUrls.image
  );
}

export function resolveSessionEffectFills({
  sessionId,
  store = null,
  fallbackSource = "image",
  storage = globalThis.localStorage,
  sampleUrls = {},
  documentFills = null,
  documentFill = null,
  documentAuthoritative = false,
} = {}) {
  let memoryFills = [];
  let memoryFound = false;
  if (store && sessionId) {
    for (const key of effectFillStorageKeys(sessionId)) {
      if (store.has(key)) {
        memoryFound = true;
        memoryFills = normalizeEffectFills(store.get(key));
        break;
      }
    }
  }
  const stored = storedEffectFills(sessionId, storage);
  const storedFills = stored.fills;
  const documentFillsProvided =
    Array.isArray(documentFills) ||
    Boolean(documentFill && typeof documentFill === "object");
  const resolvedDocumentFills = normalizeEffectFills(
    Array.isArray(documentFills)
      ? documentFills
      : documentFill
        ? [documentFill]
        : [],
  );
  const storedDefaultPhoto = isLegacyDefaultSample(storedFills, sampleUrls);
  if (documentAuthoritative && documentFillsProvided) {
    return resolvedDocumentFills;
  }
  // Empty and missing are different states: an explicitly stored empty stack
  // means the user removed the final fill and must not trigger the sample
  // fallback on navigation or refresh.
  if (memoryFound && memoryFills.length === 0) return [];
  if (stored.found && storedFills.length === 0) return [];
  if (
    documentFillsProvided &&
    resolvedDocumentFills.length === 0 &&
    !stored.found
  ) {
    return [];
  }
  const fallback = () => {
    if (fallbackSource === "vector") {
      const fill = fillFromInputSource("vector");
      const paint = paintForInputSource("vector", sampleUrls);
      return [normalizeEffectFills([paint ? { ...fill, paint } : fill])[0]];
    }
    const fill = fillFromInputSource(fallbackSource);
    const paint = paintForInputSource(fallbackSource, sampleUrls);
    return [normalizeEffectFills([paint ? { ...fill, paint } : fill])[0]];
  };
  if (effectFillStackIsLive(memoryFills)) return memoryFills;
  if (
    effectFillStackIsDurable(resolvedDocumentFills) &&
    (!effectFillStackIsDurable(storedFills) || storedDefaultPhoto)
  ) {
    return resolvedDocumentFills;
  }
  if (effectFillStackIsDurable(storedFills) && !storedDefaultPhoto) {
    return storedFills;
  }
  if (effectFillStackIsDurable(resolvedDocumentFills)) {
    return resolvedDocumentFills;
  }
  return fallback();
}

export function resolveSessionEffectFill(options = {}) {
  return resolveSessionEffectFills(options)[0] || null;
}
