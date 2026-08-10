import assert from "node:assert/strict";
import test from "node:test";
import { ShaderHost } from "./host.js";

function makeHost() {
  const host = new ShaderHost({
    addEventListener() {},
    removeEventListener() {},
  });
  host.ready = true;
  host.renderFn = () => {};
  return host;
}

test("static shaders redraw once without starting a continuous RAF loop", () => {
  const originalRaf = globalThis.requestAnimationFrame;
  let rafCalls = 0;
  globalThis.requestAnimationFrame = () => {
    rafCalls += 1;
    return rafCalls;
  };
  try {
    const host = makeHost();
    let redraws = 0;
    host.redraw = () => {
      redraws += 1;
    };

    host.start();
    assert.equal(host.running, true);
    assert.equal(rafCalls, 0);
    assert.equal(redraws, 1);

    host.setParams({ amount: 0.5 });
    assert.equal(redraws, 2);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
  }
});

test("animated shaders schedule RAF and pause while inactive", () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let rafCalls = 0;
  let cancelled = 0;
  globalThis.requestAnimationFrame = () => {
    rafCalls += 1;
    return rafCalls;
  };
  globalThis.cancelAnimationFrame = (id) => {
    cancelled = id;
  };
  try {
    const host = makeHost();
    host.isAnimated = true;
    host.start();

    assert.equal(rafCalls, 1);
    assert.equal(host.rafId, 1);

    host.setActive(false);
    assert.equal(cancelled, 1);
    assert.equal(host.rafId, 0);
    assert.equal(host.running, true);

    host.setActive(true);
    assert.equal(rafCalls, 2);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
