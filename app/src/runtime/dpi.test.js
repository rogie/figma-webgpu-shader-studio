import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptiveRenderScale,
  cssSizeToDevicePixels,
  readPreviewPixelRatioMode,
  subscribePreviewPixelRatioMode,
  writePreviewPixelRatioMode,
} from "./dpi.js";

test("preview pixel ratio preference persists supported modes", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(readPreviewPixelRatioMode(storage), "2x");
  assert.equal(writePreviewPixelRatioMode("1x", storage), "1x");
  assert.equal(readPreviewPixelRatioMode(storage), "1x");
  assert.equal(writePreviewPixelRatioMode("2x", storage), "2x");
  assert.equal(readPreviewPixelRatioMode(storage), "2x");
  assert.equal(writePreviewPixelRatioMode("other", storage), "2x");
});

test("preview pixel ratio changes notify mounted controls", () => {
  const modes = [];
  const unsubscribe = subscribePreviewPixelRatioMode((mode) => modes.push(mode));

  writePreviewPixelRatioMode("1x", null);
  writePreviewPixelRatioMode("2x", null);
  unsubscribe();
  writePreviewPixelRatioMode("1x", null);

  assert.deepEqual(modes, ["1x", "2x"]);
});

test("CSS size conversion accepts a 1x preview override", () => {
  assert.deepEqual(cssSizeToDevicePixels(800, 600, 2048, 1), {
    width: 800,
    height: 600,
    dpr: 1,
    cssWidth: 800,
    cssHeight: 600,
  });
  assert.deepEqual(cssSizeToDevicePixels(800, 600, 2048, 2), {
    width: 1600,
    height: 1200,
    dpr: 2,
    cssWidth: 800,
    cssHeight: 600,
  });
});

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
