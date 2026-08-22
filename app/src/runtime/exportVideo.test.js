import test from "node:test";
import assert from "node:assert/strict";
import {
  formatVideoExportPixels,
  resolveVideoFrameTime,
  resolveVideoExportAspect,
  resolveVideoExportResolution,
  resolveVideoExportSize,
  supportedWebmMimeType,
  supportsOfflineVideoExport,
  videoExportFramePlan,
  videoResolutionOptions,
} from "./exportVideo.js";

test("resolveVideoExportSize keeps current dimensions", () => {
  assert.deepEqual(resolveVideoExportSize("current", "16:9", 814, 926), {
    width: 814,
    height: 926,
  });
});

test("resolveVideoExportSize maps resolution and aspect", () => {
  assert.deepEqual(resolveVideoExportSize("1080", "16:9", 1, 1), {
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(resolveVideoExportSize("2k", "1:1", 1, 1), {
    width: 2048,
    height: 2048,
  });
  assert.deepEqual(resolveVideoExportSize("4k", "16:9", 1, 1), {
    width: 3840,
    height: 2160,
  });
  assert.deepEqual(resolveVideoExportSize("4k", "9:16", 1, 1), {
    width: 2160,
    height: 3840,
  });
});

test("videoResolutionOptions labels Current with pixel size", () => {
  assert.equal(formatVideoExportPixels(1920, 1080), "1920 × 1080");
  assert.equal(formatVideoExportPixels(0, 1080), "");
  assert.equal(
    videoResolutionOptions(814, 926)[0].label,
    "Current (814 × 926)"
  );
  assert.equal(videoResolutionOptions()[0].label, "Current");
});

test("resolveVideoExportResolution and aspect fall back safely", () => {
  assert.equal(resolveVideoExportResolution("4k"), "4k");
  assert.equal(resolveVideoExportResolution("uhd"), "current");
  assert.equal(resolveVideoExportAspect("1:1"), "1:1");
  assert.equal(resolveVideoExportAspect("21:9"), "16:9");
});

test("supportedWebmMimeType selects the first supported codec", () => {
  const fakeRecorder = {
    isTypeSupported(type) {
      return type === "video/webm;codecs=vp8";
    },
  };
  assert.equal(
    supportedWebmMimeType(fakeRecorder),
    "video/webm;codecs=vp8"
  );
});

test("resolveVideoFrameTime seeks exact timestamps and loops at duration", () => {
  assert.equal(resolveVideoFrameTime(1.25, 3), 1.25);
  assert.equal(resolveVideoFrameTime(3.25, 3), 0.25);
  assert.equal(resolveVideoFrameTime(-1, 3), 0);
});

test("videoExportFramePlan lists offline timestamps without wall-clock gaps", () => {
  const frames = videoExportFramePlan(1, 30);
  assert.equal(frames.length, 30);
  assert.deepEqual(frames[0], {
    frame: 0,
    timeMs: 0,
    deltaMs: 1000 / 30,
    timeSec: 0,
    durationSec: 1 / 30,
  });
  assert.equal(frames[29].frame, 29);
  assert.equal(frames[29].timeSec, 29 / 30);
  assert.ok(frames.every((item, index) => item.timeMs === index * (1000 / 30)));
});

test("supportsOfflineVideoExport requires a worker, OffscreenCanvas, and VideoEncoder", () => {
  assert.equal(
    supportsOfflineVideoExport({
      WorkerClass: function Worker() {},
      OffscreenCanvasClass: function OffscreenCanvas() {},
      VideoEncoderClass: function VideoEncoder() {},
    }),
    true
  );
  assert.equal(
    supportsOfflineVideoExport({
      WorkerClass: function Worker() {},
      OffscreenCanvasClass: function OffscreenCanvas() {},
      VideoEncoderClass: undefined,
    }),
    false
  );
});
