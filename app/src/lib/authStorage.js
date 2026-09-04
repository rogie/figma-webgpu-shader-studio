import { stripPersistedDraftThumbnails } from "./draftStorage.js";

const LIBRARY_SESSION_CACHE_PREFIX =
  "figma-shader-studio:library-session:";

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function isStorageQuotaError(error) {
  return (
    error?.name === "QuotaExceededError" ||
    error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error?.code === 22 ||
    error?.code === 1014
  );
}

function storageKeys(storage) {
  const keys = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key === "string") keys.push(key);
    }
  } catch {
    // Storage cleanup is best-effort.
  }
  return keys;
}

export function reclaimRegenerableStorage(
  storage = defaultStorage(),
) {
  if (!storage) return { thumbnails: 0, caches: 0 };
  const thumbnails = stripPersistedDraftThumbnails(storage);
  let caches = 0;
  for (const key of storageKeys(storage)) {
    if (!key.startsWith(LIBRARY_SESSION_CACHE_PREFIX)) continue;
    try {
      storage.removeItem(key);
      caches += 1;
    } catch {
      // Keep trying other regenerable entries.
    }
  }
  return { thumbnails, caches };
}

function persistentSessionError(cause) {
  const error = new Error(
    "Browser storage is full, so Shader Studio could not keep you signed in. Remove old local drafts or chat history, then sign in again.",
  );
  error.name = "AuthSessionStorageError";
  error.code = "auth_session_storage_full";
  error.cause = cause;
  return error;
}

export function createResilientAuthStorage(
  storage = defaultStorage(),
) {
  if (!storage) return null;
  return {
    getItem(key) {
      return storage.getItem(key);
    },
    setItem(key, value) {
      try {
        storage.setItem(key, value);
      } catch (error) {
        if (!isStorageQuotaError(error)) throw error;
        reclaimRegenerableStorage(storage);
        try {
          storage.setItem(key, value);
        } catch (retryError) {
          if (!isStorageQuotaError(retryError)) throw retryError;
          throw persistentSessionError(retryError);
        }
      }
    },
    removeItem(key) {
      storage.removeItem(key);
    },
  };
}
