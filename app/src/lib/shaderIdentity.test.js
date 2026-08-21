import assert from "node:assert/strict";
import test from "node:test";
import {
  cloudChoiceId,
  cloudIdForDraft,
  figmaShaderLink,
  isDraftId,
  shaderContentFingerprint,
} from "./shaderIdentity.js";

test("normalizes draft and cloud identifiers", () => {
  assert.equal(isDraftId("draft:abc"), true);
  assert.equal(isDraftId("cloud:abc"), false);
  assert.equal(cloudIdForDraft("draft:abc"), "abc");
  assert.equal(cloudIdForDraft("abc"), "abc");
  assert.equal(cloudChoiceId("abc"), "cloud:abc");
});

test("normalizes optional Figma shader metadata", () => {
  assert.deepEqual(
    figmaShaderLink({
      figma_shader_id: "id",
      figma_shader_kind: "fill",
      figma_shader_version: "3",
    }),
    {
      figma_shader_id: "id",
      figma_shader_kind: "fill",
      figma_shader_version: "3",
    },
  );
  assert.deepEqual(figmaShaderLink(null), {
    figma_shader_id: null,
    figma_shader_kind: null,
    figma_shader_version: null,
  });
});

test("content fingerprints include every persisted state field", () => {
  const base = {
    name: "Shader",
    source: "source",
    parameterValues: { amount: 1 },
    features: { isAnimated: false },
    composition: { fill: { type: "image" } },
  };
  const fingerprint = shaderContentFingerprint(base);

  assert.equal(shaderContentFingerprint({ ...base }), fingerprint);
  assert.notEqual(
    shaderContentFingerprint({
      ...base,
      parameterValues: { amount: 2 },
    }),
    fingerprint,
  );
  assert.notEqual(
    shaderContentFingerprint({
      ...base,
      features: { isAnimated: true },
    }),
    fingerprint,
  );
  assert.notEqual(
    shaderContentFingerprint({
      ...base,
      composition: { fill: { type: "video" } },
    }),
    fingerprint,
  );
});
