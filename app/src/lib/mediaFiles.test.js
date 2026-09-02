import assert from "node:assert/strict";
import test from "node:test";
import { fileFromBlobUrl, mediaType } from "./mediaFiles.js";

test("mediaType infers svg, video, and audio types", () => {
  assert.equal(
    mediaType({ type: "image/svg+xml", name: "mark.svg" }),
    "image/svg+xml"
  );
  assert.equal(mediaType({ type: "", name: "logo.svg" }), "image/svg+xml");
  assert.equal(mediaType({ type: "", name: "clip.webm" }), "video/webm");
  assert.equal(mediaType({ type: "", name: "beat.mp3" }), "audio/mpeg");
  assert.equal(mediaType({ type: "", name: "notes.txt" }), undefined);
});

test("fileFromBlobUrl converts data video urls into uploadable files", async () => {
  const file = await fileFromBlobUrl(
    "data:video/mp4;base64,AAEC",
    "camera.mp4"
  );

  assert.ok(file);
  assert.equal(file.name, "camera.mp4");
  assert.equal(file.type, "video/mp4");
  assert.equal(file.size, 3);
});
