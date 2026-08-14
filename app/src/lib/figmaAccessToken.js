const STORAGE_KEY = "shader-studio.figmaAccessToken";
const CHANGE_EVENT = "shader-studio:figma-access-token";

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (typeof raw !== "string" || !raw.trim()) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Migrate the old personal-token string shape on the next write.
    }
    return { accessToken: raw.trim() };
  } catch {
    return null;
  }
}

function writeStore(session) {
  if (session?.accessToken) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** @returns {string} */
export function getFigmaAccessToken() {
  const token = readStore()?.accessToken;
  return typeof token === "string" ? token.trim() : "";
}

export function getFigmaOAuthSession() {
  const session = readStore();
  if (!session?.accessToken) return null;
  return {
    accessToken: String(session.accessToken),
    refreshToken:
      typeof session.refreshToken === "string" ? session.refreshToken : "",
    expiresAt:
      typeof session.expiresAt === "number" ? session.expiresAt : null,
    userId: typeof session.userId === "string" ? session.userId : null,
  };
}

export function setFigmaOAuthSession({
  accessToken,
  refreshToken,
  expiresIn,
  expiresAt,
  userId,
}) {
  const previous = readStore();
  const lifetime = Number(expiresIn);
  writeStore({
    accessToken: String(accessToken || "").trim(),
    refreshToken:
      typeof refreshToken === "string"
        ? refreshToken
        : previous?.refreshToken || "",
    expiresAt:
      typeof expiresAt === "number"
        ? expiresAt
        : Number.isFinite(lifetime)
          ? Date.now() + lifetime * 1000
          : null,
    userId:
      typeof userId === "string" ? userId : previous?.userId || null,
  });
}

export function clearFigmaAccessToken() {
  writeStore(null);
}

export function subscribeFigmaAccessToken(listener) {
  const onStorage = (event) => {
    if (event.key && event.key !== STORAGE_KEY) return;
    listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}
