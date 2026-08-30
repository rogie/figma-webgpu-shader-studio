export const PROFILE_HANDLE_MIN_LENGTH = 3;
export const PROFILE_HANDLE_MAX_LENGTH = 30;

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const RESERVED_HANDLES = new Set([
  "admin",
  "api",
  "composer",
  "embed",
  "figma",
  "login",
  "me",
  "profile",
  "settings",
  "shader",
  "sign-in",
  "signup",
]);

export function normalizeProfileHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

export function profileHandleError(value) {
  const handle = normalizeProfileHandle(value);
  if (
    handle.length < PROFILE_HANDLE_MIN_LENGTH ||
    handle.length > PROFILE_HANDLE_MAX_LENGTH
  ) {
    return `Handle must be ${PROFILE_HANDLE_MIN_LENGTH}–${PROFILE_HANDLE_MAX_LENGTH} characters.`;
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return "Use lowercase letters, numbers, and hyphens; start and end with a letter or number.";
  }
  if (RESERVED_HANDLES.has(handle)) return "That handle is reserved.";
  return "";
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

export function profileRouteIdentifier(profile) {
  return profile?.handle || profile?.id || "";
}
