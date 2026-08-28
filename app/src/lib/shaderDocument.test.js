import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShaderDependencySnapshots,
  buildShaderDocumentPayload,
  buildShaderDocumentSnapshot,
  buildShaderStateSavePayload,
  editorStateMatchesSnapshot,
  shaderDocumentFingerprint,
} from "./shaderDocument.js";

const effectSource = `
export function render(_device, frame) {
  return frame.input;
}
`;

const fillSource = `
export function render(_device, frame) {
  return frame.time;
}
`;

test("normalizes a standalone effect and preserves its durable fill stack", () => {
  const state = {
    name: "Metadata is not versioned",
    source: effectSource,
    kind: "effect",
    values: { amount: 0.75 },
    effectFills: [
      {
        id: "photo",
        type: "image",
        values: { opacity: 0.5 },
        paint: {
          type: "image",
          image: {
            url: "blob:http://localhost/photo",
            scaleMode: "fit",
          },
        },
      },
      {
        id: "generated",
        type: "shader",
        shaderId: "cloud:fill-one",
        values: { scale: 2 },
      },
    ],
    input: {
      path: "owner/shader/input.png",
      name: "input.png",
      mimeType: "image/png",
      url: "blob:http://localhost/ignored",
    },
  };

  const snapshot = buildShaderDocumentSnapshot(state);

  assert.equal(snapshot.kind, "effect");
  assert.equal(snapshot.source, effectSource);
  assert.deepEqual(snapshot.parameterValues, { amount: 0.75 });
  assert.deepEqual(snapshot.features, {
    isAnimated: false,
    usesMouse: false,
  });
  assert.deepEqual(
    snapshot.composition.effectFills.map((fill) => fill.id),
    ["photo", "generated"],
  );
  assert.equal(
    snapshot.composition.effectFills[0].paint.image.url,
    undefined,
  );
  assert.equal(
    snapshot.composition.effectFills[0].paint.image.scaleMode,
    "fit",
  );
  assert.deepEqual(
    snapshot.composition.effectFill,
    snapshot.composition.effectFills[0],
  );
  assert.deepEqual(snapshot.input, {
    path: "owner/shader/input.png",
    name: "input.png",
    mimeType: "image/png",
  });
  assert.equal("name" in snapshot, false);
  assert.equal(
    state.effectFills[0].paint.image.url,
    "blob:http://localhost/photo",
  );
});

test("normalizes standalone fills without carrying stale effect envelopes", () => {
  const snapshot = buildShaderDocumentSnapshot({
    source: fillSource,
    kind: "fill",
    parameter_values: { scale: 4 },
    composition: {
      effectFills: [{ id: "stale", type: "image" }],
      effectFill: { id: "stale", type: "image" },
    },
    effectFills: [{ id: "also-stale", type: "image" }],
  });

  assert.equal(snapshot.kind, "fill");
  assert.deepEqual(snapshot.parameterValues, { scale: 4 });
  assert.deepEqual(snapshot.composition, {});
  assert.deepEqual(snapshot.features, {
    isAnimated: true,
    usesMouse: false,
  });
});

test("normalizes compositions, strips transient paint URLs, and clears standalone state", () => {
  const source = "stale standalone source";
  const values = { stale: true };
  const composition = {
    fills: [
      {
        id: "video",
        type: "video",
        paint: {
          type: "video",
          video: {
            url: "https://storage.example.com/signed-video",
            assetPath: "owner/shader/video.mp4",
            poster: "data:image/png;base64,poster",
            scaleMode: "fill",
          },
        },
      },
      {
        id: "base",
        type: "shader",
        shaderId: "cloud:base-fill",
        values: { contrast: 2 },
      },
    ],
    effects: [
      {
        id: "grain",
        shaderId: "cloud:grain",
        values: { amount: 0.4 },
      },
    ],
  };

  const snapshot = buildShaderDocumentSnapshot({
    source,
    kind: "composition",
    values,
    composition,
    features: { isAnimated: true, usesMouse: false, renderVersion: 2 },
  });

  assert.equal(snapshot.source, "");
  assert.deepEqual(snapshot.parameterValues, {});
  assert.deepEqual(snapshot.features, {
    isAnimated: true,
    usesMouse: false,
    renderVersion: 2,
  });
  assert.deepEqual(
    snapshot.composition.fills.map((fill) => fill.id),
    ["video", "base"],
  );
  assert.deepEqual(snapshot.composition.effects, [
    {
      id: "grain",
      shaderId: "cloud:grain",
      values: { amount: 0.4 },
      enabled: true,
    },
  ]);
  assert.equal(snapshot.composition.fill.id, "video");
  assert.equal(snapshot.composition.fill.paint.video.url, undefined);
  assert.equal(snapshot.composition.fill.paint.video.poster, undefined);
  assert.equal(
    snapshot.composition.fill.paint.video.assetPath,
    "owner/shader/video.mp4",
  );
  assert.equal(source, "stale standalone source");
  assert.deepEqual(values, { stale: true });
  assert.equal(
    composition.fills[0].paint.video.url,
    "https://storage.example.com/signed-video",
  );
});

test("preserves an explicitly empty effect fill stack", () => {
  const snapshot = buildShaderDocumentSnapshot({
    source: effectSource,
    kind: "effect",
    composition: {
      effectFills: [{ id: "stored", type: "image" }],
    },
    effectFills: [],
  });

  assert.deepEqual(snapshot.composition, {
    effectFills: [],
    effectFill: null,
  });
});

test("builds row and save-service payloads from the same snapshot", () => {
  const snapshot = buildShaderDocumentSnapshot({
    source: effectSource,
    kind: "effect",
    parameterValues: { amount: 1 },
    effectFills: [
      {
        id: "photo",
        type: "image",
        paint: { type: "solid", color: "#112233" },
      },
    ],
    input_path: "owner/shader/input.png",
    input_name: "photo.png",
    input_mime_type: "image/png",
    dependency_snapshots: {
      "cloud:fill-one": {
        source: fillSource,
        kind: "fill",
        parameter_values: { scale: 2 },
        features: { isAnimated: true },
      },
    },
  });

  const row = buildShaderDocumentPayload(snapshot);
  assert.deepEqual(row, {
    source: effectSource,
    kind: "effect",
    parameter_values: { amount: 1 },
    features: { isAnimated: false, usesMouse: false },
    composition: snapshot.composition,
    input_path: "owner/shader/input.png",
    input_name: "photo.png",
    input_mime_type: "image/png",
    dependency_snapshots: snapshot.dependencySnapshots,
  });
  assert.equal("fingerprint" in row, false);

  assert.deepEqual(buildShaderStateSavePayload(snapshot), {
    source: effectSource,
    kind: "effect",
    parameterValues: { amount: 1 },
    features: { isAnimated: false, usesMouse: false },
    composition: snapshot.composition,
    inputPath: "owner/shader/input.png",
    inputName: "photo.png",
    inputMimeType: "image/png",
    dependencySnapshots: snapshot.dependencySnapshots,
  });
});

test("canonicalizes resolved dependency rows and strips their transient media", () => {
  const dependencies = buildShaderDependencySnapshots([
    {
      id: "fill-one",
      name: "Unversioned dependency metadata",
      source: fillSource,
      kind: "fill",
      parameter_values: { scale: 2 },
      input_path: "owner/fill-one/input.png",
    },
    {
      key: "draft:effect-one",
      source: effectSource,
      kind: "effect",
      values: { amount: 3 },
      composition: {
        effectFills: [
          {
            id: "photo",
            type: "image",
            paint: {
              type: "image",
              image: {
                url: "blob:http://localhost/dependency",
                scaleMode: "fit",
              },
            },
          },
        ],
      },
    },
  ]);

  assert.deepEqual(Object.keys(dependencies), [
    "cloud:fill-one",
    "draft:effect-one",
  ]);
  assert.equal(dependencies["cloud:fill-one"].name, undefined);
  assert.equal(dependencies["cloud:fill-one"].shader_id, "fill-one");
  assert.equal(
    dependencies["cloud:fill-one"].input_path,
    "owner/fill-one/input.png",
  );
  assert.equal(
    dependencies["draft:effect-one"].composition.effectFills[0].paint.image
      .url,
    undefined,
  );
});

test("preserves dependency pin identity and revision metadata", () => {
  const snapshot = buildShaderDocumentSnapshot({
    source: "",
    kind: "composition",
    composition: {
      fills: [
        {
          id: "fill",
          type: "shader",
          shaderId: "cloud:fill-one",
        },
      ],
      effects: [],
    },
    dependencySnapshots: {
      "cloud:fill-one": {
        shader_id: "fill-one",
        state_revision: 7,
        source: fillSource,
        kind: "fill",
      },
    },
  });

  assert.equal(
    snapshot.dependencySnapshots["cloud:fill-one"].shader_id,
    "fill-one",
  );
  assert.equal(
    snapshot.dependencySnapshots["cloud:fill-one"].state_revision,
    7,
  );
  assert.equal(
    buildShaderDocumentPayload(snapshot).dependency_snapshots[
      "cloud:fill-one"
    ].state_revision,
    7,
  );
});

test("fingerprints are key-order independent and exclude mutable metadata", () => {
  const left = {
    source: effectSource,
    kind: "effect",
    name: "First name",
    description: "First description",
    isPublic: false,
    values: { point: { x: 10, y: 20 }, amount: 1 },
    effectFills: [
      {
        id: "solid",
        type: "image",
        paint: { type: "solid", color: "#fff" },
      },
    ],
    dependencySnapshots: {
      "cloud:b": { source: fillSource, kind: "fill", values: { b: 2, a: 1 } },
      "cloud:a": { source: fillSource, kind: "fill", values: {} },
    },
  };
  const right = {
    ...left,
    name: "Renamed",
    description: "Rewritten",
    isPublic: true,
    values: { amount: 1, point: { y: 20, x: 10 } },
    dependencySnapshots: {
      "cloud:a": { kind: "fill", values: {}, source: fillSource },
      "cloud:b": { values: { a: 1, b: 2 }, kind: "fill", source: fillSource },
    },
  };

  assert.equal(
    shaderDocumentFingerprint(left),
    shaderDocumentFingerprint(right),
  );
});

test("fingerprints stay deterministic when legacy layers have no ids", () => {
  const legacy = {
    source: effectSource,
    kind: "effect",
    composition: {
      effectFills: [
        {
          type: "image",
          paint: { type: "solid", color: "#fff" },
        },
      ],
    },
  };

  const first = buildShaderDocumentSnapshot(legacy);
  const second = buildShaderDocumentSnapshot(legacy);
  assert.equal(first.composition.effectFill.id, "fill");
  assert.equal(first.fingerprint, second.fingerprint);
});

test("fingerprints cover every persisted visual state field", () => {
  const base = {
    source: effectSource,
    kind: "effect",
    parameterValues: { amount: 1 },
    features: { isAnimated: false, usesMouse: false },
    effectFills: [
      {
        id: "solid",
        type: "image",
        paint: { type: "solid", color: "#fff" },
      },
    ],
    input: {
      path: "owner/input.png",
      name: "input.png",
      mimeType: "image/png",
    },
    dependencySnapshots: {
      "cloud:fill": { source: fillSource, kind: "fill" },
    },
  };
  const fingerprint = shaderDocumentFingerprint(base);
  const variants = [
    { ...base, source: `${effectSource}\n// changed` },
    { ...base, kind: "fill" },
    { ...base, parameterValues: { amount: 2 } },
    { ...base, features: { isAnimated: true, usesMouse: false } },
    {
      ...base,
      effectFills: [
        {
          id: "solid",
          type: "image",
          paint: { type: "solid", color: "#000" },
        },
      ],
    },
    { ...base, input: { ...base.input, path: "owner/other.png" } },
    {
      ...base,
      dependencySnapshots: {
        "cloud:fill": { source: `${fillSource}\n// changed`, kind: "fill" },
      },
    },
  ];

  for (const variant of variants) {
    assert.notEqual(shaderDocumentFingerprint(variant), fingerprint);
  }
});

test("reports whether live editor state still matches a captured snapshot", () => {
  const state = {
    source: effectSource,
    kind: "effect",
    values: { amount: 1 },
    effectFills: [
      {
        id: "solid",
        type: "image",
        paint: { type: "solid", color: "#fff" },
      },
    ],
  };
  const captured = buildShaderDocumentSnapshot(state);

  assert.equal(editorStateMatchesSnapshot(state, captured), true);
  assert.equal(
    editorStateMatchesSnapshot(
      {
        source: effectSource,
        kind: "effect",
        parameter_values: { amount: 1 },
        composition: captured.composition,
      },
      captured,
    ),
    true,
  );

  state.values.amount = 2;
  state.effectFills[0].paint.color = "#000";
  assert.deepEqual(captured.parameterValues, { amount: 1 });
  assert.equal(captured.composition.effectFill.paint.color, "#fff");
  assert.equal(editorStateMatchesSnapshot(state, captured), false);
  assert.equal(editorStateMatchesSnapshot(state, null), false);
});
