import assert from "node:assert/strict";
import test from "node:test";
import { removePromotedDraftState } from "./draftPromotionCleanup.js";

test("promotion removes durable draft state before deleting its media", async () => {
  const events = [];
  const storage = {
    getItem: () => "draft:one",
    removeItem: (key) => events.push(["remove-active", key]),
  };
  const thumbnails = { "draft:one": "data:image/png;base64,one" };

  const remaining = await removePromotedDraftState({
    draftId: "draft:one",
    drafts: [{ id: "draft:one" }, { id: "draft:two" }],
    thumbnailDataUrls: thumbnails,
    writeDrafts: (drafts) =>
      events.push(["write", drafts.map((draft) => draft.id)]),
    activeDraftStorageKey: "active",
    storage,
    onStateRemoved: (drafts) =>
      events.push(["state", drafts.map((draft) => draft.id)]),
    removeMedia: async (draftId) => events.push(["remove-media", draftId]),
  });

  assert.deepEqual(remaining, [{ id: "draft:two" }]);
  assert.deepEqual(events, [
    ["write", ["draft:two"]],
    ["remove-active", "active"],
    ["state", ["draft:two"]],
    ["remove-media", "draft:one"],
  ]);
  assert.equal("draft:one" in thumbnails, false);
});
