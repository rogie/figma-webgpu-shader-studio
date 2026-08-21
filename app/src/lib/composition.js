import { inferFeatures } from "../runtime/params.js";

export const COMPOSITION_KIND = "composition";
export const COMPOSITION_FILL_ID = "fill";
export const MAX_COMPOSITION_EFFECTS = 8;
/** Hide compositions from library/create UI. Runtime and editor paths stay intact. */
export const COMPOSITIONS_UI_ENABLED = false;
export const FILL_TYPES = ["shader", "image", "video", "html"];

export function isLibraryKind(kind) {
  return kind === "effect" || kind === "fill" || kind === COMPOSITION_KIND;
}

export function libraryKind(kind) {
  if (kind === "fill") return "fill";
  if (kind === COMPOSITION_KIND) return COMPOSITION_KIND;
  return "effect";
}

export function emptyComposition() {
  return {
    fill: { type: "image", shaderId: null, values: {} },
    effects: [],
  };
}

export function compositionShaderKey(origin, id) {
  if (!id) return null;
  if (origin === "draft" || String(id).startsWith("draft:")) {
    return String(id).startsWith("draft:") ? id : `draft:${id}`;
  }
  const bare = String(id).startsWith("cloud:")
    ? String(id).slice("cloud:".length)
    : String(id);
  return `cloud:${bare}`;
}

export function parseCompositionShaderId(shaderId) {
  if (typeof shaderId !== "string" || !shaderId) return null;
  if (shaderId.startsWith("draft:")) {
    return { origin: "draft", id: shaderId, key: shaderId };
  }
  if (shaderId.startsWith("cloud:")) {
    const id = shaderId.slice("cloud:".length);
    return id ? { origin: "cloud", id, key: shaderId } : null;
  }
  return { origin: "cloud", id: shaderId, key: `cloud:${shaderId}` };
}

function normalizeFill(fill) {
  const type = FILL_TYPES.includes(fill?.type) ? fill.type : "image";
  const parsed = parseCompositionShaderId(fill?.shaderId);
  const values =
    fill?.values && typeof fill.values === "object" && !Array.isArray(fill.values)
      ? fill.values
      : {};
  return {
    type,
    shaderId: type === "shader" ? parsed?.key ?? null : null,
    values,
  };
}

function normalizeEffect(effect) {
  const parsed = parseCompositionShaderId(effect?.shaderId);
  const values =
    effect?.values && typeof effect.values === "object" && !Array.isArray(effect.values)
      ? effect.values
      : {};
  return {
    id:
      typeof effect?.id === "string" && effect.id
        ? effect.id
        : crypto.randomUUID(),
    shaderId: parsed?.key ?? null,
    values,
    enabled: effect?.enabled !== false,
  };
}

export function normalizeComposition(value) {
  const graph = value && typeof value === "object" ? value : {};
  const effects = Array.isArray(graph.effects)
    ? graph.effects.map(normalizeEffect).filter((effect) => effect.shaderId)
    : [];
  return {
    fill: normalizeFill(graph.fill),
    effects: effects.slice(0, MAX_COMPOSITION_EFFECTS),
  };
}

export function referencedShaderKeys(graph) {
  const normalized = normalizeComposition(graph);
  const keys = [];
  if (normalized.fill.type === "shader" && normalized.fill.shaderId) {
    keys.push(normalized.fill.shaderId);
  }
  for (const effect of normalized.effects) {
    if (effect.shaderId) keys.push(effect.shaderId);
  }
  return [...new Set(keys)];
}

export function compositionReferencesKind(graph, resolvedByKey, expectedKind) {
  const normalized = normalizeComposition(graph);
  const keys = referencedShaderKeys(normalized);
  return keys.every((key) => {
    const resolved = resolvedByKey.get(key);
    if (!resolved) return true;
    return resolved.kind !== COMPOSITION_KIND;
  }) && (
    expectedKind
      ? (normalized.fill.type !== "shader" ||
          !resolvedByKey.get(normalized.fill.shaderId) ||
          resolvedByKey.get(normalized.fill.shaderId).kind === "fill") &&
        normalized.effects.every((effect) => {
          const resolved = resolvedByKey.get(effect.shaderId);
          return !resolved || resolved.kind === "effect";
        })
      : true
  );
}

function resolvedFeatures(resolved) {
  if (resolved?.features && typeof resolved.features === "object") {
    return {
      isAnimated: Boolean(resolved.features.isAnimated),
      usesMouse: Boolean(resolved.features.usesMouse),
    };
  }
  if (typeof resolved?.source === "string" && resolved.source) {
    return inferFeatures(resolved.source);
  }
  return { isAnimated: false, usesMouse: false };
}

export function isCompositionPlayable(graph, resolvedByKey = new Map()) {
  const normalized = normalizeComposition(graph);
  if (normalized.fill.type === "video") return true;
  if (normalized.fill.type === "shader" && normalized.fill.shaderId) {
    const fill = resolvedByKey.get(normalized.fill.shaderId);
    if (fill && fill.kind !== COMPOSITION_KIND && resolvedFeatures(fill).isAnimated) {
      return true;
    }
  }
  return normalized.effects.some((effect) => {
    if (!effect.enabled || !effect.shaderId) return false;
    const resolved = resolvedByKey.get(effect.shaderId);
    if (!resolved || resolved.kind === COMPOSITION_KIND) return false;
    return resolvedFeatures(resolved).isAnimated;
  });
}

export function collectCompositionFeatures(graph, resolvedByKey = new Map()) {
  const normalized = normalizeComposition(graph);
  let usesMouse = false;
  const consider = (key) => {
    const resolved = resolvedByKey.get(key);
    if (!resolved || resolved.kind === COMPOSITION_KIND) return;
    if (resolvedFeatures(resolved).usesMouse) usesMouse = true;
  };
  if (normalized.fill.type === "shader" && normalized.fill.shaderId) {
    consider(normalized.fill.shaderId);
  }
  for (const effect of normalized.effects) {
    if (effect.enabled) consider(effect.shaderId);
  }
  return {
    isAnimated: isCompositionPlayable(normalized, resolvedByKey),
    usesMouse,
  };
}

export function mergeLayerValues(definitions, candidate = {}) {
  const values = {};
  for (const key of Object.keys(definitions || {})) {
    const def = definitions[key];
    const fallback = def ? def.defaultValue : undefined;
    if (Object.prototype.hasOwnProperty.call(candidate, key)) {
      values[key] = candidate[key];
    } else {
      values[key] =
        fallback && typeof fallback === "object"
          ? structuredClone(fallback)
          : fallback;
    }
  }
  return values;
}

export function unpublishedCompositionRefs(graph, resolvedByKey = new Map()) {
  return referencedShaderKeys(graph).filter((key) => {
    const resolved = resolvedByKey.get(key);
    if (!resolved) return true;
    return resolved.is_public === false;
  });
}

export function compositionsReferencing(shaderKey, compositions = []) {
  return compositions.filter((item) =>
    referencedShaderKeys(item.composition || item).includes(shaderKey)
  );
}

export function compositionStructureKey(graph) {
  const normalized = normalizeComposition(graph);
  return JSON.stringify({
    fill: {
      type: normalized.fill.type,
      shaderId: normalized.fill.shaderId,
    },
    effects: normalized.effects.map((effect) => ({
      id: effect.id,
      shaderId: effect.shaderId,
      enabled: effect.enabled,
    })),
  });
}

export function mediaFillType(fillType) {
  return fillType === "video" || fillType === "html" || fillType === "image"
    ? fillType
    : null;
}
