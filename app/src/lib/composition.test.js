import assert from "node:assert/strict";
import test from "node:test";
import {
  collectCompositionFeatures,
  compositionsReferencing,
  emptyComposition,
  fillTypeForDroppedMedia,
  isCompositionPlayable,
  hasCompositionGraph,
  libraryKind,
  mergeLayerValues,
  normalizeComposition,
  parseCompositionShaderId,
  readReferencedShader,
  reorderCompositionEffects,
  referencedShaderKeys,
  resolvedLibraryKind,
  serializeCompositionExport,
  unpublishedCompositionRefs,
  promoteCompositionRefs,
  compositionLayerName,
  compositionLayerShaderId,
  resolveReferencedShaderSource,
  COMPOSITION_FILL_ID,
} from "./composition.js";

test("empty composition defaults to an image fill", () => {
  assert.deepEqual(emptyComposition(), {
    fill: { type: "image", shaderId: null, values: {}, enabled: true },
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
  assert.equal(graph.fill.enabled, true);
  assert.equal(graph.effects[0].shaderId, "draft:one");
  assert.equal(graph.effects[0].enabled, false);
  assert.equal(graph.effects[1].id, "keep");
  assert.equal(graph.effects.length, 8);
});

test("reorders composition effects by index", () => {
  const graph = normalizeComposition({
    fill: { type: "image" },
    effects: [
      { id: "a", shaderId: "cloud:one" },
      { id: "b", shaderId: "cloud:two" },
      { id: "c", shaderId: "cloud:three" },
    ],
  });
  const moved = reorderCompositionEffects(graph, 0, 2);
  assert.deepEqual(
    moved.effects.map((effect) => effect.id),
    ["b", "c", "a"]
  );
  assert.deepEqual(
    reorderCompositionEffects(graph, 1, 1).effects.map((effect) => effect.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(
    reorderCompositionEffects(graph, -1, 1).effects.map((effect) => effect.id),
    ["a", "b", "c"]
  );
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

test("readReferencedShader prefers the live session over a stale cache", () => {
  const session = {
    presetId: "cloud:fx",
    kind: "effect",
    source: "export const props = {}; export function setup() {}",
    name: "Latest",
  };
  const liveByKey = new Map([
    ["cloud:fx", { source: "export const props = {}; // stale" }],
    ["draft:fx", { source: "export const props = {}; // stale draft" }],
  ]);
  const found = readReferencedShader("draft:fx", {
    session,
    drafts: [{ id: "draft:fx", source: "export const props = {}; // draft" }],
    liveByKey,
  });
  assert.equal(found.source, session.source);
});

test("readReferencedShader prefers the live cache over a stale draft", () => {
  const found = readReferencedShader("draft:fx", {
    drafts: [{ id: "draft:fx", source: "export const props = {}; // stale draft" }],
    liveByKey: new Map([
      ["draft:fx", { source: "export const props = {}; // live" }],
    ]),
  });
  assert.equal(found.source, "export const props = {}; // live");
});

test("readReferencedShader follows draft ids to the same cloud shader", () => {
  const found = readReferencedShader("draft:abc", {
    liveByKey: new Map([
      ["cloud:abc", { source: "export function setup() {}", name: "Cloud" }],
    ]),
  });
  assert.equal(found.name, "Cloud");
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
  assert.equal(
    isCompositionPlayable(
      {
        fill: { type: "shader", shaderId: "cloud:sphere", enabled: false },
        effects: [],
      },
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

test("publish treats a shader as public if any live row is public", () => {
  const graph = {
    fill: { type: "shader", shaderId: "cloud:fill" },
    effects: [{ shaderId: "draft:fx" }],
  };
  assert.deepEqual(
    unpublishedCompositionRefs(
      graph,
      new Map([
        ["cloud:fill", { is_public: false, name: "Fill" }],
        ["draft:fx", { is_public: false, name: "Effect" }],
      ]),
      [
        { id: "fill", is_public: false, name: "Fill" },
        { id: "fill", is_public: true, name: "Fill" },
        { id: "fx", is_public: true, name: "Effect" },
      ]
    ),
    []
  );
});

test("publish uses live cloud publicity over a stale resolved cache", () => {
  const graph = {
    fill: { type: "shader", shaderId: "cloud:fill" },
    effects: [{ shaderId: "draft:fx" }],
  };
  assert.deepEqual(
    unpublishedCompositionRefs(
      graph,
      new Map([
        ["cloud:fill", { is_public: false }],
        ["draft:fx", { is_public: false }],
      ]),
      [
        { id: "fill", is_public: true },
        { id: "fx", is_public: true },
      ]
    ),
    []
  );
});

test("promoteCompositionRefs rewrites published draft ids to cloud ids", () => {
  const promoted = promoteCompositionRefs(
    {
      fill: { type: "shader", shaderId: "draft:fill" },
      effects: [{ id: "a", shaderId: "draft:fx" }],
    },
    [{ id: "fill", is_public: true }, { id: "fx", is_public: false }]
  );
  assert.equal(promoted.fill.shaderId, "cloud:fill");
  assert.equal(promoted.effects[0].shaderId, "cloud:fx");
});

test("compositionLayerShaderId reads fill and effect shader ids", () => {
  const graph = normalizeComposition({
    fill: { type: "shader", shaderId: "cloud:fill" },
    effects: [{ id: "fx", shaderId: "draft:grain" }],
  });
  assert.equal(compositionLayerShaderId(graph, COMPOSITION_FILL_ID), "cloud:fill");
  assert.equal(compositionLayerShaderId(graph, "fx"), "draft:grain");
  assert.equal(compositionLayerShaderId(graph, "missing"), null);
});

test("resolveReferencedShaderSource prefers live source over a resolved cache", () => {
  assert.equal(
    resolveReferencedShaderSource("draft:fx", {
      liveByKey: new Map([
        ["cloud:fx", { source: "export function render() { return 2; }" }],
      ]),
      resolvedByKey: new Map([
        ["draft:fx", { source: "export function render() { return 1; }" }],
      ]),
    }),
    "export function render() { return 2; }"
  );
  assert.equal(
    resolveReferencedShaderSource("cloud:fx", {
      resolvedByKey: new Map([
        ["cloud:fx", { source: "export function render() { return 1; }" }],
      ]),
    }),
    "export function render() { return 1; }"
  );
});

test("compositionLayerName prefers resolved names, then library cards", () => {
  const resolved = new Map([
    ["cloud:fill", { name: "Mesh", broken: false }],
    ["draft:fx", { name: "Grain", broken: false }],
  ]);
  assert.equal(
    compositionLayerName("cloud:fill", resolved, [], "Choose a shader fill"),
    "Mesh"
  );
  assert.equal(
    compositionLayerName("draft:fill", resolved, [], "Choose a shader fill"),
    "Mesh"
  );
  assert.equal(
    compositionLayerName(
      "cloud:missing",
      resolved,
      [{ key: "cloud:missing", name: "Sphere" }],
      "Choose a shader fill"
    ),
    "Sphere"
  );
  assert.equal(
    compositionLayerName("cloud:gone", resolved, [], "Shader effect"),
    "Shader effect"
  );
  assert.equal(
    compositionLayerName(
      "cloud:broken",
      new Map([["cloud:broken", { broken: true }]]),
      [],
      "Shader effect"
    ),
    "Missing shader"
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

test("serializeCompositionExport inlines playable layer sources", () => {
  const graph = {
    fill: {
      type: "shader",
      shaderId: "cloud:fill",
      values: { speed: 2 },
      enabled: true,
    },
    effects: [
      {
        id: "fx-1",
        shaderId: "cloud:grain",
        values: { amount: 0.4 },
        enabled: true,
      },
      { id: "fx-2", shaderId: "cloud:broken", values: {}, enabled: true },
    ],
  };
  const resolved = new Map([
    ["cloud:fill", { source: "export function render() { return 1 }", broken: false }],
    ["cloud:grain", { source: "export function render() { return 2 }", broken: false }],
    ["cloud:broken", { source: "nope", broken: true }],
  ]);
  const live = new Map([
    ["cloud:grain", { source: "export function render() { return 3 }" }],
  ]);

  assert.deepEqual(serializeCompositionExport(graph, resolved, live), {
    isFill: true,
    fillType: "shader",
    layers: [
      {
        id: "fill",
        role: "fill",
        enabled: true,
        source: "export function render() { return 1 }",
        params: { speed: 2 },
      },
      {
        id: "fx-1",
        role: "effect",
        enabled: true,
        source: "export function render() { return 3 }",
        params: { amount: 0.4 },
      },
    ],
  });
});

test("serializeCompositionExport treats media fills as input-backed", () => {
  const serialized = serializeCompositionExport(
    {
      fill: { type: "image" },
      effects: [
        { id: "fx-1", shaderId: "cloud:grain", values: { amount: 1 } },
      ],
    },
    new Map([
      ["cloud:grain", { source: "export function render() {}", broken: false }],
    ])
  );
  assert.equal(serialized.isFill, false);
  assert.equal(serialized.fillType, "image");
  assert.equal(serialized.layers.length, 1);
  assert.equal(serialized.layers[0].role, "effect");
});

test("libraryKind preserves composition", () => {
  assert.equal(libraryKind("composition"), "composition");
  assert.equal(libraryKind("fill"), "fill");
  assert.equal(libraryKind("effect"), "effect");
  assert.equal(libraryKind("other"), "effect");
});

test("resolvedLibraryKind treats composition graphs as composers", () => {
  assert.equal(hasCompositionGraph({}), false);
  assert.equal(hasCompositionGraph(null), false);
  assert.equal(hasCompositionGraph({ fill: { type: "image" } }), true);
  assert.equal(hasCompositionGraph({ effects: [] }), true);
  assert.equal(
    resolvedLibraryKind({ kind: "fill", composition: emptyComposition() }),
    "composition"
  );
  assert.equal(resolvedLibraryKind({ kind: "fill" }), "fill");
  assert.equal(resolvedLibraryKind({ kind: "composition" }), "composition");
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
