import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  bindCursorAgentToSource,
  clearCursorAgent,
  copyCursorAgentThreadKey,
  cursorAgentIdForModel,
  loadCursorAgent,
  migrateCursorAgentThreadKey,
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

test("persists a default Cursor agent for legacy callers", () => {
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

test("reuses a stored agent across Cursor model aliases and keeps runId", () => {
  memory.clear();
  saveCursorAgent({
    agentId: "bc-11111111-2222-3333-4444-555555555555",
    modelId: "composer-2.5",
    runId: "run-first",
  });
  assert.equal(
    cursorAgentIdForModel({
      provider: "cursor",
      id: "composer-2",
      aliases: ["composer-2.5", "composer"],
    }),
    "bc-11111111-2222-3333-4444-555555555555"
  );
  saveCursorAgent({
    agentId: "bc-11111111-2222-3333-4444-555555555555",
    modelId: "composer-2",
  });
  assert.deepEqual(loadCursorAgent(), {
    agentId: "bc-11111111-2222-3333-4444-555555555555",
    modelId: "composer-2",
    runId: "run-first",
  });
  saveCursorAgent({
    agentId: "bc-11111111-2222-3333-4444-555555555555",
    modelId: "composer-2",
    runId: "run-second",
  });
  assert.equal(loadCursorAgent().runId, "run-second");
});

test("only reuses a Cursor agent for the same shader source revision", () => {
  memory.clear();
  const model = { provider: "cursor", id: "composer-2.5" };
  const agentId = "bc-11111111-2222-3333-4444-555555555555";
  saveCursorAgent({
    agentId,
    modelId: model.id,
    threadId: "cloud:shader-1",
    source: "export function render() { return 1 }\n",
  });

  assert.equal(
    cursorAgentIdForModel(model, {
      threadId: "cloud:shader-1",
      source: "export function render() { return 1 }\n",
    }),
    agentId
  );
  assert.equal(
    cursorAgentIdForModel(model, {
      threadId: "cloud:shader-1",
      source: "export function render() { return 2 }\n",
    }),
    undefined
  );
  assert.equal(
    cursorAgentIdForModel(model, {
      threadId: "cloud:shader-2",
      source: "export function render() { return 1 }\n",
    }),
    undefined
  );

  bindCursorAgentToSource(model, {
    threadId: "cloud:shader-1",
    source: "export function render() { return 2 }\n",
  });
  assert.equal(
    cursorAgentIdForModel(model, {
      threadId: "cloud:shader-1",
      source: "export function render() { return 2 }\n",
    }),
    agentId
  );
});

test("rejects malformed Cursor agent ids", () => {
  memory.clear();
  saveCursorAgent({ agentId: "not-an-agent", modelId: "composer-2.5" });
  assert.equal(loadCursorAgent(), null);
});

test("migrates the legacy singleton into its shader binding", () => {
  memory.clear();
  memory.set(
    "shader-studio.cursorAgent.v1",
    JSON.stringify({
      agentId: "bc-11111111-2222-3333-4444-555555555555",
      modelId: "composer-2.5",
      threadId: "cloud:legacy",
      sourceFingerprint: "13:abcdef",
    }),
  );

  assert.equal(
    loadCursorAgent("cloud:legacy").agentId,
    "bc-11111111-2222-3333-4444-555555555555",
  );
  assert.equal(memory.has("shader-studio.cursorAgent.v1"), false);
  assert.equal(memory.has("shader-studio.cursorAgents.v2"), true);
});

test("migrates an agent binding when a draft becomes cloud-backed", () => {
  memory.clear();
  saveCursorAgent({
    agentId: "bc-11111111-2222-3333-4444-555555555555",
    modelId: "composer-2.5",
    runId: "run-first",
    threadId: "preset:draft:one",
    source: "export function render() {}\n",
  });

  const migrated = migrateCursorAgentThreadKey(
    "preset:draft:one",
    "cloud:shader-one",
  );
  assert.equal(migrated.threadId, "cloud:shader-one");
  assert.equal(loadCursorAgent().runId, "run-first");

  const unchanged = migrateCursorAgentThreadKey(
    "preset:draft:other",
    "cloud:other",
  );
  assert.equal(unchanged.threadId, "cloud:shader-one");
});

test("stores independent bindings and copies one without moving its source", () => {
  memory.clear();
  const firstAgent = "bc-11111111-2222-3333-4444-555555555555";
  const secondAgent = "bc-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  saveCursorAgent({
    agentId: firstAgent,
    modelId: "composer-2.5",
    threadId: "cloud:first",
    source: "first source",
  });
  saveCursorAgent({
    agentId: secondAgent,
    modelId: "composer-2.5",
    threadId: "cloud:second",
    source: "second source",
  });

  assert.equal(loadCursorAgent("cloud:first").agentId, firstAgent);
  assert.equal(loadCursorAgent("cloud:second").agentId, secondAgent);

  copyCursorAgentThreadKey("cloud:first", "cloud:first-copy");
  assert.equal(loadCursorAgent("cloud:first").agentId, firstAgent);
  assert.equal(loadCursorAgent("cloud:first-copy").agentId, firstAgent);

  migrateCursorAgentThreadKey("cloud:second", "cloud:second-promoted");
  assert.equal(loadCursorAgent("cloud:second"), null);
  assert.equal(loadCursorAgent("cloud:second-promoted").agentId, secondAgent);
});
