import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import { mergeLayerValues } from "../lib/composition.js";
import {
  VIDEO_EXPORT_MAX_DIM,
  canConstructVideoFrameFromCanvas,
  copyImageDataToCanvas,
  preferredExportVideoCodecs,
  resolveVideoExportFormat,
} from "./videoExportEncode.js";
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
    maxDimension: VIDEO_EXPORT_MAX_DIM,
    previewPixelRatioMode: "1x",
  });
  await host.init();
  const deviceMax =
    host.device?.limits?.maxTextureDimension2D || VIDEO_EXPORT_MAX_DIM;
  if (message.width > deviceMax || message.height > deviceMax) {
    throw new Error(
      `This GPU cannot export ${message.width}×${message.height} (max ${deviceMax}).`
    );
  }
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
  // setModule validates by presenting once. Probe that swapchain before
  // clearing temporal history so exported frame zero is still the first
  // accumulation step.
  await host.waitForPresentedFrame();
  const useGpuCanvasFrame = canConstructVideoFrameFromCanvas(canvas);
  host.resetShaderState({ present: false });

  if (!useGpuCanvasFrame) {
    encodeCanvas = new OffscreenCanvas(message.width, message.height);
    encodeContext = encodeCanvas.getContext("2d", { alpha: false });
    if (!encodeContext) {
      throw new Error("Could not create a video encode canvas.");
    }
  }

  exportConfig = {
    duration: message.duration,
    frameRate: message.frameRate,
    bitrate: message.bitrate,
    width: message.width,
    height: message.height,
    dynamicVideoInput: Boolean(message.dynamicVideoInput),
    useGpuCanvasFrame,
    format: resolveVideoExportFormat(message.format),
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
  const sourceCanvas = exportConfig?.useGpuCanvasFrame
    ? host?.canvas
    : encodeCanvas;
  if (!host || !exportConfig || !sourceCanvas) {
    throw new Error("Video export worker is not initialized.");
  }
  if (!exportConfig.useGpuCanvasFrame && !encodeContext) {
    throw new Error("Video export worker is not initialized.");
  }

  const format =
    exportConfig.format === "mp4"
      ? new Mp4OutputFormat({ fastStart: "in-memory" })
      : new WebMOutputFormat();
  const codec = await getFirstEncodableVideoCodec(
    preferredExportVideoCodecs(exportConfig.format, format.getSupportedVideoCodecs()),
    {
      width: exportConfig.width,
      height: exportConfig.height,
    }
  );
  if (!codec) {
    throw new Error(
      exportConfig.format === "mp4"
        ? "This browser cannot encode MP4 video."
        : "This browser cannot encode WebM video."
    );
  }

  const output = new Output({
    format,
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(sourceCanvas, {
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
      if (!texture) {
        throw new Error("Could not render the export frame.");
      }
      if (exportConfig.useGpuCanvasFrame) {
        await host.waitForPresentedFrame();
      } else {
        const imageData = await host.readbackTextureImageData(texture);
        if (!imageData) {
          throw new Error("Could not read the rendered export frame.");
        }
        await copyImageDataToCanvas(encodeContext, encodeCanvas, imageData);
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
        mimeType:
          format.mimeType ||
          (exportConfig.format === "mp4" ? "video/mp4" : "video/webm"),
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
