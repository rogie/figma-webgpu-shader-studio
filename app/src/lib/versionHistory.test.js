import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeVersionPage,
  visibleVersionHistory,
} from "./versionHistory.js";

test("version rows are exposed only while history is open", () => {
  const versions = [{ id: "v2" }, { id: "v1" }];
  assert.deepEqual(visibleVersionHistory(versions, false), []);
  assert.deepEqual(visibleVersionHistory(versions, true), versions);
});

test("version pagination appends unique rows and reports another cursor page", () => {
  const existing = [{ id: "v3", version_number: 3 }];
  const page = [
    { id: "v3", version_number: 3 },
    { id: "v2", version_number: 2 },
  ];
  const result = mergeVersionPage(existing, page, { pageSize: 2 });

  assert.deepEqual(
    result.versions.map((version) => version.id),
    ["v3", "v2"],
  );
  assert.equal(result.hasMore, true);
});

test("refresh replaces cached versions and closes pagination on a short page", () => {
  const result = mergeVersionPage(
    [{ id: "old" }],
    [{ id: "latest", version_number: 4 }],
    { reset: true, pageSize: 25 },
  );

  assert.deepEqual(result.versions.map((version) => version.id), ["latest"]);
  assert.equal(result.hasMore, false);
});
