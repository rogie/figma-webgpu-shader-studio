import assert from "node:assert/strict";
import test from "node:test";
import {
  hasUncheckpointedShaderState,
  isShaderStateConflict,
  sanitizeVersionSummary,
  summarizeManualVersion,
  versionOptionLabel,
} from "../src/lib/shaderVersions.js";

test("version summaries reuse prose without markdown or code", () => {
  assert.equal(
    sanitizeVersionSummary(
      "**Will add** a stagger control.\n\n```ts\nconst hidden = true;\n```"
    ),
    "Will add a stagger control."
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

test("version labels and conflicts normalize service metadata", () => {
  const label = versionOptionLabel({
    version_number: 7,
    created_at: "2026-08-16T16:00:00.000Z",
    summary: "Changed pixel shape",
  });
  assert.match(label, /^Version 7 · /);
  assert.match(label, /Changed pixel shape$/);
  assert.equal(isShaderStateConflict({ code: "40001" }), true);
  assert.equal(
    isShaderStateConflict({ message: "shader_state_conflict" }),
    true
  );
});
