export const PRESENT_QUERY_PARAM = "present";
export const PRESENT_MESSAGE_VERSION = 1;

const CHANNEL_PREFIX = "figma-shader-studio:present:";
const SESSION_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function createPresentSessionId(randomUUID = globalThis.crypto?.randomUUID) {
  if (typeof randomUUID !== "function") {
    throw new Error("This browser cannot create a presentation session.");
  }
  return randomUUID.call(globalThis.crypto).replaceAll("-", "");
}

export function presentChannelName(sessionId) {
  if (!validPresentSessionId(sessionId)) {
    throw new TypeError("Invalid presentation session ID.");
  }
  return `${CHANNEL_PREFIX}${sessionId}`;
}

export function makePresentUrl(embedUrl, sessionId) {
  if (!validPresentSessionId(sessionId)) {
    throw new TypeError("Invalid presentation session ID.");
  }
  const url = new URL(embedUrl);
  url.searchParams.set(PRESENT_QUERY_PARAM, sessionId);
  return url.toString();
}

export function readPresentSessionId(locationLike = globalThis.location) {
  const value = new URLSearchParams(locationLike?.search || "").get(
    PRESENT_QUERY_PARAM,
  );
  return validPresentSessionId(value) ? value : null;
}

export function presentMessage(type, payload = undefined) {
  return {
    version: PRESENT_MESSAGE_VERSION,
    type,
    ...(payload === undefined ? {} : { payload }),
  };
}

export function isPresentMessage(value, type) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.version === PRESENT_MESSAGE_VERSION &&
      value.type === type,
  );
}

function stripLayerValues(layers) {
  return Array.isArray(layers)
    ? layers.map(({ values: _values, ...layer }) => layer)
    : layers;
}

function stripCompositionValues(composition) {
  if (!composition || typeof composition !== "object") return composition;
  return {
    ...composition,
    fills: stripLayerValues(composition.fills),
    effects: stripLayerValues(composition.effects),
    effectFills: stripLayerValues(composition.effectFills),
  };
}

export function presentStructureKey(payload) {
  const documentState = payload?.document || {};
  const {
    parameterValues: _parameterValues,
    composition,
    effectFills,
    ...structuralDocument
  } = documentState;
  const pendingMedia = payload?.pendingMedia;
  return JSON.stringify({
    id: payload?.id || null,
    sessionId: payload?.sessionId || null,
    document: {
      ...structuralDocument,
      composition: stripCompositionValues(composition),
      effectFills: stripLayerValues(effectFills),
    },
    pendingMedia: pendingMedia
      ? {
          name: pendingMedia.name || "",
          type: pendingMedia.type || "",
          size: Number(pendingMedia.size) || 0,
          lastModified: Number(pendingMedia.lastModified) || 0,
        }
      : null,
  });
}

export function presentParameterLayers(payload) {
  const documentState = payload?.document || {};
  const composition = documentState.composition || {};
  const layers = [
    ...(Array.isArray(composition.fills) ? composition.fills : []),
    ...(Array.isArray(composition.effects) ? composition.effects : []),
    ...(Array.isArray(composition.effectFills)
      ? composition.effectFills
      : []),
    ...(Array.isArray(documentState.effectFills)
      ? documentState.effectFills
      : []),
  ];
  return layers
    .filter((layer) => layer?.id)
    .map((layer) => ({ id: layer.id, values: layer.values || {} }));
}

function validPresentSessionId(value) {
  return typeof value === "string" && SESSION_PATTERN.test(value);
}
