import assert from "node:assert/strict";
import test from "node:test";
import { createOrResumeCloudDraft } from "./cloudDraftPromotion.js";

test("a retry resumes a deterministic cloud row after secondary work failed", async () => {
  let remote = { id: "shader", state_revision: 2 };
  let createCalls = 0;
  let saveCalls = 0;
  let updateCalls = 0;
  const committed = [];
  const options = {
    shaderId: "shader",
    createPayload: { id: "shader", source: "next" },
    statePayload: { source: "next", checkpointKind: "manual" },
    metadataPayload: { name: "Draft" },
    getExisting: async () => remote,
    create: async () => {
      createCalls += 1;
      return remote;
    },
    saveState: async ({ expectedStateRevision }) => {
      assert.equal(expectedStateRevision, remote.state_revision);
      saveCalls += 1;
      if (saveCalls === 1) {
        remote = { ...remote, state_revision: remote.state_revision + 1 };
      }
      return remote;
    },
    updateMetadata: async (_id, metadata, { expectedStateRevision }) => {
      updateCalls += 1;
      assert.equal(expectedStateRevision, remote.state_revision);
      if (updateCalls === 1) throw new Error("thumbnail metadata failed");
      remote = { ...remote, ...metadata };
      return remote;
    },
    onStateCommitted: (shader) => committed.push(shader.state_revision),
  };

  await assert.rejects(
    () => createOrResumeCloudDraft(options),
    /thumbnail metadata failed/,
  );
  const retried = await createOrResumeCloudDraft(options);

  assert.equal(retried.resumed, true);
  assert.equal(retried.shader.name, "Draft");
  assert.equal(createCalls, 0);
  assert.deepEqual(committed, [3, 3]);
});
