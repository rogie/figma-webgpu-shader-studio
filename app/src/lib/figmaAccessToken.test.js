import assert from "node:assert/strict";
import test from "node:test";
import {
  getFigmaOAuthSession,
  setFigmaOAuthSession,
} from "./figmaAccessToken.js";
import { DRAFTS_STORAGE_KEY } from "./draftStorage.js";

const FIGMA_TOKEN_STORAGE_KEY = "shader-studio.figmaAccessToken";

function quotaStorage(initial, quota) {
  const values = new Map(Object.entries(initial));
  const size = (entries) =>
    [...entries].reduce(
      (total, [key, value]) => total + key.length + String(value).length,
      0,
    );
  return {
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

test("saving a Figma session reclaims draft thumbnails when storage is full", () => {
  const draftSource = "export function render() {}";
  const persistedDrafts = JSON.stringify([
    {
      id: "draft:one",
      name: "One",
      kind: "fill",
      source: draftSource,
      values: { amount: 2 },
      thumbnail: `data:image/png;base64,${"x".repeat(2000)}`,
    },
  ]);
  const initial = { [DRAFTS_STORAGE_KEY]: persistedDrafts };
  const initialSize =
    DRAFTS_STORAGE_KEY.length + persistedDrafts.length;
  const storage = quotaStorage(initial, initialSize + 32);
  const previousStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let changeEvents = 0;

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      dispatchEvent() {
        changeEvents += 1;
      },
    },
  });

  try {
    setFigmaOAuthSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      userId: "user-id",
    });

    assert.equal(getFigmaOAuthSession().accessToken, "access-token");
    assert.equal(
      JSON.parse(storage.getItem(DRAFTS_STORAGE_KEY))[0].thumbnail,
      null,
    );
    assert.equal(
      JSON.parse(storage.getItem(DRAFTS_STORAGE_KEY))[0].source,
      draftSource,
    );
    assert.ok(storage.getItem(FIGMA_TOKEN_STORAGE_KEY));
    assert.equal(changeEvents, 1);
  } finally {
    if (previousStorage) {
      Object.defineProperty(globalThis, "localStorage", previousStorage);
    } else {
      delete globalThis.localStorage;
    }
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      delete globalThis.window;
    }
  }
});
