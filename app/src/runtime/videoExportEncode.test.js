import test from "node:test";
import assert from "node:assert/strict";
import {
  canConstructVideoFrameFromCanvas,
  copyImageDataToCanvas,
  evenExportSize,
  preferredExportVideoCodecs,
  imageExportHasQuality,
  imageExportQualityFactor,
  resolveEmbedFormat,
  resolveImageExportFormat,
  resolveImageExportQuality,
  resolveVideoExportFormat,
  videoExportFileExtension,
} from "./videoExportEncode.js";

test("resolveVideoExportFormat defaults to mp4", () => {
  assert.equal(resolveVideoExportFormat("mp4"), "mp4");
  assert.equal(resolveVideoExportFormat("webm"), "webm");
  assert.equal(resolveVideoExportFormat("mov"), "mp4");
  assert.equal(resolveVideoExportFormat(undefined), "mp4");
});

test("resolveImageExportFormat and embed format fall back safely", () => {
  assert.equal(resolveImageExportFormat("image/png"), "image/png");
  assert.equal(resolveImageExportFormat("image/gif"), "image/webp");
  assert.equal(resolveEmbedFormat("iframe"), "iframe");
  assert.equal(resolveEmbedFormat("html"), "code");
});

test("image quality applies to WebP and JPEG only", () => {
  assert.equal(imageExportHasQuality("image/webp"), true);
  assert.equal(imageExportHasQuality("image/jpeg"), true);
  assert.equal(imageExportHasQuality("image/png"), false);
  assert.equal(resolveImageExportQuality(undefined), 100);
  assert.equal(resolveImageExportQuality(0), 1);
  assert.equal(resolveImageExportQuality(140), 100);
  assert.equal(imageExportQualityFactor(80, "image/webp"), 0.8);
  assert.equal(imageExportQualityFactor(80, "image/png"), undefined);
});

test("videoExportFileExtension prefers the blob MIME type", () => {
  assert.equal(videoExportFileExtension("webm", "video/mp4"), "mp4");
  assert.equal(videoExportFileExtension("mp4", "video/webm"), "webm");
  assert.equal(videoExportFileExtension("mp4"), "mp4");
});

test("preferredExportVideoCodecs puts H.264 first for MP4", () => {
  assert.deepEqual(preferredExportVideoCodecs("mp4"), ["avc", "hevc", "av1"]);
  assert.deepEqual(
    preferredExportVideoCodecs("mp4", ["vp9", "av1", "avc"]),
    ["avc", "av1"]
  );
  assert.deepEqual(
    preferredExportVideoCodecs("webm", ["vp8", "vp9"]),
    ["vp9", "vp8"]
  );
});

test("evenExportSize snaps MP4 frames to even dimensions", () => {
  assert.deepEqual(evenExportSize(1920, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(evenExportSize(815, 927), { width: 814, height: 926 });
  assert.deepEqual(evenExportSize(1, 1), { width: 2, height: 2 });
});

test("canConstructVideoFrameFromCanvas requires VideoFrame and a canvas", () => {
  assert.equal(canConstructVideoFrameFromCanvas({ width: 16, height: 16 }, undefined), false);
  assert.equal(canConstructVideoFrameFromCanvas(null, function VideoFrame() {}), false);
});

test("canConstructVideoFrameFromCanvas accepts a sized VideoFrame", () => {
  let closed = 0;
  function VideoFrame() {
    this.codedWidth = 1920;
    this.codedHeight = 1080;
    this.close = () => {
      closed += 1;
    };
  }
  assert.equal(
    canConstructVideoFrameFromCanvas({ width: 1920, height: 1080 }, VideoFrame),
    true
  );
  assert.equal(closed, 1);
});

test("canConstructVideoFrameFromCanvas rejects empty or throwing frames", () => {
  function EmptyFrame() {
    this.codedWidth = 0;
    this.codedHeight = 0;
    this.close = () => {};
  }
  function ThrowingFrame() {
    throw new Error("WebGPU canvas is not a VideoFrame source.");
  }
  assert.equal(canConstructVideoFrameFromCanvas({ width: 16, height: 16 }, EmptyFrame), false);
  assert.equal(
    canConstructVideoFrameFromCanvas({ width: 16, height: 16 }, ThrowingFrame),
    false
  );
});

test("copyImageDataToCanvas uses putImageData when sizes match", async () => {
  const calls = [];
  const encodeCanvas = { width: 4, height: 2 };
  const encodeContext = {
    putImageData(imageData, x, y) {
      calls.push({ imageData, x, y });
    },
  };
  const imageData = { width: 4, height: 2 };
  await copyImageDataToCanvas(encodeContext, encodeCanvas, imageData);
  assert.deepEqual(calls, [{ imageData, x: 0, y: 0 }]);
});