import assert from "node:assert/strict";
import test from "node:test";
import { adaptiveRenderScale } from "./dpi.js";

test("adaptiveRenderScale uses stable balanced zoom tiers", () => {
  assert.equal(adaptiveRenderScale(1, 1000, 1000), 1);
  assert.equal(adaptiveRenderScale(1.25, 1000, 1000), 1.5);
  assert.equal(adaptiveRenderScale(1.75, 1000, 1000), 2);
  assert.equal(adaptiveRenderScale(8, 1000, 1000), 2);
});

test("adaptiveRenderScale respects pixel and dimension limits", () => {
  assert.equal(
    adaptiveRenderScale(2, 2048, 2048, { maxPixels: 8 * 1024 * 1024 }),
    Math.sqrt(2)
  );
  assert.equal(
    adaptiveRenderScale(2, 3000, 1000, { maxDimension: 4096 }),
    4096 / 3000
  );
});

test("adaptiveRenderScale never downsamples a large logical output", () => {
  assert.equal(
    adaptiveRenderScale(2, 4096, 4096, { maxPixels: 8 * 1024 * 1024 }),
    1
  );
});
