import assert from "node:assert/strict";
import test from "node:test";
import {
  collectCompositionFeatures,
  compositionsReferencing,
  emptyComposition,
  emptyFill,
  fillFromInputSource,
  fillTypeForDroppedMedia,
  firstFillShaderKey,
  hasCompositionFill,
  isCompositionPlayable,
  isDocumentPlayable,
  isLiveWebcamFill,
  liveWebcamFillCount,
  hasCompositionGraph,
  libraryKind,
  mergeLayerValues,
  normalizeComposition,
  parseCompositionShaderId,
  readEffectFillsFromComposition,
  readReferencedShader,
  reorderCompositionEffects,
  reorderCompositionFills,
  referencedShaderKeys,
  replacePrimaryCompositionFill,
  resolveShaderFillKey,
  resolvedLibraryKind,
  serializeCompositionExport,
  unpublishedCompositionRefs,
  promoteCompositionRefs,
  compositionLayerName,
  compositionLayerShaderId,
  compositionReferencesKind,
  compositionStructureKey,
  resolveReferencedShaderSource,
  compositionPaintFill,
  sessionInputPlan,
  paintForInputSource,
  COMPOSITION_FILL_ID,
  COMPOSITION_KIND,
  MAX_COMPOSITION_FILLS,
} from "./composition.js";

test("empty composition defaults to an image fill", () => {
  const graph = emptyComposition();
  const expectedFill = {
    id: COMPOSITION_FILL_ID,
    type: "image",
    shaderId: null,
    values: {},
    enabled: true,
  };
  assert.deepEqual(graph, {
    fills: [expectedFill],
    fill: expectedFill,
    effects: [],
    inputs: [],
  });
  assert.strictEqual(graph.fill, graph.fills[0]);
});

test("cleared fills are none and do not count as a fill", () => {
  const fill = emptyFill();
  assert.equal(typeof fill.id, "string");
  assert.ok(fill.id);
  assert.deepEqual({ ...fill, id: "<id>" }, {
    id: "<id>",
    type: "none",
    shaderId: null,
    values: {},
    enabled: true,
  });
  assert.equal(hasCompositionFill({ type: "image" }), true);
  assert.equal(hasCompositionFill({ type: "shader" }), true);
  assert.equal(hasCompositionFill({ type: "none" }), false);
  assert.equal(normalizeComposition({ fill: { type: "none" } }).fill.type, "none");
});

test("preserves paint payloads on fills", () => {
  const graph = normalizeComposition({
    fill: {
      type: "image",
      paint: { type: "solid", color: "#FF0000", alpha: 0.8 },
    },
  });
  assert.deepEqual(graph.fill.paint, {
    type: "solid",
    color: "#FF0000",
    alpha: 0.8,
  });
  assert.equal(
    normalizeComposition({ fill: { type: "image" } }).fill.paint,
    undefined
  );
});

test("reads paintable fills from compositions and ignores shader fills", () => {
  assert.deepEqual(
    compositionPaintFill({
      fill: { type: "image", paint: { type: "gradient", gradient: { type: "linear" } } },
    }),
    { type: "gradient", gradient: { type: "linear" } }
  );
  assert.equal(
    compositionPaintFill({
      fill: { type: "shader", shaderId: "cloud:1", paint: { type: "solid", color: "#f00" } },
    }),
    null
  );
  assert.equal(compositionPaintFill(emptyComposition()), null);
});

test("session input plan prefers stored composition paints over the sample", () => {
  const paint = { type: "solid", color: "#00FF00", alpha: 1 };
  assert.deepEqual(
    sessionInputPlan({
      kind: COMPOSITION_KIND,
      graph: { fill: { type: "image", paint } },
    }),
    { action: "paint", paint }
  );
  assert.deepEqual(
    sessionInputPlan({
      kind: COMPOSITION_KIND,
      graph: { fill: { type: "shader", shaderId: "cloud:1", paint } },
    }),
    { action: "clear" }
  );
  assert.deepEqual(
    sessionInputPlan({
      kind: COMPOSITION_KIND,
      graph: { fill: { type: "image", paint } },
      media: { name: "drop.png" },
    }),
    { action: "media", media: { name: "drop.png" } }
  );
  assert.deepEqual(
    sessionInputPlan({
      kind: COMPOSITION_KIND,
      graph: { fill: { type: "image", paint } },
      cloudShader: { input_path: "inputs/a.png" },
    }),
    { action: "download", shader: { input_path: "inputs/a.png" } }
  );
  assert.deepEqual(sessionInputPlan({ kind: COMPOSITION_KIND }), {
    action: "preferred",
  });
  assert.deepEqual(
    sessionInputPlan({ kind: "effect", effectPaint: paint }),
    { action: "paint", paint }
  );
  assert.deepEqual(sessionInputPlan({ kind: "fill" }), { action: "clear" });
});

test("composition input uses the topmost enabled paint fill", () => {
  const lowerPaint = { type: "solid", color: "#0000FF", alpha: 1 };
  const topPaint = { type: "solid", color: "#00FF00", alpha: 1 };
  const graph = {
    fills: [
      { id: "disabled", type: "image", paint: topPaint, enabled: false },
      { id: "shader", type: "shader", shaderId: "cloud:sphere" },
      { id: "paint", type: "image", paint: lowerPaint },
    ],
  };
  assert.deepEqual(compositionPaintFill(graph), lowerPaint);
  assert.deepEqual(sessionInputPlan({ kind: COMPOSITION_KIND, graph }), {
    action: "paint",
    paint: lowerPaint,
  });
});

test("maps preview input sources onto fill types", () => {
  assert.deepEqual(fillFromInputSource("video"), {
    type: "video",
    shaderId: null,
    values: {},
    enabled: true,
  });
  assert.equal(fillFromInputSource("html").type, "html");
  assert.equal(fillFromInputSource("vector").type, "image");
});

test("maps preview input sources onto default paints", () => {
  assert.deepEqual(
    paintForInputSource("video", { video: "/clip.mp4" }),
    { type: "video", video: { url: "/clip.mp4", scaleMode: "fit" } },
  );
  assert.deepEqual(
    paintForInputSource("vector", { vector: "/vector.svg", image: "/photo.png" }),
    { type: "image", image: { url: "/vector.svg", scaleMode: "fit" } },
  );
  assert.deepEqual(
    paintForInputSource("image", { image: "/photo.png" }),
    { type: "image", image: { url: "/photo.png", scaleMode: "fit" } },
  );
  assert.deepEqual(
    sessionInputPlan({
      kind: "effect",
      effectPaint: { type: "image", image: { url: "/vector.svg" } },
      inputSource: "image",
    }),
    {
      action: "paint",
      paint: { type: "image", image: { url: "/vector.svg" } },
    },
  );
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

test("migrates legacy fill and keeps the canonical alias", () => {
  const graph = normalizeComposition({
    fill: { type: "shader", shaderId: "legacy" },
  });
  assert.equal(graph.fills.length, 1);
  assert.equal(graph.fills[0].id, COMPOSITION_FILL_ID);
  assert.equal(graph.fills[0].shaderId, "cloud:legacy");
  assert.strictEqual(graph.fill, graph.fills[0]);
});

test("normalizes explicit fills with stable unique ids and a cap", () => {
  const graph = normalizeComposition({
    fills: [
      { id: "top", type: "image" },
      { type: "shader", shaderId: "cloud:one" },
      { id: "top", type: "video" },
      ...Array.from({ length: 10 }, () => ({ type: "image" })),
    ],
    fill: { type: "html" },
  });
  assert.equal(graph.fills.length, MAX_COMPOSITION_FILLS);
  assert.equal(graph.fill.id, "top");
  assert.equal(graph.fill.type, "image");
  assert.equal(new Set(graph.fills.map((fill) => fill.id)).size, graph.fills.length);
  assert.ok(graph.fills.every((fill) => typeof fill.id === "string" && fill.id));

  const renormalized = normalizeComposition(graph);
  assert.deepEqual(
    renormalized.fills.map((fill) => fill.id),
    graph.fills.map((fill) => fill.id)
  );
});

test("preserves an explicitly empty fills array", () => {
  const graph = normalizeComposition({
    fills: [],
    fill: { type: "video" },
    effects: [],
  });
  assert.deepEqual(graph.fills, []);
  assert.equal(graph.fill, undefined);
});

test("reads versioned effect fills and only falls back when absent", () => {
  const fallback = [
    {
      id: "live",
      type: "image",
      paint: { type: "solid", color: "#FF0000", alpha: 1 },
    },
  ];

  assert.deepEqual(
    readEffectFillsFromComposition(
      {
        effectFills: [
          { id: "saved", type: "shader", shaderId: "saved-fill" },
        ],
      },
      fallback,
    ).map((fill) => ({ id: fill.id, shaderId: fill.shaderId })),
    [{ id: "saved", shaderId: "cloud:saved-fill" }],
  );
  assert.equal(
    readEffectFillsFromComposition(
      { effectFill: { type: "video" } },
      fallback,
    )[0].type,
    "video",
  );
  assert.equal(
    readEffectFillsFromComposition({}, fallback)[0].id,
    "live",
  );
  assert.deepEqual(
    readEffectFillsFromComposition({ effectFills: [] }, fallback),
    [],
  );
  assert.deepEqual(
    readEffectFillsFromComposition({ effectFill: null }, fallback),
    [],
  );
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

test("reorders composition fills and updates the topmost alias", () => {
  const graph = normalizeComposition({
    fills: [
      { id: "a", type: "image" },
      { id: "b", type: "shader", shaderId: "cloud:two" },
      { id: "c", type: "video" },
    ],
  });
  const moved = reorderCompositionFills(graph, 2, 0);
  assert.deepEqual(
    moved.fills.map((fill) => fill.id),
    ["c", "a", "b"]
  );
  assert.strictEqual(moved.fill, moved.fills[0]);
  assert.equal(reorderCompositionFills(graph, 0, 9).fill.id, "a");
});

test("replaces or adds the primary composition fill with dropped media", () => {
  const videoPaint = {
    type: "video",
    video: { url: "blob:video", scaleMode: "fit" },
  };
  const replaced = replacePrimaryCompositionFill(
    {
      fills: [
        { id: "top", type: "shader", shaderId: "cloud:fill" },
        { id: "bottom", type: "image" },
      ],
      effects: [{ id: "fx", shaderId: "cloud:effect" }],
    },
    {
      type: "video",
      shaderId: null,
      values: {},
      paint: videoPaint,
    }
  );
  assert.equal(replaced.fills.length, 2);
  assert.equal(replaced.fill.id, "top");
  assert.equal(replaced.fill.type, "video");
  assert.equal(replaced.fill.shaderId, null);
  assert.deepEqual(replaced.fill.paint, videoPaint);
  assert.equal(replaced.fills[1].id, "bottom");
  assert.equal(replaced.effects[0].id, "fx");

  const added = replacePrimaryCompositionFill(
    { fills: [], effects: [] },
    {
      type: "image",
      shaderId: null,
      values: {},
      paint: { type: "image", image: { url: "blob:image" } },
    }
  );
  assert.equal(added.fills.length, 1);
  assert.equal(added.fill.id, COMPOSITION_FILL_ID);
  assert.equal(added.fill.type, "image");
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
      {
        fill: { type: "image", paint: { type: "video", video: { url: "/v.mp4" } } },
        effects: [],
      },
      resolved
    ),
    true
  );
  assert.equal(
    isCompositionPlayable(
      {
        fill: { type: "video", paint: { type: "webcam" } },
        effects: [],
      },
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

test("document playback follows shader time, video fills, and animated fills", () => {
  const resolved = new Map([
    ["cloud:sphere", { kind: "fill", source: "frame.time" }],
  ]);

  assert.equal(
    isDocumentPlayable({
      kind: "fill",
      source: "return vec4(1.0);",
    }),
    false,
  );
  assert.equal(
    isDocumentPlayable({
      kind: "fill",
      source: "return vec4(frame.time);",
    }),
    true,
  );
  assert.equal(
    isDocumentPlayable({
      kind: "effect",
      source: "return vec4(1.0);",
      effectFills: [{ type: "image", enabled: true, paint: { type: "image" } }],
    }),
    false,
  );
  assert.equal(
    isDocumentPlayable({
      kind: "effect",
      source: "return vec4(1.0);",
      effectFills: [
        {
          type: "image",
          enabled: true,
          paint: { type: "video", video: { url: "/v.mp4" } },
        },
      ],
    }),
    true,
  );
  assert.equal(
    isDocumentPlayable({
      kind: "effect",
      source: "return vec4(1.0);",
      effectFills: [
        { type: "shader", enabled: true, shaderId: "cloud:sphere" },
      ],
      resolvedByKey: resolved,
    }),
    true,
  );
  assert.equal(
    isDocumentPlayable({
      kind: COMPOSITION_KIND,
      composition: { fill: { type: "image" }, effects: [] },
    }),
    false,
  );
  assert.equal(
    isDocumentPlayable({
      kind: COMPOSITION_KIND,
      composition: {
        fill: { type: "shader", shaderId: "cloud:sphere" },
        effects: [],
      },
      resolvedByKey: resolved,
    }),
    true,
  );
  assert.equal(
    isDocumentPlayable({
      kind: "fill",
      source: "return vec4(1.0);",
      features: { supportsAudio: true },
    }),
    true,
  );
});

test("hidden webcam fills stay live for audio and playback", () => {
  const hiddenWebcam = {
    id: "cam",
    type: "webcam",
    enabled: false,
    paint: { type: "webcam", webcam: { live: true } },
  };
  assert.equal(isLiveWebcamFill(hiddenWebcam), true);
  assert.equal(isLiveWebcamFill({ ...hiddenWebcam, enabled: true }), true);
  assert.equal(
    isLiveWebcamFill({
      ...hiddenWebcam,
      enabled: true,
      paint: { type: "webcam", webcam: { live: false } },
    }),
    false,
  );
  assert.equal(
    liveWebcamFillCount({ fills: [hiddenWebcam], effects: [] }),
    1,
  );
  assert.equal(
    isCompositionPlayable({ fills: [hiddenWebcam], effects: [] }),
    true,
  );
  assert.equal(
    isDocumentPlayable({
      kind: "effect",
      source: "return vec4(1.0);",
      effectFills: [hiddenWebcam],
    }),
    true,
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
        fills: [
          { id: "still", type: "image" },
          { id: "mouse-fill", type: "shader", shaderId: "cloud:mouse" },
        ],
        effects: [
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

test("collects supportsAudio from referenced shaders", () => {
  const resolved = new Map([
    [
      "cloud:reactive",
      {
        kind: "fill",
        source: "return vec4(1.0);",
        features: { isAnimated: false, usesMouse: false, supportsAudio: true },
      },
    ],
  ]);
  assert.deepEqual(
    collectCompositionFeatures(
      {
        fills: [{ type: "shader", shaderId: "cloud:reactive", enabled: true }],
        effects: [],
      },
      resolved,
    ),
    { isAnimated: true, usesMouse: false, supportsAudio: true },
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
      fills: [
        { id: "first", type: "shader", shaderId: "draft:fill" },
        { id: "second", type: "shader", shaderId: "draft:other" },
      ],
      effects: [{ id: "a", shaderId: "draft:fx" }],
    },
    [
      { id: "fill", is_public: true },
      { id: "other", is_public: true },
      { id: "fx", is_public: false },
    ]
  );
  assert.equal(promoted.fill.shaderId, "cloud:fill");
  assert.equal(promoted.fills[1].shaderId, "cloud:other");
  assert.strictEqual(promoted.fill, promoted.fills[0]);
  assert.equal(promoted.effects[0].shaderId, "cloud:fx");
});

test("compositionLayerShaderId reads fill and effect shader ids", () => {
  const graph = normalizeComposition({
    fills: [
      { id: COMPOSITION_FILL_ID, type: "shader", shaderId: "cloud:fill" },
      { id: "fill-two", type: "shader", shaderId: "cloud:second" },
    ],
    effects: [{ id: "fx", shaderId: "draft:grain" }],
  });
  assert.equal(compositionLayerShaderId(graph, COMPOSITION_FILL_ID), "cloud:fill");
  assert.equal(compositionLayerShaderId(graph, "fill-two"), "cloud:second");
  assert.equal(compositionLayerShaderId(graph, "fx"), "draft:grain");
  assert.equal(compositionLayerShaderId(graph, "missing"), null);
});

test("fill structure and kind checks include every stacked fill", () => {
  const graph = {
    fills: [
      { id: "top", type: "image", enabled: false, values: { ignored: 1 } },
      { id: "bottom", type: "shader", shaderId: "cloud:wrong" },
    ],
    effects: [],
  };
  assert.deepEqual(JSON.parse(compositionStructureKey(graph)).fills, [
    { id: "top", type: "image", shaderId: null, enabled: false },
    {
      id: "bottom",
      type: "shader",
      shaderId: "cloud:wrong",
      enabled: true,
    },
  ]);
  assert.equal(
    compositionReferencesKind(
      graph,
      new Map([["cloud:wrong", { kind: "effect" }]]),
      true
    ),
    false
  );
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

test("serializeCompositionExport inlines an effect preview over media fills", () => {
  const serialized = serializeCompositionExport(
    {
      fills: [
        { id: "photo", type: "image", paint: { type: "image" } },
      ],
      effects: [
        {
          id: "effect-preview",
          shaderId: "draft:fx",
          values: { amount: 0.4 },
        },
      ],
    },
    new Map(),
    new Map([
      ["draft:fx", { source: "export function render() {}", broken: false }],
    ])
  );
  assert.equal(serialized.isFill, false);
  assert.equal(serialized.fillType, "image");
  assert.equal(serialized.layers.length, 1);
  assert.equal(serialized.layers[0].id, "effect-preview");
  assert.equal(serialized.layers[0].role, "effect");
  assert.equal(serialized.layers[0].source, "export function render() {}");
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

test("serializeCompositionExport emits enabled shader fills bottom-to-top", () => {
  const serialized = serializeCompositionExport(
    {
      fills: [
        {
          id: "top",
          type: "shader",
          shaderId: "cloud:top",
          values: { layer: 1 },
        },
        {
          id: "disabled",
          type: "shader",
          shaderId: "cloud:disabled",
          enabled: false,
        },
        {
          id: "bottom",
          type: "shader",
          shaderId: "cloud:bottom",
          values: { layer: 3 },
        },
      ],
      effects: [],
    },
    new Map([
      ["cloud:top", { source: "top source", broken: false }],
      ["cloud:disabled", { source: "disabled source", broken: false }],
      ["cloud:bottom", { source: "bottom source", broken: false }],
    ])
  );
  assert.equal(serialized.isFill, true);
  assert.equal(serialized.fillType, "shader");
  assert.deepEqual(
    serialized.layers.map((layer) => layer.id),
    ["bottom", "top"]
  );
  assert.ok(serialized.layers.every((layer) => layer.role === "fill"));
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
      fills: [
        { id: "one", type: "shader", shaderId: "cloud:a" },
        { id: "two", type: "shader", shaderId: "cloud:c" },
      ],
      effects: [{ shaderId: "cloud:a" }, { shaderId: "cloud:b" }],
    }),
    ["cloud:a", "cloud:c", "cloud:b"]
  );
});

test("keeps shaderId when a fill switches to paint", () => {
  const graph = normalizeComposition({
    fill: {
      type: "image",
      shaderId: "cloud:sphere",
      values: { amount: 2 },
      paint: { type: "solid", color: "#FF0000", alpha: 1 },
    },
  });
  assert.equal(graph.fill.type, "image");
  assert.equal(graph.fill.shaderId, "cloud:sphere");
  assert.deepEqual(graph.fill.values, { amount: 2 });
  assert.deepEqual(graph.fill.paint, {
    type: "solid",
    color: "#FF0000",
    alpha: 1,
  });
  assert.deepEqual(referencedShaderKeys(graph), []);
  assert.equal(compositionLayerShaderId(graph, COMPOSITION_FILL_ID), null);
  assert.equal(compositionPaintFill(graph).type, "solid");
  assert.equal(
    isCompositionPlayable(
      graph,
      new Map([["cloud:sphere", { kind: "fill", source: "frame.time" }]])
    ),
    false
  );
});

test("shader fills omit paint and stay referenced", () => {
  const graph = normalizeComposition({
    fill: {
      type: "shader",
      shaderId: "sphere",
      paint: { type: "solid", color: "#FF0000" },
    },
  });
  assert.equal(graph.fill.type, "shader");
  assert.equal(graph.fill.shaderId, "cloud:sphere");
  assert.equal(graph.fill.paint, undefined);
  assert.deepEqual(referencedShaderKeys(graph), ["cloud:sphere"]);
  assert.equal(compositionLayerShaderId(graph, COMPOSITION_FILL_ID), "cloud:sphere");
});

test("resolves the last shader fill or the first library card", () => {
  const cards = [
    { key: "cloud:first", kind: "fill" },
    { key: "cloud:second", kind: "fill" },
    { key: "cloud:grain", kind: "effect" },
  ];
  assert.equal(firstFillShaderKey(cards), "cloud:first");
  assert.equal(firstFillShaderKey([]), null);
  assert.equal(resolveShaderFillKey("cloud:second", cards), "cloud:second");
  assert.equal(resolveShaderFillKey("second", cards), "cloud:second");
  assert.equal(resolveShaderFillKey("cloud:missing", cards), "cloud:first");
  assert.equal(resolveShaderFillKey(null, cards), "cloud:first");
  assert.equal(resolveShaderFillKey("cloud:gone", []), null);
});
