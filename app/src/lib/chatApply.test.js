import assert from "node:assert/strict";
import test from "node:test";
import { validateModuleSource } from "./chatApply.js";

test("validates agent module syntax before applying it", () => {
  assert.deepEqual(
    validateModuleSource(
      "export function render(device, frame) {\n  return frame;\n}\n"
    ),
    { ok: true }
  );
});

test("marks syntax failures as automatically repairable", () => {
  const result = validateModuleSource(
    "export function render(device, frame) {\n  const value = ;\n  return frame;\n}\n"
  );
  assert.equal(result.ok, false);
  assert.equal(result.autoHealable, true);
  assert.match(result.reason, /(?:Compile|Syntax) error:/);
});
