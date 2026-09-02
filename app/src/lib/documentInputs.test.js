import assert from "node:assert/strict";
import test from "node:test";
import {
  audioInputHasFile,
  audioPlaybackSettings,
  createDocumentInput,
  enabledAudioFileInput,
  hasAudioInput,
  normalizeDocumentInputs,
  persistableDocumentInputs,
  removedDocumentInputs,
} from "./documentInputs.js";

test("normalizes audio and microphone inputs with stable ids", () => {
  const inputs = normalizeDocumentInputs([
    { type: "audio", audio: { url: "https://cdn.example.com/beat.mp3", name: "beat.mp3" } },
    { type: "microphone", enabled: false },
    { type: "unknown" },
  ]);
  assert.equal(inputs.length, 2);
  assert.equal(typeof inputs[0].id, "string");
  assert.equal(inputs[0].type, "audio");
  assert.equal(inputs[0].audio.url, "https://cdn.example.com/beat.mp3");
  assert.equal(inputs[0].audio.gain, 1);
  assert.equal(inputs[0].audio.monitor, true);
  assert.equal(inputs[0].audio.loop, true);
  assert.equal(inputs[1].type, "microphone");
  assert.equal(inputs[1].enabled, false);
});

test("persistable inputs strip ephemeral audio urls", () => {
  const stored = persistableDocumentInputs([
    createDocumentInput("audio"),
    {
      type: "audio",
      audio: { url: "blob:http://localhost/a", name: "live.mp3" },
    },
    {
      type: "audio",
      audio: { url: "https://cdn.example.com/ok.mp3", name: "ok.mp3" },
    },
  ]);
  assert.equal(stored[1].audio.url, "");
  assert.equal(stored[2].audio.url, "https://cdn.example.com/ok.mp3");
});

test("normalizes audio playback settings and omits defaults when persisted", () => {
  const [quiet] = normalizeDocumentInputs([
    {
      type: "audio",
      audio: {
        url: "https://cdn.example.com/beat.mp3",
        name: "beat.mp3",
        gain: 1.5,
        monitor: false,
        loop: false,
      },
    },
  ]);
  assert.equal(quiet.audio.gain, 1.5);
  assert.equal(quiet.audio.monitor, false);
  assert.equal(quiet.audio.loop, false);
  assert.equal(audioInputHasFile(quiet), true);
  assert.deepEqual(audioPlaybackSettings(quiet.audio), {
    gain: 1.5,
    monitor: false,
    loop: false,
  });
  const [stored] = persistableDocumentInputs([quiet]);
  assert.equal(stored.audio.gain, 1.5);
  assert.equal(stored.audio.monitor, false);
  assert.equal(stored.audio.loop, false);
  const [defaults] = persistableDocumentInputs([
    {
      type: "audio",
      audio: { url: "https://cdn.example.com/ok.mp3", name: "ok.mp3" },
    },
  ]);
  assert.equal(defaults.audio.gain, undefined);
  assert.equal(defaults.audio.monitor, undefined);
  assert.equal(defaults.audio.loop, undefined);
});

test("persistable inputs keep assetPath and drop draft keys", () => {
  const stored = persistableDocumentInputs([
    {
      type: "audio",
      audio: {
        url: "blob:http://localhost/a",
        name: "beat.mp3",
        assetPath: "owner/shader/assets/audio.mp3",
        localAssetKey: "local-draft-media:v1:draft/audio-1",
      },
    },
  ]);
  assert.equal(stored[0].audio.assetPath, "owner/shader/assets/audio.mp3");
  assert.equal(stored[0].audio.url, "");
  assert.equal(stored[0].audio.localAssetKey, undefined);
});

test("hasAudioInput ignores empty audio rows", () => {
  assert.equal(hasAudioInput([{ type: "audio", audio: { url: "" } }]), false);
  assert.equal(
    hasAudioInput([{ type: "audio", enabled: true, audio: { url: "/a.mp3" } }]),
    true,
  );
  assert.equal(hasAudioInput([{ type: "microphone" }]), true);
  assert.ok(enabledAudioFileInput([{ type: "audio", audio: { url: "/a.mp3" } }]));
});

test("removedDocumentInputs returns rows that left the list", () => {
  const kept = { id: "keep", type: "microphone" };
  const gone = {
    id: "gone",
    type: "audio",
    audio: { url: "/beat.mp3", name: "beat.mp3" },
  };
  const removed = removedDocumentInputs([kept, gone], [kept]);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].id, "gone");
  assert.deepEqual(removedDocumentInputs([kept], [kept]), []);
});
