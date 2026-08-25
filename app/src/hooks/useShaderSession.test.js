import test from "node:test";
import assert from "node:assert/strict";
import {
  activateBeforeHydration,
  beginSessionRequest,
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
