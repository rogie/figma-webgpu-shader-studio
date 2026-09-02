import assert from "node:assert/strict";
import test from "node:test";
import { COMPOSITION_KIND } from "../lib/composition.js";
import { applyAudioPlayback, resolveExportSoundtrack } from "./exportAudio.js";

test("export soundtrack prefers an Audio input over a video fill", () => {
  assert.deepEqual(
    resolveExportSoundtrack({
      kind: COMPOSITION_KIND,
      composition: {
        fills: [
          {
            id: "video",
            type: "video",
            enabled: true,
            paint: { type: "video", video: { url: "https://cdn.example.com/clip.mp4" } },
          },
        ],
        effects: [],
        inputs: [
          {
            id: "beat",
            type: "audio",
            enabled: true,
            audio: { url: "https://cdn.example.com/beat.mp3" },
          },
        ],
      },
    }),
    { url: "https://cdn.example.com/beat.mp3", source: "audio" },
  );
});

test("export soundtrack uses a video fill when no Audio input exists", () => {
  assert.deepEqual(
    resolveExportSoundtrack({
      kind: "effect",
      effectFills: [
        {
          id: "video",
          type: "video",
          enabled: true,
          paint: { type: "video", video: { url: "https://cdn.example.com/clip.mp4" } },
        },
      ],
      documentInputs: [],
    }),
    { url: "https://cdn.example.com/clip.mp4", source: "video" },
  );
});

test("export soundtrack ignores microphone and webcam", () => {
  assert.equal(
    resolveExportSoundtrack({
      kind: "effect",
      effectFills: [
        {
          id: "cam",
          type: "webcam",
          enabled: true,
          paint: { type: "webcam", webcam: { live: true } },
        },
      ],
      documentInputs: [{ id: "mic", type: "microphone", enabled: true }],
    }),
    null,
  );
});

test("applyAudioPlayback scales and loops PCM to the export duration", () => {
  const decoded = {
    channels: [new Float32Array([0.5, -0.5])],
    mono: new Float32Array([0.5, -0.5]),
    sampleRate: 2,
    length: 2,
  };
  const looped = applyAudioPlayback(decoded, {
    gain: 2,
    loop: true,
    durationSec: 2,
  });
  assert.equal(looped.length, 4);
  assert.deepEqual([...looped.mono], [1, -1, 1, -1]);
  const truncated = applyAudioPlayback(decoded, {
    gain: 1,
    loop: false,
    durationSec: 2,
  });
  assert.equal(truncated.length, 2);
});
