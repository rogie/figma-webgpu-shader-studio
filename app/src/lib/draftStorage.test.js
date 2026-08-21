import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAFTS_STORAGE_KEY,
  readDrafts,
  serializeDraft,
  writeDrafts,
} from "./draftStorage.js";

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

test("readDrafts tolerates malformed and non-array storage", () => {
  assert.deepEqual(readDrafts(memoryStorage({ [DRAFTS_STORAGE_KEY]: "{" })), []);
  assert.deepEqual(
    readDrafts(memoryStorage({ [DRAFTS_STORAGE_KEY]: '{"id":"draft:1"}' })),
    [],
  );
});

test("readDrafts filters invalid rows and normalizes legacy values", () => {
  const storage = memoryStorage({
    [DRAFTS_STORAGE_KEY]: JSON.stringify([
      {
        id: "draft:valid",
        name: "Valid",
        kind: "effect",
        source: "export function render() {}",
        values: null,
        isPublic: 1,
        thumbnail: "data:image/png;base64,abc",
        figma_shader_id: "figma-id",
        figma_shader_kind: "effect",
      },
      { id: "cloud:wrong", name: "Wrong", kind: "fill", source: "x" },
      { id: "draft:bad-kind", name: "Wrong", kind: "other", source: "x" },
    ]),
  });

  assert.deepEqual(readDrafts(storage), [
    {
      id: "draft:valid",
      name: "Valid",
      kind: "effect",
      source: "export function render() {}",
      values: {},
      isPublic: true,
      pendingMedia: null,
      thumbnail: "data:image/png;base64,abc",
      figma_shader_id: "figma-id",
      figma_shader_kind: "effect",
      figma_shader_version: null,
    },
  ]);
});

test("writeDrafts persists data thumbnails but discards blob URLs", () => {
  const storage = memoryStorage();
  const draft = {
    id: "draft:one",
    name: "One",
    kind: "fill",
    source: "source",
    values: { amount: 2 },
    thumbnail: "blob:ephemeral",
  };

  writeDrafts([draft], { "draft:one": "data:image/png;base64,kept" }, storage);
  const stored = JSON.parse(storage.getItem(DRAFTS_STORAGE_KEY));
  assert.equal(stored[0].thumbnail, "data:image/png;base64,kept");

  writeDrafts([draft], {}, storage);
  assert.equal(
    JSON.parse(storage.getItem(DRAFTS_STORAGE_KEY))[0].thumbnail,
    null,
  );
});

test("readDrafts round-trips composition drafts", () => {
  const storage = memoryStorage({
    [DRAFTS_STORAGE_KEY]: JSON.stringify([
      {
        id: "draft:comp",
        name: "Stack",
        kind: "composition",
        source: "",
        composition: {
          fill: { type: "video" },
          effects: [{ shaderId: "cloud:grain", values: { amount: 1 } }],
        },
      },
    ]),
  });
  const [draft] = readDrafts(storage);
  assert.equal(draft.kind, "composition");
  assert.equal(draft.composition.fill.type, "video");
  assert.equal(draft.composition.effects[0].shaderId, "cloud:grain");
});

test("serializeDraft retains only supported cloud-link metadata", () => {
  const serialized = serializeDraft({
    id: "draft:one",
    name: "One",
    kind: "fill",
    source: "source",
    values: {},
    figma_shader_id: "id",
    figma_shader_kind: "invalid",
    figma_shader_version: 4,
  });

  assert.equal(serialized.figma_shader_id, "id");
  assert.equal(serialized.figma_shader_kind, null);
  assert.equal(serialized.figma_shader_version, null);
});
