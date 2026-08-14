import assert from "node:assert/strict";
import test from "node:test";
import { supportsRenderScale } from "./params.js";

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
