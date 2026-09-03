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

function validPresentSessionId(value) {
  return typeof value === "string" && SESSION_PATTERN.test(value);
}
