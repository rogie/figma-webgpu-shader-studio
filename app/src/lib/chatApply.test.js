import assert from "node:assert/strict";
import test from "node:test";
import { formatChatError, validateModuleSource } from "./chatApply.js";

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

test("rate-limit errors mention the selected provider, not Gemini by default", () => {
  const openai = formatChatError("Error 429: rate limit exceeded", {
    provider: "openai",
  });
  assert.match(openai, /OpenAI/);
  assert.doesNotMatch(openai, /Gemini|ai\.google\.dev/);

  const gemini = formatChatError("RESOURCE_EXHAUSTED", { provider: "gemini" });
  assert.match(gemini, /Gemini/);
  assert.match(gemini, /ai\.google\.dev/);
});
