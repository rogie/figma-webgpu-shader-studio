import assert from "node:assert/strict";
import test from "node:test";
import {
  copyChatThreadKey,
  loadChatThreads,
  mergeChatThreadMessages,
  migrateChatThreadKey,
  saveChatThreads,
} from "./chatThreads.js";

function memoryStorage() {
  const values = new Map();
  const writes = [];
  return {
    values,
    writes,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      const stringValue = String(value);
      values.set(key, stringValue);
      writes.push([key, stringValue]);
    },
  };
}

test("persists dismissed plan state", () => {
  const values = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };

  try {
    saveChatThreads({
      shader: [{
        role: "assistant",
        mode: "plan",
        content: "# Plan",
        planId: "plan-1",
        planDismissed: true,
      }],
    });

    assert.deepEqual(loadChatThreads(), {
      shader: [{
        role: "assistant",
        mode: "plan",
        content: "# Plan",
        planId: "plan-1",
        planDismissed: true,
      }],
    });
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("merges overlapping chat sequences without duplicating exact messages", () => {
  const shared = { role: "assistant", content: "Shared answer" };
  assert.deepEqual(
    mergeChatThreadMessages(
      [
        { role: "user", content: "Draft question" },
        shared,
      ],
      [
        shared,
        { role: "user", content: "Cloud follow-up" },
      ],
    ),
    [
      { role: "user", content: "Draft question" },
      shared,
      { role: "user", content: "Cloud follow-up" },
    ],
  );
});

test("merge preserves intentional duplicate-message multiplicity", () => {
  const repeated = { role: "user", content: "Try again" };
  const merged = mergeChatThreadMessages(
    [repeated, repeated, { role: "assistant", content: "Done" }],
    [repeated, { role: "assistant", content: "Done" }],
  );
  assert.deepEqual(merged, [
    repeated,
    repeated,
    { role: "assistant", content: "Done" },
  ]);
});

test("merge preserves both thread orderings when messages diverge", () => {
  const source = [
    { role: "user", content: "Draft start" },
    { role: "assistant", content: "Shared" },
    { role: "user", content: "Draft end" },
  ];
  const target = [
    { role: "assistant", content: "Cloud start" },
    { role: "assistant", content: "Shared" },
    { role: "user", content: "Cloud end" },
  ];
  const merged = mergeChatThreadMessages(source, target);
  const isSubsequence = (messages) => {
    let index = 0;
    for (const message of merged) {
      if (
        index < messages.length &&
        JSON.stringify(message) === JSON.stringify(messages[index])
      ) {
        index += 1;
      }
    }
    return index === messages.length;
  };

  assert.equal(isSubsequence(source), true);
  assert.equal(isSubsequence(target), true);
  assert.equal(
    merged.filter((message) => message.content === "Shared").length,
    1,
  );
});

test("migrates a draft thread to cloud in one atomic storage write", () => {
  const storage = memoryStorage();
  saveChatThreads(
    {
      "preset:draft:one": [
        { role: "user", content: "Draft question" },
        { role: "assistant", content: "Shared answer" },
      ],
      "cloud:saved": [
        { role: "assistant", content: "Shared answer" },
        { role: "user", content: "Cloud follow-up" },
      ],
      other: [{ role: "user", content: "Untouched" }],
    },
    storage,
  );
  storage.writes.length = 0;

  const migrated = migrateChatThreadKey(
    "preset:draft:one",
    "cloud:saved",
    storage,
  );

  assert.equal(storage.writes.length, 1);
  assert.equal("preset:draft:one" in migrated, false);
  assert.deepEqual(migrated["cloud:saved"], [
    { role: "user", content: "Draft question" },
    { role: "assistant", content: "Shared answer" },
    { role: "user", content: "Cloud follow-up" },
  ]);
  assert.deepEqual(migrated.other, [
    { role: "user", content: "Untouched" },
  ]);
  assert.deepEqual(loadChatThreads(storage), migrated);
});

test("migration moves a source-only thread and ignores invalid transitions", () => {
  const storage = memoryStorage();
  saveChatThreads(
    {
      "preset:draft:one": [{ role: "user", content: "Keep me" }],
    },
    storage,
  );
  storage.writes.length = 0;

  const unchanged = migrateChatThreadKey(
    "preset:built-in",
    "cloud:one",
    storage,
  );
  assert.deepEqual(unchanged, {
    "preset:draft:one": [{ role: "user", content: "Keep me" }],
  });
  assert.equal(storage.writes.length, 0);

  const moved = migrateChatThreadKey(
    "preset:draft:one",
    "cloud:one",
    storage,
  );
  assert.deepEqual(moved, {
    "cloud:one": [{ role: "user", content: "Keep me" }],
  });
  assert.equal(storage.writes.length, 1);

  migrateChatThreadKey("preset:draft:missing", "cloud:two", storage);
  assert.equal(storage.writes.length, 1);
});

test("copy preserves the source thread and merges an existing target", () => {
  const storage = memoryStorage();
  saveChatThreads(
    {
      "cloud:source": [
        { role: "user", content: "Original question" },
        { role: "assistant", content: "Shared answer" },
      ],
      "cloud:copy": [
        { role: "assistant", content: "Shared answer" },
        { role: "user", content: "Copy follow-up" },
      ],
    },
    storage,
  );
  storage.writes.length = 0;

  const copied = copyChatThreadKey("cloud:source", "cloud:copy", storage);

  assert.equal(storage.writes.length, 1);
  assert.deepEqual(copied["cloud:source"], [
    { role: "user", content: "Original question" },
    { role: "assistant", content: "Shared answer" },
  ]);
  assert.deepEqual(copied["cloud:copy"], [
    { role: "user", content: "Original question" },
    { role: "assistant", content: "Shared answer" },
    { role: "user", content: "Copy follow-up" },
  ]);
});
