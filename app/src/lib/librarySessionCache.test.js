import assert from "node:assert/strict";
import test from "node:test";
import {
  LIBRARY_ROW_CACHE_FRESH_MS,
  LIBRARY_THUMBNAIL_URL_TTL_MS,
  libraryCacheIsFresh,
  libraryCacheScope,
  libraryRefreshIsCurrent,
  readLibrarySessionCache,
  reconcileLibraryShaders,
  writeLibrarySessionCache,
} from "./librarySessionCache.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

function shader(overrides = {}) {
  return {
    id: "shader-1",
    owner_id: "user-1",
    name: "Cached shader",
    kind: "effect",
    is_public: false,
    thumbnail_path: "user-1/shader-1/thumbnail.png",
    thumbnail_small_path: "user-1/shader-1/thumbnail-small.png",
    thumbnail_bucket: "shader-assets",
    state_revision: 2,
    updated_at: "2026-09-02T12:00:00Z",
    ...overrides,
  };
}

test("library session cache is scoped and strips document data", () => {
  const storage = memoryStorage();
  const scope = libraryCacheScope("user-1");
  assert.equal(
    writeLibrarySessionCache({
      storage,
      scope,
      now: 100,
      shaders: [
        shader({
          source: "private shader source",
          composition: { fills: [{ id: "secret" }] },
          input_path: "private/input.png",
          dependency_snapshots: { private: true },
        }),
      ],
    }),
    true,
  );

  const cached = readLibrarySessionCache({ storage, scope, now: 101 });
  assert.equal(cached.shaders.length, 1);
  assert.equal(cached.shaders[0].name, "Cached shader");
  assert.equal("source" in cached.shaders[0], false);
  assert.equal("composition" in cached.shaders[0], false);
  assert.equal("input_path" in cached.shaders[0], false);
  assert.equal("dependency_snapshots" in cached.shaders[0], false);
  assert.equal(
    readLibrarySessionCache({
      storage,
      scope: libraryCacheScope("user-2"),
      now: 101,
    }),
    null,
  );
});

test("thumbnail URLs expire independently from cached rows", () => {
  const storage = memoryStorage();
  const scope = libraryCacheScope("user-1");
  const row = shader();
  const expiresAt = 100 + LIBRARY_THUMBNAIL_URL_TTL_MS;
  writeLibrarySessionCache({
    storage,
    scope,
    now: 100,
    shaders: [row],
    thumbnails: { [row.id]: "https://example.com/signed" },
    smallThumbnails: { [row.id]: "https://example.com/signed-small" },
    thumbnailPaths: { [row.id]: row.thumbnail_path },
    thumbnailExpiries: { [row.id]: expiresAt },
  });

  const valid = readLibrarySessionCache({
    storage,
    scope,
    now: expiresAt - 1,
  });
  assert.equal(valid.thumbnails[row.id], "https://example.com/signed");
  assert.equal(
    valid.smallThumbnails[row.id],
    "https://example.com/signed-small",
  );
  const expired = readLibrarySessionCache({
    storage,
    scope,
    now: expiresAt,
  });
  assert.equal(expired.shaders.length, 1);
  assert.deepEqual(expired.thumbnails, {});
});

test("malformed cache entries fail closed", () => {
  const storage = memoryStorage();
  const scope = libraryCacheScope("user-1");
  storage.setItem(
    "figma-shader-studio:library-session:v2:user:user-1",
    "{",
  );
  assert.equal(readLibrarySessionCache({ storage, scope }), null);
  assert.equal(storage.values.size, 0);
});

test("reconciliation preserves unchanged rows and invalidates per shader", () => {
  const first = shader();
  const second = shader({ id: "shader-2", name: "Second" });
  const current = [first, second];

  assert.equal(
    reconcileLibraryShaders(current, [
      { ...first },
      { ...second },
    ]),
    current,
  );

  const renamed = reconcileLibraryShaders(current, [
    { ...first, name: "Renamed", updated_at: "2026-09-02T12:01:00Z" },
    { ...second },
  ]);
  assert.notEqual(renamed, current);
  assert.notEqual(renamed[0], first);
  assert.equal(renamed[1], second);

  const created = reconcileLibraryShaders(renamed, [
    ...renamed,
    shader({ id: "shader-3" }),
  ]);
  assert.deepEqual(
    created.map((row) => row.id),
    ["shader-1", "shader-2", "shader-3"],
  );

  const deleted = reconcileLibraryShaders(created, [created[0], created[2]]);
  assert.deepEqual(
    deleted.map((row) => row.id),
    ["shader-1", "shader-3"],
  );
});

test("older refreshes are rejected after a local mutation epoch", () => {
  assert.equal(libraryRefreshIsCurrent(4, 4), true);
  assert.equal(libraryRefreshIsCurrent(4, 5), false);
});

test("row freshness has a bounded stale-while-revalidate window", () => {
  assert.equal(
    libraryCacheIsFresh(100, 100 + LIBRARY_ROW_CACHE_FRESH_MS - 1),
    true,
  );
  assert.equal(
    libraryCacheIsFresh(100, 100 + LIBRARY_ROW_CACHE_FRESH_MS),
    false,
  );
});
