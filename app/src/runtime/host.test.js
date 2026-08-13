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

test("user pause resets time to zero and redraws", () => {
  const raf = stubAnimationFrame();
  try {
    const host = makeHost();
    let redraws = 0;
    host.redraw = () => {
      redraws += 1;
    };
    host.frame.time = 1500;
    host.frame.deltaTime = 16;
    host.frame.frame = 90;
    host.running = true;
    host.rafId = 7;

    host.stop({ resetTime: true });

    assert.equal(host.running, false);
    assert.equal(host.rafId, 0);
    assert.equal(host.frame.time, 0);
    assert.equal(host.frame.deltaTime, 0);
    assert.equal(host.frame.frame, 0);
    assert.equal(redraws, 1);
  } finally {
    raf.restore();
  }
});

test("internal stop keeps the current frame time", () => {
  const host = makeHost();
  let redraws = 0;
  host.redraw = () => {
    redraws += 1;
  };
  host.frame.time = 1500;
  host.frame.frame = 90;

  host.stop();

  assert.equal(host.frame.time, 1500);
  assert.equal(host.frame.frame, 90);
  assert.equal(redraws, 0);
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
    host._present = () => {
      presentedTimes.push(host.frame.time);
    };

    host.start();
    const t0 = host.startTime;
    callbacks[0](t0 + 50);

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

test("thumbnail capture resumes play when a newer module left the host stopped", async () => {
  const raf = stubAnimationFrame();
  try {
    const host = makeHost();
    host.canvas.width = 4;
    host.canvas.height = 4;
    host.renderFn = () => {};
    host._present = () => null;
    host.start();
    assert.equal(host.running, true);

    const originalStop = host.stop.bind(host);
    host.stop = () => {
      originalStop();
      // Simulate compile overlapping the capture: generation advances and the
      // new module's start() has not run yet.
      host._playbackGeneration += 1;
    };

    await host.captureThumbnailBlob({
      shouldResume: () => true,
    });
    assert.equal(host.running, true);
    assert.ok(host.rafId);
  } finally {
    raf.restore();
  }
});

test("thumbnail capture does not resume when play preference is off", async () => {
  const raf = stubAnimationFrame();
  try {
    const host = makeHost();
    host.canvas.width = 4;
    host.canvas.height = 4;
    host.renderFn = () => {};
    host._present = () => null;
    host.start();

    await host.captureThumbnailBlob({
      shouldResume: () => false,
    });
    assert.equal(host.running, false);
    assert.equal(host.rafId, 0);
  } finally {
    raf.restore();
  }
});
