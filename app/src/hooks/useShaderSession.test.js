import test from "node:test";
import assert from "node:assert/strict";
import {
  activateBeforeHydration,
  beginSessionRequest,
  persistBeforeSessionActivation,
} from "../lib/sessionRequests.js";

test("stale navigation requests cannot activate a newer session", () => {
  const request = { current: 4 };
  assert.equal(beginSessionRequest(request, 3), false);
  assert.equal(request.current, 4);
  assert.equal(beginSessionRequest(request, 4), true);
});

test("local navigation invalidates in-flight cloud requests", () => {
  const request = { current: 4 };
  assert.equal(beginSessionRequest(request), true);
  assert.equal(request.current, 5);
  assert.equal(beginSessionRequest(request, 4), false);
});

test("navigation that becomes stale while persistence runs cannot activate", async () => {
  const request = { current: 4 };
  let release;
  const persisted = new Promise((resolve) => {
    release = resolve;
  });
  const pending = persistBeforeSessionActivation({
    persist: () => persisted,
    sessionRequestRef: request,
    requestId: 4,
  });

  request.current = 5;
  release();
  assert.equal(await pending, false);
});

test("fill metadata activates before media hydration resolves", async () => {
  const calls = [];
  let resolveHydration;
  const hydration = new Promise((resolve) => {
    resolveHydration = resolve;
  });
  const pending = activateBeforeHydration({
    session: { composition: { effectFills: [{ id: "photo" }] } },
    activate: async (session) => {
      calls.push(["activate", session.composition.effectFills[0].id]);
    },
    hydrate: async () => {
      calls.push(["hydrate"]);
      return hydration;
    },
  });

  await Promise.resolve();
  assert.deepEqual(calls, [
    ["activate", "photo"],
    ["hydrate"],
  ]);
  resolveHydration({ effectFills: [{ id: "photo", url: "signed" }] });
  assert.deepEqual(await pending, {
    effectFills: [{ id: "photo", url: "signed" }],
  });
});

test("media hydration starts while session activation is still pending", async () => {
  const calls = [];
  let releaseActivation;
  const activation = new Promise((resolve) => {
    releaseActivation = resolve;
  });
  const pending = activateBeforeHydration({
    session: { composition: { inputs: [{ type: "audio" }] } },
    activate: async () => {
      calls.push("activate");
      await activation;
    },
    hydrate: async (composition) => {
      calls.push("hydrate");
      return composition;
    },
  });

  await Promise.resolve();
  assert.deepEqual(calls, ["activate", "hydrate"]);
  releaseActivation();
  assert.deepEqual(await pending, { inputs: [{ type: "audio" }] });
});

test("stale hydrated media cannot update the active session", async () => {
  let current = true;
  const result = activateBeforeHydration({
    session: { composition: { effectFills: [{ id: "old" }] } },
    activate: async () => {},
    hydrate: async () => {
      current = false;
      return { effectFills: [{ id: "old", url: "signed" }] };
    },
    isCurrent: () => current,
  });

  assert.equal(await result, null);
});
