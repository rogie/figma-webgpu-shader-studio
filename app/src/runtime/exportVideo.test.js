import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveVideoDimensions,
  supportedWebmMimeType,
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
