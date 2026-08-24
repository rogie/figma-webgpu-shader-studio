import { inferFeatures } from "../runtime/params.js";
import { isPaintFillType } from "./paintFill.js";

export const COMPOSITION_KIND = "composition";
export const COMPOSITION_FILL_ID = "fill";
export const MAX_COMPOSITION_FILLS = 8;
export const MAX_COMPOSITION_EFFECTS = 8;
export const FILL_TYPES = ["shader", "image", "video", "html"];

export function isLibraryKind(kind) {
  return kind === "effect" || kind === "fill" || kind === COMPOSITION_KIND;
}

export function libraryKind(kind) {
  if (kind === "fill") return "fill";
  if (kind === COMPOSITION_KIND) return COMPOSITION_KIND;
  return "effect";
}

export function hasCompositionGraph(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    Array.isArray(value.fills) ||
    Object.prototype.hasOwnProperty.call(value, "fill") ||
    Array.isArray(value.effects)
  );
}

export function resolvedLibraryKind(shader) {
  if (
    shader?.kind === COMPOSITION_KIND ||
    hasCompositionGraph(shader?.composition)
  ) {
    return COMPOSITION_KIND;
  }
  return libraryKind(shader?.kind);
}

export function emptyFill() {
  return {
    id: crypto.randomUUID(),
    type: "none",
    shaderId: null,
    values: {},
    enabled: true,
  };
}

export function emptyComposition() {
  const fill = {
    id: COMPOSITION_FILL_ID,
    type: "image",
    shaderId: null,
    values: {},
    enabled: true,
  };
  return {
    fills: [fill],
    fill,
    effects: [],
  };
}

export function hasCompositionFill(fill) {
  return FILL_TYPES.includes(fill?.type);
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

export function compositionRefAliases(shaderId) {
  const parsed = parseCompositionShaderId(shaderId);
  if (!parsed) return [];
  const bare = String(parsed.id || "").replace(/^(cloud:|draft:)/, "");
  return [
    ...new Set(
      [
        shaderId,
        parsed.key,
        parsed.id,
        bare,
        bare ? `cloud:${bare}` : null,
        bare ? `draft:${bare}` : null,
      ].filter(Boolean)
    ),
  ];
}

// Compositions store ids only. Resolve the live shader, never a copied snapshot.
export function readReferencedShader(
  shaderId,
  { session = null, drafts = [], liveByKey = null } = {}
) {
  const aliases = compositionRefAliases(shaderId);
  if (
    session?.source &&
    session.kind &&
    session.kind !== COMPOSITION_KIND
  ) {
    const sessionIds = [
      session.presetId,
      session.id,
      session.key,
    ].filter(Boolean);
    if (
      sessionIds.some((id) =>
        compositionRefAliases(id).some((alias) => aliases.includes(alias))
      )
    ) {
      return session;
    }
  }
  for (const alias of aliases) {
    const live = storeGet(liveByKey, alias);
    if (live?.source) return live;
  }
  const draft = (drafts || []).find((item) => aliases.includes(item.id));
  if (draft?.source) return draft;
  return null;
}

function normalizeFill(fill, fallbackId = null) {
  const type =
    fill?.type === "none"
      ? "none"
      : FILL_TYPES.includes(fill?.type)
        ? fill.type
        : "image";
  const parsed = parseCompositionShaderId(fill?.shaderId);
  const values =
    fill?.values && typeof fill.values === "object" && !Array.isArray(fill.values)
      ? fill.values
      : {};
  const paint =
    fill?.paint &&
    typeof fill.paint === "object" &&
    !Array.isArray(fill.paint) &&
    typeof fill.paint.type === "string"
      ? fill.paint
      : null;
  return {
    id:
      typeof fill?.id === "string" && fill.id
        ? fill.id
        : fallbackId || crypto.randomUUID(),
    type,
    shaderId: parsed?.key ?? null,
    values,
    enabled: fill?.enabled !== false,
    ...(type !== "shader" && paint ? { paint } : {}),
  };
}

function normalizeFills(fills, fallbackId = null) {
  const seen = new Set();
  return (fills || []).slice(0, MAX_COMPOSITION_FILLS).map((fill, index) => {
    let normalized = normalizeFill(fill, index === 0 ? fallbackId : null);
    while (seen.has(normalized.id)) {
      normalized = { ...normalized, id: crypto.randomUUID() };
    }
    seen.add(normalized.id);
    return normalized;
  });
}

function withFillAlias(graph, fills) {
  return { ...graph, fills, fill: fills[0] };
}

export function firstFillShaderKey(cards = []) {
  const card = (cards || []).find((item) => item?.key && item.kind !== "effect");
  return card?.key ?? null;
}

export function resolveShaderFillKey(shaderId, cards = []) {
  const aliases = new Set(compositionRefAliases(shaderId));
  if (aliases.size) {
    const match = (cards || []).find((item) => aliases.has(item?.key));
    if (match?.key) return match.key;
  }
  return firstFillShaderKey(cards);
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
  const hasExplicitFills = Array.isArray(graph.fills);
  const hasLegacyFill = Object.prototype.hasOwnProperty.call(graph, "fill");
  const fills = hasExplicitFills
    ? normalizeFills(graph.fills)
    : hasLegacyFill
      ? normalizeFills([graph.fill], COMPOSITION_FILL_ID)
      : normalizeFills(emptyComposition().fills);
  const effects = Array.isArray(graph.effects)
    ? graph.effects.map(normalizeEffect).filter((effect) => effect.shaderId)
    : [];
  return withFillAlias(
    {
      effects: effects.slice(0, MAX_COMPOSITION_EFFECTS),
    },
    fills
  );
}

export function reorderCompositionFills(graph, oldIndex, newIndex) {
  const normalized = normalizeComposition(graph);
  const count = normalized.fills.length;
  if (
    !Number.isInteger(oldIndex) ||
    !Number.isInteger(newIndex) ||
    oldIndex === newIndex ||
    oldIndex < 0 ||
    newIndex < 0 ||
    oldIndex >= count ||
    newIndex >= count
  ) {
    return normalized;
  }
  const fills = normalized.fills.slice();
  const [moved] = fills.splice(oldIndex, 1);
  fills.splice(newIndex, 0, moved);
  return withFillAlias(normalized, fills);
}

export function reorderCompositionEffects(graph, oldIndex, newIndex) {
  const normalized = normalizeComposition(graph);
  const count = normalized.effects.length;
  if (
    !Number.isInteger(oldIndex) ||
    !Number.isInteger(newIndex) ||
    oldIndex === newIndex ||
    oldIndex < 0 ||
    newIndex < 0 ||
    oldIndex >= count ||
    newIndex >= count
  ) {
    return normalized;
  }
  const effects = normalized.effects.slice();
  const [moved] = effects.splice(oldIndex, 1);
  effects.splice(newIndex, 0, moved);
  return { ...normalized, effects };
}

export function referencedShaderKeys(graph) {
  const normalized = normalizeComposition(graph);
  const keys = [];
  for (const fill of normalized.fills) {
    if (fill.type === "shader" && fill.shaderId) {
      keys.push(fill.shaderId);
    }
  }
  for (const effect of normalized.effects) {
    if (effect.shaderId) keys.push(effect.shaderId);
  }
  return [...new Set(keys)];
}

function storeGet(store, key) {
  if (!store || !key) return null;
  return typeof store.get === "function" ? store.get(key) : store[key];
}

export function compositionLayerShaderId(graph, layerId) {
  const normalized = normalizeComposition(graph);
  const fill = normalized.fills.find((item) => item.id === layerId);
  if (fill) {
    return fill.type === "shader" ? fill.shaderId : null;
  }
  return (
    normalized.effects.find((effect) => effect.id === layerId)?.shaderId ?? null
  );
}

export function resolveReferencedShaderSource(
  shaderId,
  { session = null, drafts = [], liveByKey = null, resolvedByKey = null } = {}
) {
  const live = readReferencedShader(shaderId, { session, drafts, liveByKey });
  if (live?.source) return live.source;
  return resolvedCompositionEntry(resolvedByKey, shaderId)?.source || null;
}

function resolvedCompositionEntry(store, shaderId) {
  const parsed = parseCompositionShaderId(shaderId);
  const id = parsed?.id || shaderId;
  const bare = String(id || "").replace(/^(cloud:|draft:)/, "");
  return (
    storeGet(store, shaderId) ||
    storeGet(store, parsed?.key) ||
    storeGet(store, id) ||
    storeGet(store, bare ? `cloud:${bare}` : null) ||
    storeGet(store, bare ? `draft:${bare}` : null) ||
    storeGet(store, bare) ||
    null
  );
}

export function compositionLayerName(
  shaderId,
  resolvedByKey = new Map(),
  cards = [],
  fallback = ""
) {
  const resolved = resolvedCompositionEntry(resolvedByKey, shaderId);
  if (resolved?.broken) return resolved.name || "Missing shader";
  if (resolved?.name) return resolved.name;
  const aliases = new Set(compositionRefAliases(shaderId));
  const card = (cards || []).find((item) => aliases.has(item?.key));
  return card?.name || fallback;
}

export function serializeCompositionExport(
  graph,
  resolvedByKey = new Map(),
  liveByKey = null
) {
  const normalized = normalizeComposition(graph);
  const layers = [];
  const pushLayer = (id, role, shaderId, values, enabled) => {
    if (!shaderId) return;
    const live = resolvedCompositionEntry(liveByKey, shaderId);
    const resolved = resolvedCompositionEntry(resolvedByKey, shaderId);
    const source = live?.source || resolved?.source;
    const broken = live ? live.broken : resolved?.broken;
    if (!source || broken) return;
    layers.push({
      id,
      role,
      enabled: enabled !== false,
      source,
      params: values && typeof values === "object" ? values : {},
    });
  };

  for (const fill of normalized.fills.slice().reverse()) {
    if (fill.enabled && fill.type === "shader") {
      pushLayer(
        fill.id,
        "fill",
        fill.shaderId,
        fill.values,
        true
      );
    }
  }
  for (const effect of normalized.effects) {
    pushLayer(
      effect.id,
      "effect",
      effect.shaderId,
      effect.values,
      effect.enabled
    );
  }

  const topmostEnabledFill = normalized.fills.find(
    (fill) => fill.enabled
  );
  return {
    isFill: topmostEnabledFill?.type === "shader",
    fillType: topmostEnabledFill?.type || "none",
    layers,
  };
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
      ? normalized.fills.every((fill) => {
          if (fill.type !== "shader") return true;
          const resolved = resolvedByKey.get(fill.shaderId);
          return !resolved || resolved.kind === "fill";
        }) &&
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
  for (const compositionFill of normalized.fills) {
    if (!compositionFill.enabled) continue;
    if (compositionFill.type === "video") return true;
    if (
      compositionFill.paint?.type === "video" ||
      compositionFill.paint?.type === "webcam"
    ) {
      return true;
    }
    if (compositionFill.type === "shader" && compositionFill.shaderId) {
      const fill = resolvedByKey.get(compositionFill.shaderId);
      if (fill && fill.kind !== COMPOSITION_KIND && resolvedFeatures(fill).isAnimated) {
        return true;
      }
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
  for (const fill of normalized.fills) {
    if (fill.enabled && fill.type === "shader" && fill.shaderId) {
      consider(fill.shaderId);
    }
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

function liveCloudId(shaderId) {
  const parsed = parseCompositionShaderId(shaderId);
  if (!parsed) return null;
  if (parsed.origin === "cloud") return parsed.id;
  return parsed.id.startsWith("draft:")
    ? parsed.id.slice("draft:".length)
    : parsed.id;
}

function cloudShaderById(liveCloudShaders, id) {
  if (!id) return null;
  if (liveCloudShaders instanceof Map) return liveCloudShaders.get(id) || null;
  let match = null;
  for (const row of liveCloudShaders || []) {
    if (row?.id !== id) continue;
    if (row.is_public === true) return row;
    match = row;
  }
  return match;
}

export function promoteCompositionRefs(graph, liveCloudShaders = []) {
  const normalized = normalizeComposition(graph);
  const promote = (shaderId) => {
    const cloudId = liveCloudId(shaderId);
    if (!cloudId || !cloudShaderById(liveCloudShaders, cloudId)) return shaderId;
    return `cloud:${cloudId}`;
  };
  const fills = normalized.fills.map((fill) => ({
    ...fill,
    shaderId: fill.shaderId ? promote(fill.shaderId) : null,
  }));
  return withFillAlias(
    {
      ...normalized,
      effects: normalized.effects.map((effect) => ({
        ...effect,
        shaderId: promote(effect.shaderId),
      })),
    },
    fills
  );
}

export function unpublishedCompositionRefs(
  graph,
  resolvedByKey = new Map(),
  liveCloudShaders = [],
) {
  return referencedShaderKeys(graph).filter((key) => {
    const cloudId = liveCloudId(key);
    const live = cloudShaderById(liveCloudShaders, cloudId);
    const resolved = resolvedCompositionEntry(resolvedByKey, key);
    if (live?.is_public === true || resolved?.is_public === true) return false;
    if (!live && !resolved) return true;
    return live?.is_public === false || resolved?.is_public === false;
  });
}

export function unpublishedCompositionLabels(
  keys,
  resolvedByKey = new Map(),
  liveCloudShaders = [],
) {
  return (keys || []).map((key) => {
    const resolved = resolvedCompositionEntry(resolvedByKey, key);
    const live = cloudShaderById(liveCloudShaders, liveCloudId(key));
    return resolved?.name || live?.name || key;
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
    fills: normalized.fills.map((fill) => ({
      id: fill.id,
      type: fill.type,
      shaderId: fill.shaderId,
      enabled: fill.enabled,
      ...(fill.paint ? { paint: fill.paint } : {}),
    })),
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

export function readEffectFillFromComposition(composition) {
  return readEffectFillsFromComposition(composition)[0] || null;
}

export function readEffectFillsFromComposition(composition) {
  if (Array.isArray(composition?.effectFills)) {
    return normalizeComposition({ fills: composition.effectFills }).fills;
  }
  const stored = composition?.effectFill;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return [];
  }
  return [normalizeComposition({ fill: stored }).fill];
}

export function effectFillComposition(fill) {
  const effectFill = normalizeComposition({ fill }).fill;
  return { effectFills: [effectFill], effectFill };
}

export function fillFromInputSource(inputSource) {
  const type =
    inputSource === "html" ? "html" : mediaFillType(inputSource) || "image";
  return { type, shaderId: null, values: {}, enabled: true };
}

export function paintForInputSource(inputSource, urls = {}) {
  if (inputSource === "video" && urls.video) {
    return { type: "video", video: { url: urls.video, scaleMode: "fill" } };
  }
  if (inputSource === "vector" && urls.vector) {
    return { type: "image", image: { url: urls.vector, scaleMode: "fill" } };
  }
  if (urls.image) {
    return { type: "image", image: { url: urls.image, scaleMode: "fill" } };
  }
  return null;
}

export function compositionPaintFill(graph) {
  const normalized = normalizeComposition(graph);
  const fill = normalized.fills.find(
    (item) =>
      item.enabled &&
      item.type !== "shader" &&
      item.type !== "html" &&
      isPaintFillType(item.paint?.type)
  );
  return fill?.paint || null;
}

export function sessionInputPlan({
  kind,
  graph = null,
  media = null,
  cloudShader = null,
  effectPaint = null,
  inputSource = null,
} = {}) {
  if (kind === COMPOSITION_KIND) {
    const normalized = normalizeComposition(graph);
    if (media) return { action: "media", media };
    if (cloudShader?.input_path) {
      return { action: "download", shader: cloudShader };
    }
    const paint = compositionPaintFill(normalized);
    if (paint) return { action: "paint", paint };
    if (
      normalized.fills.some(
        (fill) => fill.enabled && fill.type === "shader"
      )
    ) {
      return { action: "clear" };
    }
    return { action: "preferred" };
  }
  if (kind !== "effect") return { action: "clear" };
  if (media) return { action: "media", media };
  if (cloudShader?.input_path) {
    return { action: "download", shader: cloudShader };
  }
  if (inputSource === "html") {
    return { action: "preferred" };
  }
  if (isPaintFillType(effectPaint?.type)) {
    return { action: "paint", paint: effectPaint };
  }
  return { action: "preferred" };
}

export function fillTypeForDroppedMedia(mimeType) {
  if (typeof mimeType !== "string" || !mimeType) return null;
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  return null;
}
