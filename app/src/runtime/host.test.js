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

test("video playback follows the shader play state", () => {
  const raf = stubAnimationFrame();
  try {
    const host = makeHost();
    let plays = 0;
    let pauses = 0;
    host.video = {
      play() {
        plays += 1;
      },
      pause() {
        pauses += 1;
      },
      requestVideoFrameCallback() {
        return 1;
      },
      cancelVideoFrameCallback() {},
    };

    host.start();
    assert.equal(plays, 1);
    assert.equal(pauses, 0);

    host.stop({ resetTime: true });
    assert.equal(pauses, 1);
  } finally {
    raf.restore();
  }
});

test("reactivating a paused host does not start its video", () => {
  const host = makeHost();
  let plays = 0;
  let pauses = 0;
  host.active = false;
  host.video = {
    play() {
      plays += 1;
    },
    pause() {
      pauses += 1;
    },
  };

  host.setActive(true);

  assert.equal(plays, 0);
  assert.equal(pauses, 1);
});

test("decoded video frames redraw while shader playback is paused", () => {
  const host = makeHost();
  let videoFrameCallback = null;
  let callbackId = 0;
  const video = {
    requestVideoFrameCallback(callback) {
      videoFrameCallback = callback;
      callbackId += 1;
      return callbackId;
    },
  };
  host.video = video;
  let redraws = 0;
  host.redraw = () => {
    redraws += 1;
  };

  host._watchVideoFrames();
  videoFrameCallback();
  assert.equal(host._videoFrameDirty, true);
  assert.equal(redraws, 1);

  host.running = true;
  host.rafId = 1;
  videoFrameCallback();
  assert.equal(redraws, 1);
});

test("video polling redraws paused previews without video frame callbacks", () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let poll = null;
  let cleared = 0;
  globalThis.setInterval = (callback) => {
    poll = callback;
    return 42;
  };
  globalThis.clearInterval = (id) => {
    cleared = id;
  };
  try {
    const host = makeHost();
    host.video = { currentTime: 0 };
    let redraws = 0;
    host.redraw = () => {
      redraws += 1;
    };

    host._watchVideoFrames();
    poll();
    assert.equal(redraws, 1);

    host._lastVideoTime = 0;
    poll();
    assert.equal(redraws, 1);

    host.video.currentTime = 0.1;
    poll();
    assert.equal(redraws, 2);

    host._cancelVideoFrameCallback();
    assert.equal(cleared, 42);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("replacing an input resets temporal shader state at the same size", () => {
  const host = makeHost();
  let destroyed = 0;
  let setupCalls = 0;
  let redraws = 0;
  host.context = { getCurrentTexture: () => ({}) };
  host.device = {};
  host.frame.state = {
    resources: [
      {
        destroy() {
          destroyed += 1;
        },
      },
      {
        destroy() {
          destroyed += 1;
        },
      },
    ],
  };
  host.setupFn = () => {
    setupCalls += 1;
  };
  host.frame.time = 100;
  host.frame.deltaTime = 16;
  host.frame.frame = 6;
  host.redraw = () => {
    redraws += 1;
  };

  host._rebindAfterInputChange(false, { resetState: true });

  assert.equal(destroyed, 2);
  assert.equal(setupCalls, 1);
  assert.equal(redraws, 1);
  assert.equal(host.frame.time, 0);
  assert.equal(host.frame.deltaTime, 0);
  assert.equal(host.frame.frame, 0);
});

test("resetShaderState can clear validation history without presenting", () => {
  const host = makeHost();
  host.context = { getCurrentTexture: () => ({}) };
  host.device = {};
  host.frame.state = { old: true };
  host.frame.time = 100;
  host.frame.deltaTime = 16;
  host.frame.frame = 6;
  let setupCalls = 0;
  let presents = 0;
  host.setupFn = () => {
    setupCalls += 1;
  };
  host._present = () => {
    presents += 1;
  };

  assert.equal(host.resetShaderState({ present: false }), true);
  assert.equal(setupCalls, 1);
  assert.equal(presents, 0);
  assert.equal(host.frame.time, 0);
  assert.equal(host.frame.deltaTime, 0);
  assert.equal(host.frame.frame, 0);
});

test("teardown preserves host textures cached in shader state", () => {
  const host = makeHost();
  let inputDestroyed = 0;
  let outputDestroyed = 0;
  let ownedDestroyed = 0;
  const input = {
    destroy() {
      inputDestroyed += 1;
    },
  };
  const output = {
    destroy() {
      outputDestroyed += 1;
    },
  };
  const owned = {
    destroy() {
      ownedDestroyed += 1;
    },
  };
  host.inputTexture = input;
  host.frame.input = input;
  host.frame.output = output;
  host.frame.state = {
    bindGroupInput: input,
    cachedOutput: output,
    ownedResources: [owned, owned],
  };

  host._teardownState();

  assert.equal(inputDestroyed, 0);
  assert.equal(outputDestroyed, 0);
  assert.equal(ownedDestroyed, 1);
  assert.deepEqual(host.frame.state, {});
});

test("updating image contents preserves input texture identity and state", () => {
  const host = makeHost();
  const texture = { width: 320, height: 180 };
  const state = { history: true };
  let copy = null;
  host.inputTexture = texture;
  host.frame.input = texture;
  host.frame.state = state;
  host.device = {
    queue: {
      copyExternalImageToTexture(source, destination, size) {
        copy = { source, destination, size };
      },
    },
  };
  const source = {};

  assert.equal(host.updateImageInput(source), true);
  assert.equal(host.frame.input, texture);
  assert.equal(host.frame.state, state);
  assert.deepEqual(copy.size, [320, 180]);
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

    assert.ok(Math.abs(host.frame.time - 50) < 1e-6);
    assert.equal(host.frame.frame, 1);
    assert.equal(presentedTimes.length, 1);
    assert.ok(Math.abs(presentedTimes[0] - 50) < 1e-6);
    assert.equal(callbacks.length, 2);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
  }
});

function makeMouseHost() {
  const host = makeHost();
  host.usesMouse = true;
  host.running = true;
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

test("mouse uniforms update only while playback is running", () => {
  const raf = stubAnimationFrame();
  try {
    const host = makeMouseHost();
    let redraws = 0;
    host.redraw = () => {
      redraws += 1;
    };

    host.running = false;
    host._onMouse({ clientX: 60, clientY: 45 });
    assert.deepEqual(host.frame.mousePosition, { x: 0, y: 0 });
    assert.equal(host.frame.time, 321);
    assert.equal(redraws, 0);

    host._onMouseLeave();
    raf.flush();
    assert.deepEqual(host.frame.mousePosition, { x: 0, y: 0 });
    assert.equal(host.frame.time, 321);
    assert.equal(redraws, 0);

    host.running = true;
    host.rafId = 1;
    host._onMouse({ clientX: 35, clientY: 30 });
    assert.deepEqual(host.frame.mousePosition, { x: 50, y: 20 });
    assert.equal(redraws, 0);
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

test("mousePosition stays in logical pixels while supersampled", () => {
  const host = makeMouseHost();
  host.canvas.width = 400;
  host.canvas.height = 200;
  host.frame.renderScale = 2;
  host.redraw = () => {};

  host._onMouse({ clientX: 60, clientY: 45 });

  assert.deepEqual(host.frame.mousePosition, { x: 100, y: 50 });
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

test("setSize defers canvas resize while a capture is in progress", async () => {
  const host = makeHost();
  host.canvas.width = 8;
  host.canvas.height = 8;

  host._beginCapture();
  const changed = host.setSize(16, 16);
  assert.equal(changed, false);
  assert.equal(host.canvas.width, 8);
  assert.equal(host.canvas.height, 8);

  host._endCapture();
  assert.equal(host.canvas.width, 16);
  assert.equal(host.canvas.height, 16);
});

test("preview pixel ratio changes resize fill previews", () => {
  const host = makeHost();
  host.ready = true;
  host.isFill = true;
  host.stageCssSize = { width: 800, height: 600 };
  let resized = null;
  host.resizeFill = (width, height) => {
    resized = { width, height };
    return true;
  };

  assert.equal(host.setPreviewPixelRatioMode("1x"), true);
  assert.equal(host.previewPixelRatioMode, "1x");
  assert.deepEqual(resized, { width: 800, height: 600 });
  assert.equal(host.setPreviewPixelRatioMode("1x"), false);
});

test("supported shaders supersample after zoom settles without replacing input", () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let resize = null;
  globalThis.setTimeout = (callback) => {
    resize = callback;
    return 7;
  };
  globalThis.clearTimeout = () => {};
  try {
    const host = makeHost();
    host.canvas.width = 1000;
    host.canvas.height = 500;
    host.canvas.style = {
      values: {},
      removeProperty(name) {
        delete this.values[name];
      },
      set width(value) {
        this.values.width = value;
      },
      set height(value) {
        this.values.height = value;
      },
    };
    host.canvas.dataset = {};
    host.logicalOutputSize = { width: 1000, height: 500 };
    host.supportsRenderScale = true;
    host.device = { limits: { maxTextureDimension2D: 8192 } };
    const input = {};
    host.inputTexture = input;
    host.frame.input = input;
    let resets = 0;
    host.resetShaderState = () => {
      resets += 1;
    };

    host.setPreviewZoom(2);
    assert.equal(host.canvas.width, 1000);
    resize();

    assert.equal(host.canvas.width, 2000);
    assert.equal(host.canvas.height, 1000);
    assert.equal(host.canvas.style.values.width, "1000px");
    assert.equal(host.canvas.style.values.height, "500px");
    assert.equal(host.frame.renderScale, 2);
    assert.equal(host.canvas.dataset.renderScale, "2");
    assert.equal(host.frame.input, input);
    assert.equal(resets, 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("playback disables supersampling and user pause restores it", () => {
  const raf = stubAnimationFrame();
  try {
    const host = makeHost();
    host.canvas.width = 1000;
    host.canvas.height = 500;
    host.canvas.style = { removeProperty() {} };
    host.canvas.dataset = {};
    host.logicalOutputSize = { width: 1000, height: 500 };
    host.supportsRenderScale = true;
    host.previewZoom = 2;
    host.device = { limits: { maxTextureDimension2D: 8192 } };
    let resets = 0;
    host.resetShaderState = () => {
      resets += 1;
    };

    host._applyAdaptiveOutputSize();
    assert.equal(host.canvas.width, 2000);
    assert.equal(host.frame.renderScale, 2);

    host.start();
    assert.equal(host.canvas.width, 1000);
    assert.equal(host.frame.renderScale, 1);
    assert.equal(resets, 1);

    host.stop({ resetTime: true });
    assert.equal(host.canvas.width, 2000);
    assert.equal(host.frame.renderScale, 2);
    assert.equal(resets, 2);
  } finally {
    raf.restore();
  }
});

test("capture lock defers adaptive size and shader reset together", () => {
  const host = makeHost();
  host.canvas.width = 1000;
  host.canvas.height = 500;
  host.canvas.style = { removeProperty() {} };
  host.canvas.dataset = {};
  host.logicalOutputSize = { width: 1000, height: 500 };
  host.supportsRenderScale = true;
  host.previewZoom = 2;
  host.device = { limits: { maxTextureDimension2D: 8192 } };
  let resets = 0;
  host.resetShaderState = () => {
    resets += 1;
  };

  host._beginCapture();
  assert.equal(host._applyAdaptiveOutputSize(), false);
  assert.equal(host.canvas.width, 1000);
  assert.equal(host.frame.renderScale, 1);
  assert.equal(resets, 0);

  host._endCapture();
  assert.equal(host.canvas.width, 2000);
  assert.equal(host.frame.renderScale, 2);
  assert.equal(resets, 1);
});

test("shader compilation diagnostics replace generic command buffer errors", async () => {
  const host = makeHost();
  let reportedError = null;
  host.onError = (message) => {
    reportedError = message;
  };
  host.device = {
    limits: { maxTextureDimension2D: 8192 },
    pushErrorScope() {},
    async popErrorScope() {
      return {
        message:
          "[Invalid CommandBuffer] is invalid. - While calling [Queue].Submit([[Invalid CommandBuffer]])",
      };
    },
  };
  host.context = {
    getCurrentTexture() {
      return {};
    },
  };
  host._present = () => {};

  const ok = await host.setModule({
    setup(_device, frame) {
      frame.state.shaderModule = {
        async getCompilationInfo() {
          return {
            messages: [
              {
                type: "error",
                message: "'active' is a reserved keyword",
                lineNum: 37,
                linePos: 11,
              },
            ],
          };
        },
      };
    },
    render() {},
  });

  assert.equal(ok, false);
  assert.equal(
    reportedError,
    "Shader compilation error at WGSL line 37, column 11: 'active' is a reserved keyword"
  );
});

test("fill mode drops leftover effect input and sizes to the stage", () => {
  const host = makeHost();
  host.stageCssSize = { width: 800, height: 600 };
  host.logicalOutputSize = { width: 128, height: 96 };
  host.frame.input = { width: 128, height: 96 };
  host.inputTexture = host.frame.input;
  let fillSize = null;
  host.clearInput = () => {
    host.frame.input = null;
    host.inputTexture = null;
  };
  host.setFillSize = (width, height) => {
    fillSize = { width, height };
    return true;
  };
  let adaptive = 0;
  host._applyAdaptiveOutputSize = () => {
    adaptive += 1;
    return false;
  };

  host.isFill = true;
  host._syncOutputSizeForMode();
  assert.equal(host.frame.input, null);
  assert.deepEqual(fillSize, { width: 800, height: 600 });
  assert.equal(adaptive, 0);

  host.isFill = false;
  host.frame.input = { width: 128, height: 96 };
  fillSize = null;
  host._syncOutputSizeForMode();
  assert.equal(fillSize, null);
  assert.equal(adaptive, 1);
});

test("presentedFrames counts GPU presents and survives a shader clock reset", () => {
  const host = makeHost();
  host.context = {
    getCurrentTexture() {
      return { width: 1, height: 1 };
    },
  };
  host.device = {};
  let renders = 0;
  host.renderFn = () => {
    renders += 1;
  };

  host._present();
  host._present();
  assert.equal(renders, 2);
  assert.equal(host.presentedFrames, 2);

  host.frame.frame = 0;
  host._present();
  assert.equal(host.presentedFrames, 3);
});

test("composition presents increment presentedFrames once per preview frame", () => {
  const host = makeHost();
  host.context = {
    getCurrentTexture() {
      return { width: 4, height: 4 };
    },
  };
  host.compositionLayers = [];
  host.logicalOutputSize = { width: 4, height: 4 };
  host._presentPassthrough = () => "passthrough";

  assert.equal(host._present(), "passthrough");
  assert.equal(host.presentedFrames, 1);
});
