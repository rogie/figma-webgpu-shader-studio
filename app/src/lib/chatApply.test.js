import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAppliedModuleCheckpoint,
  chatApplyTargetStatus,
  extractAssistantMetadata,
  extractAutoApplyModuleSource,
  extractModuleSource,
  formatChatError,
  splitAssistantContent,
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

const completedEdit = `<summary>Will soften the glow.</summary>
<description>A soft glow surrounds bright details.</description>
\`\`\`typescript
export function render(device, frame) {
  return frame;
}
\`\`\``;

test("auto-apply requires a tagged edit, one closed fence, and stream completion", () => {
  const done = { streamCompleted: true };
  assert.equal(extractAutoApplyModuleSource(completedEdit), null);
  assert.equal(extractAutoApplyModuleSource(completedEdit, { ...done, aborted: true }), null);
  assert.equal(extractAutoApplyModuleSource(completedEdit.slice(0, -3), done), null);
  assert.equal(extractAutoApplyModuleSource(completedEdit.slice(completedEdit.indexOf("```")), done), null);
  assert.equal(extractAutoApplyModuleSource(`${completedEdit}\n\`\`\`ts\nextra\n\`\`\``, done), null);
  assert.equal(extractAutoApplyModuleSource(completedEdit, done), extractModuleSource(completedEdit));
});

test("a completed shader edit produces a persistence checkpoint", () => {
  const source = extractAutoApplyModuleSource(completedEdit, { streamCompleted: true });
  assert.deepEqual(buildAppliedModuleCheckpoint(completedEdit, source), {
    source: "export function render(device, frame) {\n  return frame;\n}\n",
    summary: "Will soften the glow.",
    description: "A soft glow surrounds bright details.",
  });
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

test("extracts tagged summary and description from an applied response", () => {
  const response = `<summary>Adds a softer animated glow.</summary>
<description>A soft glow moves across the image and blooms around bright details. Amount and speed controls tune its intensity and motion.</description>
\`\`\`typescript
export function render(device, frame) {
  return frame;
}
\`\`\``;
  assert.deepEqual(extractAssistantMetadata(response), {
    summary: "Adds a softer animated glow.",
    description:
      "A soft glow moves across the image and blooms around bright details. Amount and speed controls tune its intensity and motion.",
  });
  const parsed = splitAssistantContent(response);
  assert.equal(parsed.summary, "Adds a softer animated glow.");
  assert.match(parsed.prose, /A soft glow moves/);
  assert.doesNotMatch(parsed.prose, /<description>/);
});

test("keeps legacy untagged responses compatible", () => {
  const parsed = splitAssistantContent(`Adds a glow.
\`\`\`typescript
export function render(device, frame) {
  return frame;
}
\`\`\``);
  assert.equal(parsed.summary, null);
  assert.equal(parsed.description, null);
  assert.equal(parsed.prose, "Adds a glow.");
});
