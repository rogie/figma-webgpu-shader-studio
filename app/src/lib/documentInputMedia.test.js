import assert from "node:assert/strict";
import test from "node:test";
import { createDraftMediaRecord } from "./draftMediaStorage.js";
import {
  audioInputRoleId,
  documentAudioAssetPaths,
  hasDraftAudioMedia,
  hydrateAudioInputsWithUrls,
  hydrateDraftAudioInputs,
  persistDraftAudioInputs,
  uploadDocumentInputAudio,
  withAudioInputAssetPath,
} from "./documentInputMedia.js";

test("audio input role ids are storage-safe", () => {
  assert.equal(audioInputRoleId("beat 1"), "audio-beat-1");
  assert.equal(documentAudioAssetPaths([
    { type: "audio", audio: { assetPath: "owner/shader/assets/a.mp3" } },
    { type: "microphone" },
  ])[0], "owner/shader/assets/a.mp3");
});

test("persistable cloud audio keeps assetPath and drops blob urls", async () => {
  const store = {
    records: new Map(),
    async put(record) {
      this.records.set(record.roleId, record);
    },
    async get(_draftId, roleId) {
      return this.records.get(roleId) || null;
    },
  };
  const file = new File([new Uint8Array([1, 2, 3])], "beat.mp3", {
    type: "audio/mpeg",
  });
  const persisted = await persistDraftAudioInputs(
    "draft:one",
    [
      {
        type: "audio",
        id: "beat",
        audio: { url: "blob:http://localhost/a", name: "beat.mp3" },
      },
    ],
    store,
    { fileFromUrl: async () => file },
  );
  assert.match(persisted[0].audio.localAssetKey, /audio-beat/);
  assert.equal(store.records.get("audio-beat").fileName, "beat.mp3");
});

test("hydrates audio urls from signed asset paths", () => {
  const [input] = hydrateAudioInputsWithUrls(
    [{ type: "audio", audio: { assetPath: "owner/a.mp3", name: "a.mp3" } }],
    { "owner/a.mp3": "https://cdn.example.com/a.mp3" },
  );
  assert.equal(input.audio.url, "https://cdn.example.com/a.mp3");
});

test("withAudioInputAssetPath stores a durable reference", () => {
  const next = withAudioInputAssetPath(
    {
      type: "audio",
      id: "beat",
      audio: { url: "blob:http://localhost/a", name: "old.mp3", localAssetKey: "x" },
    },
    "owner/shader/assets/audio-beat-hash.mp3",
    "beat.mp3",
  );
  assert.equal(next.audio.assetPath, "owner/shader/assets/audio-beat-hash.mp3");
  assert.equal(next.audio.url, "");
  assert.equal(next.audio.name, "beat.mp3");
  assert.equal(next.audio.localAssetKey, undefined);
});

test("hydrateDraftAudioInputs restores a blob url from the media store", async () => {
  const blob = new Blob([new Uint8Array([9])], { type: "audio/mpeg" });
  const record = createDraftMediaRecord({
    draftId: "draft:one",
    roleId: "audio-beat",
    blob,
    fileName: "beat.mp3",
  });
  const store = {
    async get() {
      return record;
    },
  };
  const urls = [];
  const [input] = await hydrateDraftAudioInputs(
    "draft:one",
    [{ type: "audio", id: "beat", audio: { name: "beat.mp3" } }],
    store,
    {
      urlApi: {
        createObjectURL(value) {
          urls.push(value);
          return "blob:restored";
        },
      },
    },
  );
  assert.equal(input.audio.url, "blob:restored");
  assert.equal(urls.length, 1);
});

test("hasDraftAudioMedia detects blob urls and stored keys", () => {
  assert.equal(hasDraftAudioMedia([{ type: "microphone" }]), false);
  assert.equal(
    hasDraftAudioMedia([
      { type: "audio", audio: { url: "blob:http://localhost/a", name: "a.mp3" } },
    ]),
    true,
  );
  assert.equal(
    hasDraftAudioMedia([
      { type: "audio", audio: { assetPath: "owner/shader/assets/a.mp3" } },
    ]),
    true,
  );
});

test("uploadDocumentInputAudio stores a durable assetPath", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "beat.mp3", {
    type: "audio/mpeg",
  });
  const uploaded = [];
  const [input] = await uploadDocumentInputAudio({
    inputs: [
      {
        type: "audio",
        id: "beat",
        audio: { url: "blob:http://localhost/a", name: "beat.mp3" },
      },
    ],
    ownerId: "owner",
    shaderId: "shader",
    fileFromUrl: async () => file,
    uploadAsset: async (args) => {
      uploaded.push(args);
      return "owner/shader/assets/audio-beat-hash.mp3";
    },
    mediaType: () => "audio/mpeg",
  });
  assert.equal(uploaded[0].role, "audio-beat");
  assert.equal(input.audio.assetPath, "owner/shader/assets/audio-beat-hash.mp3");
  assert.equal(input.audio.url, "");
  assert.equal(input.audio.name, "beat.mp3");
});

test("persistDraftAudioInputs copies a durable asset into the draft store", async () => {
  const store = {
    records: new Map(),
    async put(record) {
      this.records.set(record.roleId, record);
    },
    async get() {
      return null;
    },
  };
  await persistDraftAudioInputs(
    "draft:one",
    [
      {
        type: "audio",
        id: "beat",
        audio: { assetPath: "owner/shader/assets/a.mp3", name: "beat.mp3" },
      },
    ],
    store,
    {
      fileFromUrl: async () => null,
      downloadAsset: async () =>
        new Blob([new Uint8Array([4, 5])], { type: "audio/mpeg" }),
    },
  );
  assert.equal(store.records.get("audio-beat").fileName, "beat.mp3");
});
