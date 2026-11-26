import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createFigmaAuthoringReferenceLoader } from "../../supabase/functions/chat/figmaAuthoringReference.mjs";

const fixture = `# Shader source authoring

## Required module contract

Use defineProperties from figma:shaders.

## Runtime lifecycle

Read frame.mousePosition for local coordinates.

## Animation and mouse input

Set metadata.usesMouse when reading pointer input.
`;

function referenceResponse(text) {
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

test("hashes the official reference and coalesces concurrent refreshes", async () => {
  let calls = 0;
  let time = 100;
  let body = fixture;
  const load = createFigmaAuthoringReferenceLoader({
    now: () => time,
    refreshMs: 100,
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url, "https://raw.githubusercontent.com/figma/mcp-server-guide/main/skills/figma-shaders/references/authoring.md");
      assert.equal(options.redirect, "error");
      assert.deepEqual(options.headers, { Accept: "text/plain" });
      return referenceResponse(body);
    },
  });

  const [first, concurrent] = await Promise.all([load(), load()]);
  assert.equal(calls, 1);
  assert.equal(first, concurrent);
  assert.deepEqual(first, {
    text: fixture,
    revision: `sha256:${createHash("sha256").update(fixture).digest("hex")}`,
  });

  assert.equal(await load(), first);
  body = `${fixture}\nRevised guidance for existing capabilities.\n`;
  time += 100;
  const revised = await load();
  assert.equal(calls, 2);
  assert.equal(revised.text, body);
  assert.notEqual(revised.revision, first.revision);
});

test("keeps the last verified reference briefly after rejected refreshes", async () => {
  let calls = 0;
  let time = 100;
  const load = createFigmaAuthoringReferenceLoader({
    now: () => time,
    refreshMs: 10,
    retryMs: 20,
    maxAgeMs: 35,
    fetcher: async () => referenceResponse(calls++ === 0 ? fixture : "Unrecognized document"),
  });
  const verified = await load();
  assert.ok(verified);

  time = 110;
  assert.equal(await load(), verified);
  time = 115;
  assert.equal(await load(), verified);
  assert.equal(calls, 2);

  time = 135;
  assert.equal(await load(), null);
  assert.equal(calls, 3);
});

test("rejects HTML, a different response origin, and oversize streams", async () => {
  const redirected = referenceResponse(fixture);
  Object.defineProperty(redirected, "url", { value: "https://example.com/authoring.md" });
  const oversized = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(fixture));
      controller.enqueue(new Uint8Array(64 * 1024));
      controller.close();
    },
  });
  for (const response of [
    new Response(fixture, { headers: { "content-type": "text/html" } }),
    redirected,
    referenceResponse(oversized),
  ]) {
    const load = createFigmaAuthoringReferenceLoader({ fetcher: async () => response });
    assert.equal(await load(), null);
  }
});

test("times out an unresponsive fetch and aborts the transaction", async () => {
  let signal;
  const load = createFigmaAuthoringReferenceLoader({
    timeoutMs: 10,
    fetcher: async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });

  assert.equal(await load(), null);
  assert.equal(signal.aborted, true);
});
