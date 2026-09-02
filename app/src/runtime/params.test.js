import assert from "node:assert/strict";
import test from "node:test";
import { inferFeatures, mergeShaderFeatures, supportsRenderScale, valuesMatchDefaults } from "./params.js";

test("valuesMatchDefaults treats missing keys as defaults", () => {
  const props = {
    amount: { defaultValue: 1 },
    mix: { defaultValue: { x: 50, y: 50 } },
  };
  assert.equal(valuesMatchDefaults(props, {}), true);
  assert.equal(valuesMatchDefaults(props, { amount: 1 }), true);
  assert.equal(valuesMatchDefaults(props, { amount: 2 }), false);
  assert.equal(valuesMatchDefaults(props, { mix: { x: 50, y: 51 } }), false);
  assert.equal(valuesMatchDefaults(props, null), true);
});

test("valuesMatchDefaults rejects stale keys unless they are undefined", () => {
  const props = { amount: { defaultValue: 1 } };

  assert.equal(valuesMatchDefaults(props, { amount: 1, extra: 9 }), false);
  assert.equal(valuesMatchDefaults(props, { amount: 1, extra: null }), false);
  assert.equal(
    valuesMatchDefaults(props, { amount: 1, extra: undefined }),
    true
  );
  assert.equal(valuesMatchDefaults({}, { amount: 2 }), false);
  assert.equal(valuesMatchDefaults(null, { amount: 2 }), false);
  assert.equal(valuesMatchDefaults(null, { amount: undefined }), true);
});

test("inferFeatures does not treat frame.audio as animation or mouse", () => {
  assert.deepEqual(
    inferFeatures("export function render(device, frame) { return frame.audio.volume; }"),
    { isAnimated: false, usesMouse: false }
  );
});

test("mergeShaderFeatures keeps supportsAudio declaration-only", () => {
  assert.deepEqual(
    mergeShaderFeatures({ isAnimated: true, usesMouse: false }, {}),
    { isAnimated: true, usesMouse: false }
  );
  assert.deepEqual(
    mergeShaderFeatures(
      { isAnimated: false, usesMouse: false },
      { supportsAudio: true }
    ),
    { isAnimated: false, usesMouse: false, supportsAudio: true }
  );
});

test("supportsRenderScale requires an explicit source directive", () => {
  assert.equal(
    supportsRenderScale(
      "// @supports-render-scale\nvar scale = frame.renderScale || 1"
    ),
    true
  );
  assert.equal(
    supportsRenderScale('var text = "frame.renderScale"'),
    false
  );
});
