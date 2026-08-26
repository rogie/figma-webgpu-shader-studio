import assert from "node:assert/strict";
import test from "node:test";
import { loadChatThreads, saveChatThreads } from "./chatThreads.js";

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
