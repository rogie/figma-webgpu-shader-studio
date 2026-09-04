import assert from "node:assert/strict";
import test from "node:test";
import {
  createResilientAuthStorage,
  reclaimRegenerableStorage,
} from "./authStorage.js";
import { DRAFTS_STORAGE_KEY } from "./draftStorage.js";

const LIBRARY_CACHE_KEY =
  "figma-shader-studio:library-session:v2:user:user-1";
const CHAT_STORAGE_KEY = "shader-studio.chatThreads.v1";

function memoryStorage(initial = {}, quota = Number.POSITIVE_INFINITY) {
  const values = new Map(
    Object.entries(initial).map(([key, value]) => [key, String(value)]),
  );
  const size = (entries) =>
    [...entries].reduce(
      (total, [key, value]) => total + key.length + value.length,
      0,
    );
  return {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      const next = new Map(values);
      next.set(key, String(value));
      if (size(next) > quota) {
        const error = new Error("Storage quota exceeded");
        error.name = "QuotaExceededError";
        throw error;
      }
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("reclaims previews and caches without deleting user content", () => {
  const source = "export function render() {}";
  const storage = memoryStorage({
    [DRAFTS_STORAGE_KEY]: JSON.stringify([
      {
        id: "draft:one",
        name: "One",
        kind: "fill",
        source,
        thumbnail: "data:image/png;base64,preview",
      },
    ]),
    [LIBRARY_CACHE_KEY]: JSON.stringify({ shaders: [] }),
    [CHAT_STORAGE_KEY]: JSON.stringify({ thread: [{ content: "Keep me" }] }),
  });

  assert.deepEqual(reclaimRegenerableStorage(storage), {
    thumbnails: 1,
    caches: 1,
  });
  const [draft] = JSON.parse(storage.getItem(DRAFTS_STORAGE_KEY));
  assert.equal(draft.source, source);
  assert.equal(draft.thumbnail, null);
  assert.equal(storage.getItem(LIBRARY_CACHE_KEY), null);
  assert.ok(storage.getItem(CHAT_STORAGE_KEY));
});

test("auth storage retries a session write after reclaiming space", () => {
  const persistedDrafts = JSON.stringify([
    {
      id: "draft:one",
      name: "One",
      kind: "fill",
      source: "shader source",
      thumbnail: `data:image/png;base64,${"x".repeat(2000)}`,
    },
  ]);
  const initial = {
    [DRAFTS_STORAGE_KEY]: persistedDrafts,
    [LIBRARY_CACHE_KEY]: "cached-library",
  };
  const initialSize = Object.entries(initial).reduce(
    (total, [key, value]) => total + key.length + value.length,
    0,
  );
  const storage = memoryStorage(initial, initialSize + 16);
  const authStorage = createResilientAuthStorage(storage);

  authStorage.setItem("sb-project-auth-token", "persisted-session");

  assert.equal(
    authStorage.getItem("sb-project-auth-token"),
    "persisted-session",
  );
  assert.equal(
    JSON.parse(storage.getItem(DRAFTS_STORAGE_KEY))[0].thumbnail,
    null,
  );
  assert.equal(storage.getItem(LIBRARY_CACHE_KEY), null);
});

test("auth storage reports when user content still fills storage", () => {
  const initial = {
    [CHAT_STORAGE_KEY]: "x".repeat(2000),
  };
  const initialSize = CHAT_STORAGE_KEY.length + initial[CHAT_STORAGE_KEY].length;
  const authStorage = createResilientAuthStorage(
    memoryStorage(initial, initialSize),
  );

  assert.throws(
    () => authStorage.setItem("sb-project-auth-token", "session"),
    {
      name: "AuthSessionStorageError",
      code: "auth_session_storage_full",
    },
  );
});
