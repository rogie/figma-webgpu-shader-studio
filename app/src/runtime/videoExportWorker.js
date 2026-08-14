import { ShaderHost } from "./host.js";
import { loadModule } from "./loader.js";

let host = null;
let exportConfig = null;
let nextInputRequestId = 0;
const pendingInputFrames = new Map();

function postError(error) {
  self.postMessage({
    type: "error",
    message: error?.message || String(error),
  });
}

async function initialize(message) {
  let runtimeError = null;
  host = new ShaderHost(message.canvas, {
    onError(error) {
      if (error) runtimeError = new Error(error);
    },
  });
  await host.init();
  host.setStageCssSize(message.width, message.height);

  if (message.inputBitmap) {
    host.setImageInput(
      message.inputBitmap,
      message.width,
      message.height
    );
    message.inputBitmap.close?.();
  }

  const loaded = loadModule(message.source);
  host.setParams(message.values || {});
  const ok = await host.setModule(
    { setup: loaded.setup, render: loaded.render },
    { isFill: message.isFill }
  );
  if (!ok) throw runtimeError || new Error("Shader validation failed.");
  // setModule validates by presenting once. Clear that provisional temporal
  // history so exported frame zero is the first accumulation step.
  host.resetShaderState({ present: false });

  exportConfig = {
    duration: message.duration,
    frameRate: message.frameRate,
    dynamicVideoInput: Boolean(message.dynamicVideoInput),
  };
  self.postMessage({ type: "ready" });
}

function requestInputFrame(time) {
  const requestId = ++nextInputRequestId;
  return new Promise((resolve, reject) => {
    pendingInputFrames.set(requestId, { resolve, reject });
    self.postMessage({
      type: "input-frame-request",
      requestId,
      time,
    });
  });
}

async function record() {
  if (!host || !exportConfig) {
    throw new Error("Video export worker is not initialized.");
  }
  const frameDuration = 1000 / exportConfig.frameRate;
  const frameCount = Math.max(
    1,
    Math.round(exportConfig.duration * exportConfig.frameRate)
  );
  const startedAt = performance.now();

  for (let frame = 0; frame < frameCount; frame += 1) {
    const inputFrame = exportConfig.dynamicVideoInput
      ? requestInputFrame(frame / exportConfig.frameRate)
      : null;
    const target = startedAt + frame * frameDuration;
    const wait = target - performance.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }

    if (inputFrame) {
      const bitmap = await inputFrame;
      try {
        if (host.frame.input) {
          host.updateImageInput(bitmap);
        } else {
          host.setImageInput(bitmap, bitmap.width, bitmap.height);
        }
      } finally {
        bitmap.close?.();
      }
    }

    host.renderFrame(frame * frameDuration, frameDuration, frame);
    self.postMessage({
      type: "progress",
      progress: (frame + 1) / frameCount,
    });
  }

  const finalWait = startedAt + frameCount * frameDuration - performance.now();
  if (finalWait > 0) {
    await new Promise((resolve) => setTimeout(resolve, finalWait));
  }
  self.postMessage({ type: "done" });
}

function dispose() {
  for (const pending of pendingInputFrames.values()) {
    pending.reject(new Error("Video export was disposed."));
  }
  pendingInputFrames.clear();
  host?.destroy();
  host = null;
  exportConfig = null;
  self.postMessage({ type: "disposed" });
}

self.addEventListener("message", (event) => {
  const message = event.data || {};
  if (message.type === "input-frame") {
    const pending = pendingInputFrames.get(message.requestId);
    if (!pending) {
      message.bitmap?.close?.();
      return;
    }
    pendingInputFrames.delete(message.requestId);
    pending.resolve(message.bitmap);
  } else if (message.type === "input-frame-error") {
    const pending = pendingInputFrames.get(message.requestId);
    if (!pending) return;
    pendingInputFrames.delete(message.requestId);
    pending.reject(new Error(message.message || "Could not decode video frame."));
  } else if (message.type === "init") {
    initialize(message).catch(postError);
  } else if (message.type === "record") {
    record().catch(postError);
  } else if (message.type === "dispose") {
    dispose();
  }
});
