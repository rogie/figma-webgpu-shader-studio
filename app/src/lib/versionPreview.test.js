import assert from "node:assert/strict";
import test from "node:test";
import { versionPreviewRestoreSnapshot } from "./versionPreview.js";

test("an applied hover preview always restores its captured live graph", () => {
  const snapshot = {
    source: "same source as the preview",
    kind: "composition",
    composition: {
      fills: [{ id: "live-fill" }],
      effects: [{ id: "live-effect" }],
    },
  };

  assert.strictEqual(versionPreviewRestoreSnapshot(snapshot, true), snapshot);
});

test("an unapplied or missing preview has no teardown restore", () => {
  assert.equal(
    versionPreviewRestoreSnapshot({ source: "live source" }, false),
    null,
  );
  assert.equal(versionPreviewRestoreSnapshot(null, true), null);
});
