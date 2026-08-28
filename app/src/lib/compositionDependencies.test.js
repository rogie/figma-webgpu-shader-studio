import assert from "node:assert/strict";
import test from "node:test";
import { collectCompositionFeatures } from "./composition.js";
import {
  buildCompositionDependencySnapshots,
  dependencyLayerSourceOverrides,
  dependencySourceForKey,
  dependencySnapshotAssetPaths,
  dependencySnapshotForKey,
  resolvedByKeyWithDependencySnapshots,
} from "./compositionDependencies.js";

const graph = {
  fills: [
    {
      id: "fill-a",
      type: "shader",
      shaderId: "cloud:shader-a",
      values: { amount: 1 },
      enabled: true,
    },
  ],
  effects: [
    {
      id: "effect-b",
      shaderId: "cloud:shader-b",
      values: {},
      enabled: true,
    },
  ],
};

test("captures exact dependency rows and resolves aliases", () => {
  const snapshots = buildCompositionDependencySnapshots({
    graph,
    resolvedByKey: new Map([
      [
        "cloud:shader-a",
        {
          id: "shader-a",
          source: "source a",
          kind: "fill",
          state_revision: 4,
          input_path: "owner/shader-a/assets/input-a.png",
        },
      ],
      [
        "shader-b",
        {
          id: "shader-b",
          source: "source b",
          kind: "effect",
          composition: {
            effectFills: [
              {
                paint: {
                  type: "image",
                  image: {
                    assetPath: "owner/shader-b/assets/fill-b.png",
                  },
                },
              },
            ],
          },
        },
      ],
    ]),
  });

  assert.equal(snapshots["cloud:shader-a"].source, "source a");
  assert.equal(
    dependencySnapshotForKey(snapshots, "shader-a").state_revision,
    4,
  );
  assert.equal(snapshots["cloud:shader-b"].source, "source b");
  assert.deepEqual(
    dependencySnapshotAssetPaths(snapshots).sort(),
    [
      "owner/shader-a/assets/input-a.png",
      "owner/shader-b/assets/fill-b.png",
    ],
  );
});

test("existing restored pins win over newer resolved modules", () => {
  const snapshots = buildCompositionDependencySnapshots({
    graph: { fills: [graph.fills[0]], effects: [] },
    existingSnapshots: {
      "cloud:shader-a": {
        source: "pinned source",
        kind: "fill",
        state_revision: 2,
      },
    },
    resolvedByKey: new Map([
      [
        "cloud:shader-a",
        { source: "latest source", kind: "fill", state_revision: 9 },
      ],
    ]),
  });

  assert.equal(snapshots["cloud:shader-a"].source, "pinned source");
  assert.equal(snapshots["cloud:shader-a"].state_revision, 2);
});

test("maps pinned sources to explicit parent layer ids", () => {
  const overrides = dependencyLayerSourceOverrides(graph, {
    "cloud:shader-a": { source: "source a" },
    "shader-b": { source: "source b" },
  });
  assert.deepEqual([...overrides.entries()], [
    ["fill-a", "source a"],
    ["effect-b", "source b"],
  ]);
});

test("pin-aware resolution overrides every alias without mutating live rows", () => {
  const live = {
    id: "shader-a",
    source: "latest source",
    kind: "fill",
    features: { isAnimated: true },
  };
  const resolved = resolvedByKeyWithDependencySnapshots(
    new Map([["cloud:shader-a", live]]),
    {
      "cloud:shader-a": {
        shader_id: "shader-a",
        source: "pinned source",
        kind: "fill",
        features: { isAnimated: false },
      },
    },
  );

  assert.equal(resolved.get("shader-a").source, "pinned source");
  assert.equal(resolved.get("cloud:shader-a").features.isAnimated, false);
  assert.equal(live.source, "latest source");
  assert.equal(
    dependencySourceForKey(
      { "cloud:shader-a": { source: "pinned source" } },
      "shader-a",
    ),
    "pinned source",
  );
});

test("composition feature inference follows the pinned revision", () => {
  const graph = {
    fills: [
      {
        id: "fill",
        type: "shader",
        shaderId: "cloud:shader-a",
        enabled: true,
      },
    ],
    effects: [],
  };
  const resolved = resolvedByKeyWithDependencySnapshots(
    new Map([
      [
        "cloud:shader-a",
        {
          source: "export function render({ time }) { return time; }",
          kind: "fill",
          features: { isAnimated: true, usesMouse: false },
        },
      ],
    ]),
    {
      "cloud:shader-a": {
        source: "export function render() {}",
        kind: "fill",
        features: { isAnimated: false, usesMouse: false },
      },
    },
  );

  assert.deepEqual(collectCompositionFeatures(graph, resolved), {
    isAnimated: false,
    usesMouse: false,
  });
});

test("dependency snapshots preserve composition kind fidelity", () => {
  const snapshots = buildCompositionDependencySnapshots({
    graph: { fills: [graph.fills[0]], effects: [] },
    resolvedByKey: new Map([
      [
        "cloud:shader-a",
        { id: "shader-a", source: "", kind: "composition" },
      ],
    ]),
  });

  assert.equal(snapshots["cloud:shader-a"].kind, "composition");
});
