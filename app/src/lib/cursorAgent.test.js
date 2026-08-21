import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  clearCursorAgent,
  cursorAgentIdForModel,
  loadCursorAgent,
  saveCursorAgent,
} from "./cursorAgent.js";

const memory = new Map();
const previousLocalStorage = globalThis.localStorage;

function installLocalStorage() {
  globalThis.localStorage = {
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, String(value));
    },
    removeItem(key) {
      memory.delete(key);
    },
  };
}

before(() => {
  memory.clear();
  installLocalStorage();
});

after(() => {
  if (previousLocalStorage) globalThis.localStorage = previousLocalStorage;
  else delete globalThis.localStorage;
});

test("persists one Cursor agent for the whole app", () => {
  memory.clear();

  assert.equal(loadCursorAgent(), null);
  saveCursorAgent({
    agentId: "bc-11111111-2222-3333-4444-555555555555",
    modelId: "composer-2.5",
  });
  assert.deepEqual(loadCursorAgent(), {
    agentId: "bc-11111111-2222-3333-4444-555555555555",
    modelId: "composer-2.5",
  });
  assert.equal(
    cursorAgentIdForModel({ provider: "cursor", id: "composer-2.5" }),
    "bc-11111111-2222-3333-4444-555555555555"
  );
  assert.equal(
    cursorAgentIdForModel({ provider: "cursor", id: "auto-smart" }),
    undefined
  );
  assert.equal(
    cursorAgentIdForModel({ provider: "grok", id: "composer-2.5" }),
    undefined
  );

  clearCursorAgent();
  assert.equal(loadCursorAgent(), null);
});

test("rejects malformed Cursor agent ids", () => {
  memory.clear();
  saveCursorAgent({ agentId: "not-an-agent", modelId: "composer-2.5" });
  assert.equal(loadCursorAgent(), null);
});
