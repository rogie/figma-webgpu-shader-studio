import assert from "node:assert/strict";
import test from "node:test";
import { mediaType } from "./mediaFiles.js";

test("mediaType infers svg and common image/video types", () => {
  assert.equal(
    mediaType({ type: "image/svg+xml", name: "mark.svg" }),
    "image/svg+xml"
  );
  assert.equal(mediaType({ type: "", name: "logo.svg" }), "image/svg+xml");
  assert.equal(mediaType({ type: "", name: "clip.webm" }), "video/webm");
  assert.equal(mediaType({ type: "", name: "notes.txt" }), undefined);
});
