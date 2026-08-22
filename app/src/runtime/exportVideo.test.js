import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveVideoFrameTime,
  resolveVideoDimensions,
  supportedWebmMimeType,
  supportsOfflineVideoExport,
  videoExportFramePlan,
} from "./exportVideo.js";

test("resolveVideoDimensions keeps current dimensions", () => {
  assert.deepEqual(resolveVideoDimensions("current", 814, 926), {
    width: 814,
    height: 926,
  });
});

test("resolveVideoDimensions parses and caps presets", () => {
  assert.deepEqual(resolveVideoDimensions("1920x1080", 1, 1), {
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(resolveVideoDimensions("4096x2160", 1, 1), {
    width: 2048,
    height: 2048,
  });
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
