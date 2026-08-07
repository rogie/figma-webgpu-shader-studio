import { ShaderHost } from "./host.js";
import { loadModule } from "./loader.js";

let host = null;
let exportConfig = null;

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

  exportConfig = {
    duration: message.duration,
    frameRate: message.frameRate,
  };
  self.postMessage({ type: "ready" });
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
    const target = startedAt + frame * frameDuration;
    const wait = target - performance.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
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
  host?.destroy();
  host = null;
  exportConfig = null;
  self.postMessage({ type: "disposed" });
}

self.addEventListener("message", (event) => {
  const message = event.data || {};
  if (message.type === "init") {
    initialize(message).catch(postError);
  } else if (message.type === "record") {
    record().catch(postError);
  } else if (message.type === "dispose") {
    dispose();
  }
});
