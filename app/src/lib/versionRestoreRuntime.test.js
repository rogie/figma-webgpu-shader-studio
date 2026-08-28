import assert from "node:assert/strict";
import test from "node:test";
import { refreshRestoredRuntime } from "./versionRestoreRuntime.js";

test("a composition restore recompiles even when its structure is unchanged", async () => {
  const calls = [];
  const composition = { fills: [{ id: "same" }], effects: [] };
  const overrides = new Map([["same", "pinned source"]]);

  await refreshRestoredRuntime({
    restored: { kind: "composition", source: "" },
    composition,
    layerSourceOverrides: overrides,
    compile: () => calls.push("module"),
    compileComposition: async (graph, options) =>
      calls.push(["composition", graph, options.layerSourceOverrides]),
  });

  assert.deepEqual(calls, [["composition", composition, overrides]]);
});

test("an effect restore recompiles values and restores its exact input mode", async () => {
  const calls = [];
  const compile = async (source, options) =>
    calls.push(["compile", source, options]);

  await refreshRestoredRuntime({
    restored: { kind: "effect", source: "same source", input_path: "input.png" },
    compile,
    compileComposition: () => {},
    loadMedia: async () => calls.push("media"),
    restoreDefaultInput: async () => calls.push("default"),
  });
  await refreshRestoredRuntime({
    restored: { kind: "effect", source: "same source", input_path: null },
    compile,
    compileComposition: () => {},
    loadMedia: async () => calls.push("media"),
    restoreDefaultInput: async () => calls.push("default"),
  });

  assert.deepEqual(calls, [
    ["compile", "same source", { force: true }],
    "media",
    ["compile", "same source", { force: true }],
    "default",
  ]);
});
