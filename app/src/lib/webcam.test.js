import assert from "node:assert/strict";
import test from "node:test";
import { acquireWebcamStream } from "./webcam.js";

test("retries the default camera when a saved device is unavailable", async () => {
  const stream = { id: "default-camera" };
  const calls = [];
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (calls.length === 1) {
        throw new DOMException("Unknown camera", "OverconstrainedError");
      }
      return stream;
    },
  };

  assert.equal(
    await acquireWebcamStream({
      deviceId: "stale-camera",
      audio: true,
      mediaDevices,
    }),
    stream,
  );
  assert.deepEqual(calls, [
    {
      video: { deviceId: { exact: "stale-camera" } },
      audio: true,
    },
    { video: true, audio: true },
  ]);
});

test("does not retry permission failures", async () => {
  let calls = 0;
  const mediaDevices = {
    async getUserMedia() {
      calls += 1;
      throw new DOMException("Denied", "NotAllowedError");
    },
  };

  await assert.rejects(
    acquireWebcamStream({ deviceId: "camera", mediaDevices }),
    { name: "NotAllowedError" },
  );
  assert.equal(calls, 1);
});
