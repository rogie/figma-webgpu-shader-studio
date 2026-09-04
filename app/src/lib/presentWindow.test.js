import assert from "node:assert/strict";
import test from "node:test";
import {
  createPresentSessionId,
  isPresentMessage,
  makePresentUrl,
  presentChannelName,
  presentMessage,
  presentParameterLayers,
  presentStructureKey,
  readPresentSessionId,
} from "./presentWindow.js";

test("builds a session-scoped embed URL and channel name", () => {
  const sessionId = createPresentSessionId(
    () => "12345678-1234-1234-1234-123456789abc",
  );
  const url = makePresentUrl(
    "https://example.com/composer/draft%3A1/embed?existing=true",
    sessionId,
  );

  assert.equal(sessionId, "12345678123412341234123456789abc");
  assert.equal(
    url,
    "https://example.com/composer/draft%3A1/embed?existing=true&present=12345678123412341234123456789abc",
  );
  assert.equal(
    presentChannelName(sessionId),
    `figma-shader-studio:present:${sessionId}`,
  );
  assert.equal(
    readPresentSessionId(new URL(url)),
    "12345678123412341234123456789abc",
  );
});

test("presentation structure ignores live parameters but detects graph changes", () => {
  const payload = {
    id: "shader-1",
    sessionId: "cloud:shader-1",
    document: {
      kind: "composition",
      source: "",
      parameterValues: { amount: 0.2 },
      composition: {
        fills: [{ id: "fill-1", enabled: true, values: { scale: 1 } }],
        effects: [{ id: "effect-1", enabled: true, values: { amount: 0.2 } }],
      },
      dependencySnapshots: {},
    },
  };
  const initial = presentStructureKey(payload);
  const parameterChange = presentStructureKey({
    ...payload,
    document: {
      ...payload.document,
      parameterValues: { amount: 0.8 },
      composition: {
        ...payload.document.composition,
        effects: [
          { id: "effect-1", enabled: true, values: { amount: 0.8 } },
        ],
      },
    },
  });
  const graphChange = presentStructureKey({
    ...payload,
    document: {
      ...payload.document,
      composition: {
        ...payload.document.composition,
        effects: [
          { id: "effect-1", enabled: false, values: { amount: 0.2 } },
        ],
      },
    },
  });

  assert.equal(parameterChange, initial);
  assert.notEqual(graphChange, initial);
  assert.deepEqual(presentParameterLayers(payload), [
    { id: "fill-1", values: { scale: 1 } },
    { id: "effect-1", values: { amount: 0.2 } },
  ]);
});

test("rejects malformed presentation sessions and messages", () => {
  assert.equal(readPresentSessionId({ search: "?present=bad" }), null);
  assert.throws(() => presentChannelName("bad"), /Invalid presentation/);
  assert.throws(
    () => makePresentUrl("https://example.com/embed", "bad"),
    /Invalid presentation/,
  );

  const ready = presentMessage("ready");
  assert.equal(isPresentMessage(ready, "ready"), true);
  assert.equal(isPresentMessage(ready, "state"), false);
  assert.equal(isPresentMessage({ ...ready, version: 2 }, "ready"), false);
  assert.equal(isPresentMessage(null, "ready"), false);
});
