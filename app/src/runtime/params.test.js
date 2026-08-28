import assert from "node:assert/strict";
import test from "node:test";
import { supportsRenderScale, valuesMatchDefaults } from "./params.js";

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
