import {
  BufferTarget,
  CanvasSource,
  Output,
  Quality,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import { mergeLayerValues } from "../lib/composition.js";
import { videoExportFramePlan } from "./videoExportFrames.js";
import { ShaderHost } from "./host.js";
import { loadModule } from "./loader.js";

let host = null;
let exportConfig = null;
let encodeCanvas = null;
let encodeContext = null;
let cancelled = false;
let nextInputRequestId = 0;
const pendingInputFrames = new Map();

function postError(error) {
  self.postMessage({
    type: "error",
    message: error?.message || String(error),
  });
}

async function initialize(message) {
  cancelled = false;
  let runtimeError = null;
  const canvas = new OffscreenCanvas(message.width, message.height);
  host = new ShaderHost(canvas, {
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

  let ok;
  if (message.composition) {
    const layers = (message.composition.layers || []).map((layer) => {
      const loaded = loadModule(layer.source);
      return {
        id: layer.id,
        role: layer.role,
        enabled: layer.enabled !== false,
        setup: loaded.setup,
        render: loaded.render,
        params: mergeLayerValues(loaded.props, layer.params),
      };
    });
    ok = await host.setComposition(layers, {
      isFill: message.composition.isFill,
    });
  } else {
    const loaded = loadModule(message.source);
    host.setParams(message.values || {});
    ok = await host.setModule(
      { setup: loaded.setup, render: loaded.render },
      { isFill: message.isFill }
    );
  }
  if (!ok) throw runtimeError || new Error("Shader validation failed.");
  // setModule validates by presenting once. Clear that provisional temporal
  // history so exported frame zero is the first accumulation step.
  host.resetShaderState({ present: false });

  encodeCanvas = new OffscreenCanvas(message.width, message.height);
  encodeContext = encodeCanvas.getContext("2d", { alpha: false });
  if (!encodeContext) {
    throw new Error("Could not create a video encode canvas.");
  }

  exportConfig = {
    duration: message.duration,
    frameRate: message.frameRate,
    bitrate: message.bitrate,
    width: message.width,
    height: message.height,
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
  if (!host || !exportConfig || !encodeCanvas || !encodeContext) {
    throw new Error("Video export worker is not initialized.");
  }

  const format = new WebMOutputFormat();
  const codec = await getFirstEncodableVideoCodec(
    format.getSupportedVideoCodecs(),
    {
      width: exportConfig.width,
      height: exportConfig.height,
    }
  );
  if (!codec) {
    throw new Error("This browser cannot encode WebM video.");
  }

  const output = new Output({
    format,
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(encodeCanvas, {
    codec,
    quality: new Quality({
      bitrate: Math.max(1, Number(exportConfig.bitrate) || 8) * 1_000_000,
    }),
  });
  output.addVideoTrack(videoSource, { frameRate: exportConfig.frameRate });
  await output.start();

  const frames = videoExportFramePlan(
    exportConfig.duration,
    exportConfig.frameRate
  );

  try {
    for (const { frame, timeMs, deltaMs, timeSec, durationSec } of frames) {
      if (cancelled) {
        await output.cancel();
        return;
      }

      if (exportConfig.dynamicVideoInput) {
        const bitmap = await requestInputFrame(timeSec);
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

      const texture = host.renderFrame(timeMs, deltaMs, frame);
      const imageData = await host.readbackTextureImageData(texture);
      if (!imageData) {
        throw new Error("Could not read the rendered export frame.");
      }
      if (
        imageData.width === encodeCanvas.width &&
        imageData.height === encodeCanvas.height
      ) {
        encodeContext.putImageData(imageData, 0, 0);
      } else {
        const bitmap = await createImageBitmap(imageData);
        try {
          encodeContext.drawImage(
            bitmap,
            0,
            0,
            encodeCanvas.width,
            encodeCanvas.height
          );
        } finally {
          bitmap.close?.();
        }
      }
      await videoSource.add(timeSec, durationSec);
      self.postMessage({
        type: "progress",
        progress: (frame + 1) / frames.length,
      });
    }

    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer?.byteLength) {
      throw new Error("The exported video was empty.");
    }
    self.postMessage(
      {
        type: "done",
        buffer,
        mimeType: format.mimeType || "video/webm",
      },
      [buffer]
    );
  } catch (error) {
    try {
      await output.cancel();
    } catch {
      /* ignore */
    }
    throw error;
  }
}

function dispose() {
  cancelled = true;
  for (const pending of pendingInputFrames.values()) {
    pending.reject(new Error("Video export was disposed."));
  }
  pendingInputFrames.clear();
  host?.destroy();
  host = null;
  exportConfig = null;
  encodeCanvas = null;
  encodeContext = null;
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
