import assert from "node:assert/strict";
import test from "node:test";
import {
  chatApplyTargetStatus,
  formatChatError,
  validateModuleSource,
} from "./chatApply.js";

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

  const grok = formatChatError("Error 429: rate limit exceeded", {
    provider: "grok",
  });
  assert.match(grok, /Grok/);
  assert.match(grok, /console\.x\.ai/);
  assert.doesNotMatch(grok, /Gemini|OpenAI/);

  const cursor = formatChatError("usage_limit_exceeded", {
    provider: "cursor",
  });
  assert.match(cursor, /Cursor/);
  assert.match(cursor, /cursor\.com\/dashboard/);
});

test("only applies chat output to its unchanged target shader", () => {
  assert.equal(
    chatApplyTargetStatus({
      requestShaderKey: "grain",
      activeShaderKey: "grain",
      baselineSource: "before",
      currentSource: "before",
    }),
    "current"
  );
  assert.equal(
    chatApplyTargetStatus({
      requestShaderKey: "grain",
      activeShaderKey: "dither",
      baselineSource: "before",
      currentSource: "other",
    }),
    "different-shader"
  );
  assert.equal(
    chatApplyTargetStatus({
      requestShaderKey: "grain",
      activeShaderKey: "grain",
      baselineSource: "before",
      currentSource: "edited",
    }),
    "source-changed"
  );
});
