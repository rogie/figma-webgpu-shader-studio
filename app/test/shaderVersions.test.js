import assert from "node:assert/strict";
import test from "node:test";
import {
  groupVersionsByDay,
  hasUncheckpointedShaderState,
  isShaderStateConflict,
  resolveAgentCheckpointAfterCompile,
  sanitizeVersionSummary,
  summarizeAgentVersion,
  summarizeManualVersion,
  versionRowParts,
} from "../src/lib/shaderVersions.js";

test("version summaries reuse prose without markdown or code", () => {
  assert.equal(
    sanitizeVersionSummary(
      "**Will add** a stagger control.\n\n```ts\nconst hidden = true;\n```"
    ),
    "Will add a stagger control."
  );
});

test("agent summaries keep only the first sentence of the reply", () => {
  assert.equal(
    summarizeAgentVersion(
      "I'll replace the color-swap effect with a motion mask. It will ping-pong between two state textures, compare frame luminance, and decay trails."
    ),
    "I'll replace the color-swap effect with a motion mask."
  );
  assert.equal(
    summarizeAgentVersion("Adds a 0.5 second stagger to the reveal"),
    "Adds a 0.5 second stagger to the reveal"
  );
  assert.equal(
    summarizeAgentVersion(""),
    "Applied an AI-generated shader update"
  );
});

test("manual summaries describe source and property changes", () => {
  assert.equal(
    summarizeManualVersion(
      {
        source: "line one",
        kind: "effect",
        parameter_values: { scale: 1, tint: { r: 1 } },
      },
      {
        source: "line one\nline two",
        kind: "effect",
        parameter_values: { scale: 2, tint: { r: 1 } },
      }
    ),
    "Updated shader source (1 → 2 lines); changed properties: scale"
  );
});

test("manual summaries describe complete visual state changes", () => {
  assert.equal(
    summarizeManualVersion(
      {
        source: "line one",
        kind: "composition",
        composition: { fills: [{ id: "old" }], effects: [] },
        input_path: "owner/old.png",
        input_name: "old.png",
        input_mime_type: "image/png",
        dependency_snapshots: {
          "cloud:fill": { source: "old source" },
        },
      },
      {
        source: "line one",
        kind: "composition",
        composition: { fills: [{ id: "new" }], effects: [] },
        input_path: "owner/new.png",
        input_name: "new.png",
        input_mime_type: "image/png",
        dependency_snapshots: {
          "cloud:fill": { source: "new source" },
        },
      },
    ),
    "changed layer stack; changed input media; updated pinned dependencies",
  );
});

test("uncheckpointed state compares state revision counters", () => {
  assert.equal(
    hasUncheckpointedShaderState({
      state_revision: 4,
      versioned_state_revision: 3,
    }),
    true
  );
  assert.equal(
    hasUncheckpointedShaderState({
      state_revision: 4,
      versioned_state_revision: 4,
    }),
    false
  );
});

test("agent checkpoints become saveable after their exact source compiles", () => {
  const pending = {
    presetId: "cloud:shader-1",
    shaderId: "shader-1",
    source: "export function render() {}\n",
    summary: "Updated the shader",
  };
  assert.deepEqual(
    resolveAgentCheckpointAfterCompile(pending, {
      presetId: "cloud:shader-1",
      source: pending.source,
      values: { amount: 0.5 },
    }),
    { ...pending, values: { amount: 0.5 } }
  );
  assert.equal(
    resolveAgentCheckpointAfterCompile(pending, {
      presetId: "cloud:shader-2",
      source: pending.source,
      values: {},
    }),
    null
  );
  assert.equal(
    resolveAgentCheckpointAfterCompile(pending, {
      presetId: pending.presetId,
      source: "export function render() { return 1 }\n",
      values: {},
    }),
    null
  );
});

test("version rows lead with the summary and label the version below", () => {
  const row = versionRowParts(
    {
      version_number: 7,
      created_at: "2026-08-16T16:00:00.000Z",
      summary: "Changed pixel shape",
      checkpoint_kind: "agent",
    },
    { current: true }
  );
  assert.equal(row.title, "Changed pixel shape");
  assert.equal(row.subtitle, "Version 7 · Current · AI");
  assert.match(row.time, /\d/);

  const unsummarized = versionRowParts({ version_number: 3 });
  assert.equal(unsummarized.title, "Version 3");
  assert.equal(unsummarized.subtitle, "Version 3");
  assert.equal(unsummarized.time, "");
});

test("versions group by calendar day with relative day labels", () => {
  const now = new Date("2026-08-19T18:00:00.000Z");
  const day = (iso) => new Date(iso);
  const groups = groupVersionsByDay(
    [
      { id: "c", created_at: day("2026-08-19T17:00:00.000Z").toISOString() },
      { id: "b", created_at: day("2026-08-19T15:00:00.000Z").toISOString() },
      { id: "a", created_at: day("2026-07-14T21:00:00.000Z").toISOString() },
    ],
    now
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, "Today");
  assert.deepEqual(
    groups[0].versions.map((version) => version.id),
    ["c", "b"]
  );
  assert.match(groups[1].label, /July 14, 2026|Jul(y)? 2026/);
});

test("state conflicts normalize service metadata", () => {
  assert.equal(isShaderStateConflict({ code: "40001" }), true);
  assert.equal(
    isShaderStateConflict({ message: "shader_state_conflict" }),
    true
  );
});
