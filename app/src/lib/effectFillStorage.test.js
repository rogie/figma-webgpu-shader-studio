import assert from "node:assert/strict";
import test from "node:test";
import {
  EFFECT_FILL_STORAGE_KEY,
  effectFillStorageKeys,
  lookupEffectFill,
  persistableEffectFill,
  readEffectFill,
  effectFillIsDurable,
  effectFillIsLive,
  rememberEffectFill,
  resolveSessionEffectFill,
  writeEffectFill,
} from "./effectFillStorage.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("effectFillStorageKeys aliases cloud ids without inventing drafts", () => {
  assert.deepEqual(effectFillStorageKeys("cloud:abc"), [
    "cloud:abc",
    "abc",
  ]);
  assert.deepEqual(effectFillStorageKeys("dither"), [
    "dither",
    "cloud:dither",
  ]);
  assert.deepEqual(effectFillStorageKeys("draft:one"), [
    "draft:one",
    "one",
  ]);
});

test("persistableEffectFill strips ephemeral media urls", () => {
  const stored = persistableEffectFill({
    type: "image",
    paint: {
      type: "image",
      image: { url: "blob:http://localhost/1", scaleMode: "fit" },
    },
  });
  assert.equal(stored.paint.image.url, undefined);
  assert.equal(stored.paint.image.scaleMode, "fit");
});

test("write and read effect fills across id aliases", () => {
  const storage = memoryStorage();
  writeEffectFill(
    "cloud:grain",
    {
      type: "image",
      paint: { type: "solid", color: "#ff0000" },
    },
    storage,
  );

  const stored = JSON.parse(storage.getItem(EFFECT_FILL_STORAGE_KEY));
  assert.equal(stored["cloud:grain"].paint.type, "solid");
  assert.equal(stored.grain.paint.color, "#ff0000");
  assert.equal(readEffectFill("grain", storage).paint.type, "solid");
  assert.equal(readEffectFill("cloud:grain", storage).paint.color, "#ff0000");
});

test("memory lookup wins over localStorage and keeps live blob urls", () => {
  const storage = memoryStorage();
  const store = new Map();
  const live = {
    type: "image",
    paint: {
      type: "image",
      image: { url: "blob:http://localhost/live", scaleMode: "fill" },
    },
  };
  writeEffectFill(
    "cloud:one",
    {
      type: "image",
      paint: { type: "solid", color: "#000" },
    },
    storage,
  );
  rememberEffectFill(store, "cloud:one", live, storage);

  const remembered = lookupEffectFill(store, "one", storage);
  assert.equal(remembered.paint.image.url, "blob:http://localhost/live");
  assert.equal(
    readEffectFill("cloud:one", storage).paint.image.url,
    undefined,
  );
});

test("resolveSessionEffectFill falls back to the input source type", () => {
  assert.deepEqual(
    resolveSessionEffectFill({
      sessionId: "missing",
      fallbackSource: "video",
      storage: memoryStorage(),
    }),
    {
      type: "video",
      shaderId: null,
      values: {},
      enabled: true,
    },
  );
});

test("resolveSessionEffectFill prefers a document fill over the default photo", () => {
  const storage = memoryStorage();
  writeEffectFill(
    "cloud:one",
    {
      type: "image",
      paint: { type: "image", image: { url: "/photo.png", scaleMode: "fill" } },
    },
    storage,
  );
  const resolved = resolveSessionEffectFill({
    sessionId: "cloud:one",
    fallbackSource: "image",
    storage,
    sampleUrls: { image: "/photo.png" },
    documentFill: {
      type: "image",
      paint: { type: "solid", color: "#ff0000" },
    },
  });
  assert.equal(resolved.paint.type, "solid");
  assert.equal(resolved.paint.color, "#ff0000");
});

test("effectFillIsLive allows blobs and effectFillIsDurable does not", () => {
  const live = {
    type: "image",
    paint: { type: "image", image: { url: "blob:http://localhost/1" } },
  };
  assert.equal(effectFillIsLive(live), true);
  assert.equal(effectFillIsDurable(live), false);
  assert.equal(
    effectFillIsDurable({
      type: "image",
      paint: { type: "solid", color: "#fff" },
    }),
    true
  );
  assert.equal(
    effectFillIsLive({
      type: "image",
      paint: { type: "image", image: { scaleMode: "fill" } },
    }),
    false
  );
});

test("resolveSessionEffectFill ignores stored paints with no usable url", () => {
  const storage = memoryStorage();
  writeEffectFill(
    "cloud:one",
    {
      type: "image",
      paint: { type: "image", image: { scaleMode: "fill" } },
    },
    storage,
  );
  const resolved = resolveSessionEffectFill({
    sessionId: "cloud:one",
    fallbackSource: "image",
    storage,
    sampleUrls: { image: "/photo.png" },
    documentFill: {
      type: "image",
      paint: {
        type: "image",
        image: { url: "blob:http://localhost/dead", scaleMode: "fill" },
      },
    },
  });
  assert.equal(resolved.paint.image.url, "/photo.png");
});

test("resolveSessionEffectFill maps vector onto an image paint", () => {
  const storage = memoryStorage();
  writeEffectFill(
    "cloud:grain",
    {
      type: "image",
      paint: { type: "image", image: { url: "/photo.png", scaleMode: "fill" } },
    },
    storage,
  );
  const mapped = resolveSessionEffectFill({
    sessionId: "cloud:grain",
    fallbackSource: "vector",
    storage,
    sampleUrls: { image: "/photo.png", vector: "/vector.svg" },
  });
  assert.equal(mapped.type, "image");
  assert.equal(mapped.paint.image.url, "/vector.svg");
});
