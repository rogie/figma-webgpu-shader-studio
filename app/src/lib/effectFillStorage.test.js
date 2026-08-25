import assert from "node:assert/strict";
import test from "node:test";
import {
  EFFECT_FILL_STORAGE_KEY,
  effectFillStorageKeys,
  lookupEffectFill,
  lookupEffectFills,
  persistableEffectFill,
  persistableEffectFills,
  readEffectFill,
  readEffectFills,
  effectFillIsDurable,
  effectFillIsLive,
  rememberEffectFill,
  rememberEffectFills,
  resolveSessionEffectFill,
  resolveSessionEffectFills,
  writeEffectFill,
  writeEffectFills,
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

test("persistableEffectFill strips ephemeral video posters", () => {
  const stored = persistableEffectFill({
    type: "video",
    paint: {
      type: "video",
      video: {
        url: "https://cdn.example.com/input.mp4",
        poster: "blob:http://localhost/poster",
        scaleMode: "fill",
      },
    },
  });
  assert.equal(stored.paint.video.url, "https://cdn.example.com/input.mp4");
  assert.equal(stored.paint.video.poster, undefined);
  assert.equal(stored.paint.video.scaleMode, "fill");
});

test("persistableEffectFill keeps asset paths instead of expiring signed urls", () => {
  const stored = persistableEffectFills([
    {
      type: "image",
      paint: {
        type: "image",
        image: {
          url: "https://storage.example.com/signed-photo",
          assetPath: "owner/shader/fill-photo.png",
          scaleMode: "fit",
        },
      },
    },
    {
      type: "video",
      paint: {
        type: "video",
        video: {
          url: "https://storage.example.com/signed-video",
          assetPath: "owner/shader/fill-video.mp4",
          scaleMode: "fill",
        },
      },
    },
  ]);

  assert.equal(stored[0].paint.image.url, undefined);
  assert.equal(
    stored[0].paint.image.assetPath,
    "owner/shader/fill-photo.png",
  );
  assert.equal(stored[1].paint.video.url, undefined);
  assert.equal(
    stored[1].paint.video.assetPath,
    "owner/shader/fill-video.mp4",
  );
});

test("asset-backed media and live webcam intents are durable", () => {
  const assetVideo = {
    type: "video",
    paint: {
      type: "video",
      video: { assetPath: "owner/shader/fill-video.mp4" },
    },
  };
  const webcam = {
    type: "video",
    paint: {
      type: "webcam",
      webcam: { live: true, deviceId: "camera-1" },
    },
  };

  assert.equal(effectFillIsLive(assetVideo), true);
  assert.equal(effectFillIsDurable(assetVideo), true);
  assert.equal(effectFillIsLive(webcam), true);
  assert.equal(effectFillIsDurable(webcam), true);
});

test("persistableEffectFills strips ephemeral media independently across layers", () => {
  const stored = persistableEffectFills([
    {
      id: "photo",
      type: "image",
      values: { opacity: 0.5 },
      paint: {
        type: "image",
        image: { url: "blob:http://localhost/1", scaleMode: "fit" },
      },
    },
    {
      id: "movie",
      type: "video",
      paint: {
        type: "video",
        video: {
          url: "https://cdn.example.com/input.mp4",
          poster: "data:image/png;base64,poster",
          scaleMode: "fill",
        },
      },
    },
    {
      id: "remote-photo",
      type: "image",
      paint: {
        type: "image",
        image: { url: "https://cdn.example.com/photo.png", scaleMode: "tile" },
      },
    },
    {
      id: "local-movie",
      type: "video",
      paint: {
        type: "video",
        video: {
          url: "data:video/mp4;base64,input",
          poster: "https://cdn.example.com/poster.png",
          scaleMode: "fit",
        },
      },
    },
  ]);

  assert.deepEqual(stored.map((fill) => fill.id), [
    "photo",
    "movie",
    "remote-photo",
    "local-movie",
  ]);
  assert.equal(stored[0].paint.image.url, undefined);
  assert.equal(stored[0].paint.image.scaleMode, "fit");
  assert.deepEqual(stored[0].values, { opacity: 0.5 });
  assert.equal(stored[1].paint.video.url, "https://cdn.example.com/input.mp4");
  assert.equal(stored[1].paint.video.poster, undefined);
  assert.equal(stored[1].paint.video.scaleMode, "fill");
  assert.equal(
    stored[2].paint.image.url,
    "https://cdn.example.com/photo.png",
  );
  assert.equal(stored[3].paint.video.url, undefined);
  assert.equal(
    stored[3].paint.video.poster,
    "https://cdn.example.com/poster.png",
  );
  assert.equal(stored[3].paint.video.scaleMode, "fit");
});

test("readEffectFills migrates old singular object entries", () => {
  const storage = memoryStorage({
    [EFFECT_FILL_STORAGE_KEY]: JSON.stringify({
      "cloud:legacy": {
        type: "image",
        paint: { type: "solid", color: "#123456" },
      },
    }),
  });

  const fills = readEffectFills("legacy", storage);
  assert.equal(fills.length, 1);
  assert.equal(fills[0].id, "fill");
  assert.equal(fills[0].paint.color, "#123456");
  assert.equal(readEffectFill("cloud:legacy", storage).id, "fill");
});

test("writeEffectFills round-trips arrays across id aliases", () => {
  const storage = memoryStorage();
  writeEffectFills(
    "cloud:grain",
    [
      {
        id: "top",
        type: "image",
        paint: { type: "solid", color: "#ff0000" },
      },
      {
        id: "bottom",
        type: "shader",
        shaderId: "cloud:noise",
        values: { scale: 2 },
      },
    ],
    storage,
  );

  const stored = JSON.parse(storage.getItem(EFFECT_FILL_STORAGE_KEY));
  assert.equal(Array.isArray(stored["cloud:grain"]), true);
  assert.deepEqual(stored.grain.map((fill) => fill.id), ["top", "bottom"]);
  assert.equal(readEffectFill("grain", storage).paint.type, "solid");
  assert.deepEqual(
    readEffectFills("cloud:grain", storage).map((fill) => fill.id),
    ["top", "bottom"],
  );
  assert.deepEqual(readEffectFills("grain", storage)[1].values, { scale: 2 });
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

test("stack memory lookup wins and preserves order with live urls", () => {
  const storage = memoryStorage();
  const store = new Map();
  const live = [
    {
      id: "top",
      type: "image",
      paint: {
        type: "image",
        image: { url: "blob:http://localhost/live", scaleMode: "fill" },
      },
    },
    {
      id: "bottom",
      type: "image",
      paint: { type: "solid", color: "#000" },
    },
  ];

  rememberEffectFills(store, "cloud:one", live, storage);

  const remembered = lookupEffectFills(store, "one", storage);
  assert.deepEqual(remembered.map((fill) => fill.id), ["top", "bottom"]);
  assert.equal(remembered[0].paint.image.url, "blob:http://localhost/live");
  assert.equal(readEffectFills("cloud:one", storage)[0].paint.image.url, undefined);
  assert.equal(lookupEffectFill(store, "one", storage).id, "top");
});

test("resolveSessionEffectFill falls back to the input source type", () => {
  const resolved = resolveSessionEffectFill({
    sessionId: "missing",
    fallbackSource: "video",
    storage: memoryStorage(),
  });
  assert.equal(typeof resolved.id, "string");
  assert.deepEqual(resolved, {
    id: resolved.id,
    type: "video",
    shaderId: null,
    values: {},
    enabled: true,
  });
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

test("resolveSessionEffectFills prefers an ordered document stack over a legacy default sample", () => {
  const storage = memoryStorage();
  writeEffectFill(
    "cloud:one",
    {
      type: "image",
      paint: { type: "image", image: { url: "/photo.png", scaleMode: "fill" } },
    },
    storage,
  );
  const resolved = resolveSessionEffectFills({
    sessionId: "cloud:one",
    storage,
    sampleUrls: { image: "/photo.png" },
    documentFills: [
      {
        id: "document-top",
        type: "image",
        paint: { type: "image", image: { scaleMode: "fit" } },
      },
      {
        id: "document-bottom",
        type: "image",
        paint: { type: "gradient", stops: [] },
      },
    ],
  });

  assert.deepEqual(resolved.map((fill) => fill.id), [
    "document-top",
    "document-bottom",
  ]);
});

test("resolveSessionEffectFills restores asset-backed video and webcam document fills", () => {
  const resolved = resolveSessionEffectFills({
    sessionId: "cloud:media",
    storage: memoryStorage(),
    fallbackSource: "image",
    sampleUrls: { image: "/photo.png" },
    documentFills: [
      {
        id: "video",
        type: "video",
        paint: {
          type: "video",
          video: { assetPath: "owner/shader/fill-video.mp4" },
        },
      },
      {
        id: "webcam",
        type: "video",
        paint: {
          type: "webcam",
          webcam: { live: true, deviceId: "camera-1" },
        },
      },
    ],
  });

  assert.deepEqual(
    resolved.map((fill) => fill.id),
    ["video", "webcam"],
  );
  assert.equal(
    resolved[0].paint.video.assetPath,
    "owner/shader/fill-video.mp4",
  );
  assert.equal(resolved[1].paint.webcam.deviceId, "camera-1");
});

test("resolveSessionEffectFills keeps incomplete layers above durable stored fills", () => {
  const storage = memoryStorage();
  writeEffectFills(
    "cloud:one",
    [
      {
        id: "missing-media",
        type: "image",
        paint: { type: "image", image: { scaleMode: "fill" } },
      },
      {
        id: "shader-base",
        type: "shader",
        shaderId: "cloud:noise",
        values: { scale: 3 },
      },
    ],
    storage,
  );

  const resolved = resolveSessionEffectFills({
    sessionId: "cloud:one",
    storage,
    documentFills: [
      {
        id: "document",
        type: "image",
        paint: { type: "solid", color: "#fff" },
      },
    ],
  });

  assert.deepEqual(resolved.map((fill) => fill.id), [
    "missing-media",
    "shader-base",
  ]);
  assert.equal(resolved[1].values.scale, 3);
});

test("resolveSessionEffectFills gives a live memory stack first precedence", () => {
  const storage = memoryStorage();
  const store = new Map();
  writeEffectFills(
    "cloud:one",
    [
      {
        id: "stored",
        type: "image",
        paint: { type: "solid", color: "#000" },
      },
    ],
    storage,
  );
  rememberEffectFills(
    store,
    "cloud:one",
    [
      {
        id: "memory-top",
        type: "image",
        paint: {
          type: "image",
          image: { url: "blob:http://localhost/live", scaleMode: "fit" },
        },
      },
      {
        id: "memory-bottom",
        type: "image",
        paint: { type: "solid", color: "#f00" },
      },
    ],
    storage,
  );

  const resolved = resolveSessionEffectFills({
    sessionId: "cloud:one",
    store,
    storage,
    documentFills: [
      {
        id: "document",
        type: "image",
        paint: { type: "solid", color: "#fff" },
      },
    ],
  });

  assert.deepEqual(resolved.map((fill) => fill.id), [
    "memory-top",
    "memory-bottom",
  ]);
  assert.equal(resolved[0].paint.image.url, "blob:http://localhost/live");
});

test("resolveSessionEffectFills preserves an explicitly empty memory stack", () => {
  const storage = memoryStorage();
  writeEffectFills(
    "cloud:one",
    [{ id: "stored", type: "image", paint: { type: "solid", color: "#000" } }],
    storage,
  );
  const store = new Map([["cloud:one", []]]);

  assert.deepEqual(
    resolveSessionEffectFills({
      sessionId: "cloud:one",
      store,
      storage,
      documentFills: [
        {
          id: "document",
          type: "image",
          paint: { type: "solid", color: "#fff" },
        },
      ],
    }),
    [],
  );
});

test("resolveSessionEffectFills preserves explicitly empty durable stacks", () => {
  const storage = memoryStorage();
  writeEffectFills("cloud:one", [], storage);

  assert.deepEqual(
    resolveSessionEffectFills({
      sessionId: "cloud:one",
      storage,
      documentFills: [
        {
          id: "document",
          type: "image",
          paint: { type: "solid", color: "#fff" },
        },
      ],
    }),
    [],
  );
  assert.deepEqual(
    resolveSessionEffectFills({
      sessionId: "cloud:two",
      storage,
      documentFills: [],
      sampleUrls: { image: "/photo.png" },
    }),
    [],
  );
});

test("authoritative cloud fills override stale local empty stacks", () => {
  const storage = memoryStorage();
  writeEffectFills("cloud:one", [], storage);
  const store = new Map([["cloud:one", []]]);

  const resolved = resolveSessionEffectFills({
    sessionId: "cloud:one",
    store,
    storage,
    documentAuthoritative: true,
    documentFills: [
      {
        id: "saved",
        type: "image",
        paint: { type: "solid", color: "#fff" },
      },
    ],
  });

  assert.deepEqual(resolved.map((fill) => fill.id), ["saved"]);
});

test("authoritative cloud fills preserve a saved empty stack", () => {
  const store = new Map([
    [
      "cloud:one",
      [{ id: "local", type: "image", paint: { type: "solid", color: "#000" } }],
    ],
  ]);

  assert.deepEqual(
    resolveSessionEffectFills({
      sessionId: "cloud:one",
      store,
      storage: memoryStorage(),
      documentAuthoritative: true,
      documentFills: [],
    }),
    [],
  );
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
  assert.equal(
    effectFillIsDurable({
      type: "shader",
      shaderId: "cloud:noise",
    }),
    true,
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
