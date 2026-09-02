const CACHE_VERSION = 1;
const CACHE_PREFIX = "figma-shader-studio:library-session";

export const LIBRARY_THUMBNAIL_URL_TTL_MS = 50 * 60_000;

const LIBRARY_ROW_KEYS = [
  "id",
  "owner_id",
  "name",
  "description",
  "kind",
  "is_public",
  "thumbnail_path",
  "features",
  "figma_shader_id",
  "figma_shader_kind",
  "figma_shader_version",
  "state_revision",
  "versioned_state_revision",
  "created_at",
  "updated_at",
  "author_name",
  "author_avatar_url",
  "author_handle",
];

function cacheKey(scope) {
  return `${CACHE_PREFIX}:v${CACHE_VERSION}:${scope}`;
}

function defaultStorage() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function rowSignature(row) {
  return JSON.stringify(stableValue(sanitizeLibraryShader(row)));
}

export function libraryCacheScope(userId) {
  return userId ? `user:${userId}` : "anonymous";
}

export function sanitizeLibraryShader(shader) {
  if (!shader || typeof shader !== "object" || !shader.id) return null;
  const safe = {};
  for (const key of LIBRARY_ROW_KEYS) {
    if (shader[key] !== undefined) safe[key] = stableValue(shader[key]);
  }
  return safe;
}

export function sanitizeLibraryShaders(shaders) {
  return (Array.isArray(shaders) ? shaders : [])
    .map(sanitizeLibraryShader)
    .filter(Boolean);
}

export function reconcileLibraryShaders(current, incoming) {
  const previous = Array.isArray(current) ? current : [];
  const previousById = new Map(previous.map((row) => [row?.id, row]));
  const next = sanitizeLibraryShaders(incoming).map((row) => {
    const existing = previousById.get(row.id);
    return existing && rowSignature(existing) === rowSignature(row)
      ? existing
      : row;
  });
  return (
    next.length === previous.length &&
    next.every((row, index) => row === previous[index])
  )
    ? previous
    : next;
}

export function libraryRefreshIsCurrent(startEpoch, currentEpoch) {
  return startEpoch === currentEpoch;
}

export function readLibrarySessionCache({
  scope,
  storage = defaultStorage(),
  now = Date.now(),
} = {}) {
  if (!scope || !storage) return null;
  const key = cacheKey(scope);
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null");
    if (
      !parsed ||
      parsed.version !== CACHE_VERSION ||
      parsed.scope !== scope ||
      !Array.isArray(parsed.shaders)
    ) {
      return null;
    }
    const shaders = sanitizeLibraryShaders(parsed.shaders);
    const shaderById = new Map(shaders.map((shader) => [shader.id, shader]));
    const thumbnails = {};
    const thumbnailPaths = {};
    const thumbnailExpiries = {};
    for (const [id, entry] of Object.entries(parsed.thumbnails || {})) {
      const shader = shaderById.get(id);
      if (
        !shader ||
        !entry ||
        entry.path !== shader.thumbnail_path ||
        typeof entry.url !== "string" ||
        !entry.url ||
        !Number.isFinite(entry.expiresAt) ||
        entry.expiresAt <= now
      ) {
        continue;
      }
      thumbnails[id] = entry.url;
      thumbnailPaths[id] = entry.path;
      thumbnailExpiries[id] = entry.expiresAt;
    }
    return {
      shaders,
      thumbnails,
      thumbnailPaths,
      thumbnailExpiries,
      savedAt: Number(parsed.savedAt) || 0,
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // An unavailable session cache should never block the live library.
    }
    return null;
  }
}

export function writeLibrarySessionCache({
  scope,
  shaders,
  thumbnails = {},
  thumbnailPaths = {},
  thumbnailExpiries = {},
  storage = defaultStorage(),
  now = Date.now(),
} = {}) {
  if (!scope || !storage) return false;
  const safeShaders = sanitizeLibraryShaders(shaders);
  const entries = {};
  for (const shader of safeShaders) {
    const id = shader.id;
    const path = thumbnailPaths[id] || shader.thumbnail_path;
    const url = thumbnails[id];
    const expiresAt = Number(thumbnailExpiries[id]) || 0;
    if (
      path &&
      path === shader.thumbnail_path &&
      typeof url === "string" &&
      url &&
      expiresAt > now
    ) {
      entries[id] = { path, url, expiresAt };
    }
  }
  try {
    storage.setItem(
      cacheKey(scope),
      JSON.stringify({
        version: CACHE_VERSION,
        scope,
        savedAt: now,
        shaders: safeShaders,
        thumbnails: entries,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
