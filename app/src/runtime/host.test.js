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

test("play schedules RAF even when animation source inference is false", () => {
  const originalRaf = globalThis.requestAnimationFrame;
  let rafCalls = 0;
  globalThis.requestAnimationFrame = () => {
    rafCalls += 1;
    return rafCalls;
  };
  try {
    const host = makeHost();
    host.start();
    assert.equal(host.running, true);
    assert.equal(rafCalls, 1);
    assert.equal(host.rafId, 1);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
  }
});

test("play advances time uniforms on every animation frame", () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const callbacks = [];
  globalThis.requestAnimationFrame = (callback) => {
    callbacks.push(callback);
    return callbacks.length;
  };
  try {
    const host = makeHost();
    const presentedTimes = [];
    host.startTime = 100;
    host._present = () => {
      presentedTimes.push(host.frame.time);
    };

    host.start();
    callbacks[0](150);

    assert.equal(host.frame.time, 50);
    assert.equal(host.frame.frame, 1);
    assert.deepEqual(presentedTimes, [50]);
    assert.equal(callbacks.length, 2);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
  }
});

function makeMouseHost() {
  const host = makeHost();
  host.usesMouse = true;
  host.frame.time = 321;
  host.canvas.width = 200;
  host.canvas.height = 100;
  host.canvas.getBoundingClientRect = () => ({
    left: 10,
    top: 20,
    width: 100,
    height: 50,
  });
  return host;
}

function stubAnimationFrame() {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const pending = new Map();
  let nextId = 0;
  globalThis.requestAnimationFrame = (callback) => {
    nextId += 1;
    pending.set(nextId, callback);
    return nextId;
  };
  globalThis.cancelAnimationFrame = (id) => {
    pending.delete(id);
  };
  return {
    flush() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(0);
    },
    restore() {
      globalThis.requestAnimationFrame = originalRaf;
      globalThis.cancelAnimationFrame = originalCancel;
    },
  };
}

test("mouse shaders redraw while paused without advancing time", () => {
  const raf = stubAnimationFrame();
  try {
    const host = makeMouseHost();
    let redraws = 0;
    host.redraw = () => {
      redraws += 1;
    };

    host._onMouse({ clientX: 60, clientY: 45 });
    assert.deepEqual(host.frame.mousePosition, { x: 100, y: 50 });
    assert.equal(host.frame.time, 321);
    assert.equal(redraws, 1);

    host._onMouseLeave();
    raf.flush();
    assert.deepEqual(host.frame.mousePosition, { x: 0, y: 0 });
    assert.equal(host.frame.time, 321);
    assert.equal(redraws, 2);

    host.running = true;
    host.rafId = 1;
    host._onMouse({ clientX: 35, clientY: 30 });
    assert.equal(redraws, 2);
  } finally {
    raf.restore();
  }
});

test("moving between canvas and overlay handles keeps mousePosition", () => {
  const raf = stubAnimationFrame();
  try {
    const host = makeMouseHost();
    host.redraw = () => {};

    // Leaving the canvas for a control handle: the overlay move wins.
    host._onMouseLeave();
    host._onMouse({ clientX: 60, clientY: 45 });
    raf.flush();
    assert.deepEqual(host.frame.mousePosition, { x: 100, y: 50 });

    // Leaving the preview entirely still clears the position.
    host._onMouseLeave();
    raf.flush();
    assert.deepEqual(host.frame.mousePosition, { x: 0, y: 0 });
  } finally {
    raf.restore();
  }
});

test("setPointerSurface tracks the overlay and detaches on destroy", () => {
  const raf = stubAnimationFrame();
  const listeners = [];
  const surface = {
    addEventListener: (type, handler) => listeners.push([type, handler]),
    removeEventListener: (type, handler) => {
      const index = listeners.findIndex(
        ([listenerType, listenerHandler]) =>
          listenerType === type && listenerHandler === handler
      );
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  try {
    const host = makeMouseHost();
    host.redraw = () => {};
    host.setPointerSurface(surface);
    assert.deepEqual(
      listeners.map(([type]) => type),
      ["pointermove", "pointerleave"]
    );

    // Repeat calls must not stack duplicate listeners.
    host.setPointerSurface(surface);
    assert.equal(listeners.length, 2);

    const move = listeners.find(([type]) => type === "pointermove")[1];
    move({ clientX: 60, clientY: 45 });
    assert.deepEqual(host.frame.mousePosition, { x: 100, y: 50 });

    host.setPointerSurface(null);
    assert.equal(listeners.length, 0);
  } finally {
    raf.restore();
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

test("start restarts RAF when marked running but the loop stopped", () => {
  const originalRaf = globalThis.requestAnimationFrame;
  let rafCalls = 0;
  globalThis.requestAnimationFrame = () => {
    rafCalls += 1;
    return rafCalls;
  };
  try {
    const host = makeHost();
    host.isAnimated = true;
    host.running = true;
    host.rafId = 0;

    host.start();
    assert.equal(rafCalls, 1);
    assert.equal(host.rafId, 1);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
  }
});
