import assert from "node:assert/strict";
import test from "node:test";
import {
  collectCompositionFeatures,
  compositionsReferencing,
  COMPOSER_UI_STORAGE_KEY,
  emptyComposition,
  fillTypeForDroppedMedia,
  isCompositionPlayable,
  libraryKind,
  mergeLayerValues,
  normalizeComposition,
  parseCompositionShaderId,
  readComposerUiEnabled,
  referencedShaderKeys,
  unpublishedCompositionRefs,
  writeComposerUiEnabled,
} from "./composition.js";

test("composer UI defaults off and persists only an explicit true", () => {
  const values = {};
  const storage = {
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = String(value);
    },
  };

  assert.equal(readComposerUiEnabled(storage), false);
  assert.equal(writeComposerUiEnabled(true, storage), true);
  assert.equal(values[COMPOSER_UI_STORAGE_KEY], "true");
  assert.equal(readComposerUiEnabled(storage), true);
  assert.equal(writeComposerUiEnabled(false, storage), false);
  assert.equal(readComposerUiEnabled(storage), false);
});

test("empty composition defaults to an image fill", () => {
  assert.deepEqual(emptyComposition(), {
    fill: { type: "image", shaderId: null, values: {} },
    effects: [],
  });
});

test("normalizes fill types, shader keys, and effect cap", () => {
  const graph = normalizeComposition({
    fill: { type: "shader", shaderId: "abc" },
    effects: [
      { shaderId: "draft:one", values: { amount: 2 }, enabled: false },
      { id: "keep", shaderId: "cloud:two" },
      { shaderId: null },
      ...Array.from({ length: 10 }, (_, index) => ({
        shaderId: `cloud:extra-${index}`,
      })),
    ],
  });
  assert.equal(graph.fill.shaderId, "cloud:abc");
  assert.equal(graph.effects[0].shaderId, "draft:one");
  assert.equal(graph.effects[0].enabled, false);
  assert.equal(graph.effects[1].id, "keep");
  assert.equal(graph.effects.length, 8);
});

test("parses draft and cloud shader ids", () => {
  assert.deepEqual(parseCompositionShaderId("draft:local"), {
    origin: "draft",
    id: "draft:local",
    key: "draft:local",
  });
  assert.deepEqual(parseCompositionShaderId("cloud:abc"), {
    origin: "cloud",
    id: "abc",
    key: "cloud:abc",
  });
  assert.equal(parseCompositionShaderId(""), null);
});

test("playable when video fill, animated fill, or enabled animated effect", () => {
  const animated = {
    kind: "effect",
    source: "frame.time",
  };
  const staticFill = {
    kind: "fill",
    source: "return vec4(1.0);",
  };
  const resolved = new Map([
    ["cloud:grain", animated],
    ["cloud:sphere", { kind: "fill", source: "frame.time" }],
    ["cloud:still", staticFill],
  ]);

  assert.equal(
    isCompositionPlayable(
      { fill: { type: "video" }, effects: [] },
      resolved
    ),
    true
  );
  assert.equal(
    isCompositionPlayable(
      { fill: { type: "shader", shaderId: "cloud:sphere" }, effects: [] },
      resolved
    ),
    true
  );
  assert.equal(
    isCompositionPlayable(
      {
        fill: { type: "image" },
        effects: [{ shaderId: "cloud:grain", enabled: true }],
      },
      resolved
    ),
    true
  );
  assert.equal(
    isCompositionPlayable(
      {
        fill: { type: "image" },
        effects: [{ shaderId: "cloud:grain", enabled: false }],
      },
      resolved
    ),
    false
  );
  assert.equal(
    isCompositionPlayable(
      { fill: { type: "html" }, effects: [] },
      resolved
    ),
    false
  );
  assert.equal(
    isCompositionPlayable(
      { fill: { type: "shader", shaderId: "cloud:still" }, effects: [] },
      resolved
    ),
    false
  );
});

test("collects features from enabled live refs only", () => {
  const resolved = new Map([
    [
      "cloud:mouse",
      { kind: "effect", source: "frame.mousePosition; frame.time" },
    ],
    ["cloud:still", { kind: "fill", source: "vec4(1.0)" }],
  ]);
  assert.deepEqual(
    collectCompositionFeatures(
      {
        fill: { type: "image" },
        effects: [
          { shaderId: "cloud:mouse", enabled: true },
          { shaderId: "cloud:still", enabled: true },
        ],
      },
      resolved
    ),
    { isAnimated: true, usesMouse: true }
  );
  assert.deepEqual(
    collectCompositionFeatures(
      {
        fill: { type: "image" },
        effects: [{ shaderId: "cloud:mouse", enabled: false }],
      },
      resolved
    ),
    { isAnimated: false, usesMouse: false }
  );
});

test("publish requires every referenced shader to be public", () => {
  const graph = {
    fill: { type: "shader", shaderId: "cloud:fill" },
    effects: [{ shaderId: "cloud:fx" }],
  };
  assert.deepEqual(
    unpublishedCompositionRefs(
      graph,
      new Map([
        ["cloud:fill", { is_public: true }],
        ["cloud:fx", { is_public: false }],
      ])
    ),
    ["cloud:fx"]
  );
  assert.deepEqual(
    unpublishedCompositionRefs(
      graph,
      new Map([
        ["cloud:fill", { is_public: true }],
        ["cloud:fx", { is_public: true }],
      ])
    ),
    []
  );
});

test("finds compositions that reference a shader", () => {
  const items = [
    {
      name: "One",
      composition: {
        fill: { type: "image" },
        effects: [{ shaderId: "cloud:grain" }],
      },
    },
    {
      name: "Two",
      composition: { fill: { type: "video" }, effects: [] },
    },
  ];
  assert.deepEqual(
    compositionsReferencing("cloud:grain", items).map((item) => item.name),
    ["One"]
  );
});

test("mergeLayerValues drops unknown keys and fills defaults", () => {
  assert.deepEqual(
    mergeLayerValues(
      { amount: { defaultValue: 1 }, mix: { defaultValue: 0.5 } },
      { amount: 3, extra: 9 }
    ),
    { amount: 3, mix: 0.5 }
  );
});

test("libraryKind preserves composition", () => {
  assert.equal(libraryKind("composition"), "composition");
  assert.equal(libraryKind("fill"), "fill");
  assert.equal(libraryKind("effect"), "effect");
  assert.equal(libraryKind("other"), "effect");
});

test("fillTypeForDroppedMedia maps image, svg, and video", () => {
  assert.equal(fillTypeForDroppedMedia("image/png"), "image");
  assert.equal(fillTypeForDroppedMedia("image/svg+xml"), "image");
  assert.equal(fillTypeForDroppedMedia("video/mp4"), "video");
  assert.equal(fillTypeForDroppedMedia("text/html"), null);
  assert.equal(fillTypeForDroppedMedia(""), null);
});

test("referencedShaderKeys de-duplicates fill and effects", () => {
  assert.deepEqual(
    referencedShaderKeys({
      fill: { type: "shader", shaderId: "cloud:a" },
      effects: [{ shaderId: "cloud:a" }, { shaderId: "cloud:b" }],
    }),
    ["cloud:a", "cloud:b"]
  );
});
