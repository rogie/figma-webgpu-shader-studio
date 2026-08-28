import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedStateRevision,
  rememberStateRevision,
} from "./stateRevisionBaseline.js";

test("a committed RPC revision survives a later side-effect failure", () => {
  const revisions = new Map();
  const staleEditorRow = { id: "shader", state_revision: 4 };

  assert.equal(expectedStateRevision(revisions, staleEditorRow), 4);
  rememberStateRevision(revisions, { id: "shader", state_revision: 5 });

  assert.equal(expectedStateRevision(revisions, staleEditorRow), 5);
});

test("stale renders cannot regress a newer conflict baseline", () => {
  const revisions = new Map([["shader", 8]]);

  assert.equal(
    rememberStateRevision(revisions, { id: "shader", state_revision: 7 }),
    8,
  );
  assert.equal(
    expectedStateRevision(revisions, { id: "shader", state_revision: 7 }),
    8,
  );
});
