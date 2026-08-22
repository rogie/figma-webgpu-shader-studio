export const VIDEO_DIMENSION_OPTIONS = [
  { value: "current", label: "Current" },
  { value: "512x512", label: "512 × 512" },
  { value: "1080x1080", label: "1080 × 1080" },
  { value: "1920x1080", label: "1920 × 1080" },
  { value: "1080x1920", label: "1080 × 1920" },
];

export function resolveVideoDimensions(value, currentWidth, currentHeight) {
  const fallback = {
    width: Math.max(1, Math.round(Number(currentWidth) || 1)),
    height: Math.max(1, Math.round(Number(currentHeight) || 1)),
  };
  if (!value || value === "current") return fallback;
  const match = /^(\d+)x(\d+)$/.exec(String(value));
  if (!match) return fallback;
  return {
    width: Math.min(2048, Math.max(1, Number(match[1]))),
    height: Math.min(2048, Math.max(1, Number(match[2]))),
  };
}

export function supportedWebmMimeType(MediaRecorderClass = window.MediaRecorder) {
  const mimeTypes = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return (
    mimeTypes.find(
      (type) =>
        typeof MediaRecorderClass?.isTypeSupported !== "function" ||
        MediaRecorderClass.isTypeSupported(type)
    ) || null
  );
}

const VIDEO_EXPORT_STALL_TIMEOUT_MS = 30_000;

export { videoExportFramePlan } from "./videoExportFrames.js";

export function supportsOfflineVideoExport({
  WorkerClass = globalThis.Worker,
  OffscreenCanvasClass = globalThis.OffscreenCanvas,
  VideoEncoderClass = globalThis.VideoEncoder,
} = {}) {
  return (
    typeof WorkerClass === "function" &&
    typeof OffscreenCanvasClass === "function" &&
    typeof VideoEncoderClass === "function"
  );
}

export function resolveVideoFrameTime(time, duration) {
  const requestedTime = Math.max(0, Number(time) || 0);
  const sourceDuration = Number(duration);
  return Number.isFinite(sourceDuration) && sourceDuration > 0
    ? requestedTime % sourceDuration
    : requestedTime;
}

function waitForMediaEvent(video, type, errorMessage) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(type, onSuccess);
      video.removeEventListener("error", onError);
    };
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(errorMessage));
    };
    video.addEventListener(type, onSuccess, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function createExportVideoFrameSource(sourceVideo) {
  const src = sourceVideo?.currentSrc || sourceVideo?.src;
  if (!src) throw new Error("The video input has no source to export.");

  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  if (sourceVideo.crossOrigin) video.crossOrigin = sourceVideo.crossOrigin;
  Object.assign(video.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(video);
  video.src = src;

  try {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      const loaded = waitForMediaEvent(
        video,
        "loadeddata",
        "Failed to decode the video input for export."
      );
      video.load();
      await loaded;
    }
    video.pause();

    return {
      async capture(time, width, height) {
        const targetTime = resolveVideoFrameTime(time, video.duration);
        if (Math.abs(video.currentTime - targetTime) > 0.0005) {
          const seeked = waitForMediaEvent(
            video,
            "seeked",
            "Failed to seek the video input for export."
          );
          video.currentTime = targetTime;
          await seeked;
        }
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        if (!sourceWidth || !sourceHeight) {
          throw new Error("The video input has no decoded frame.");
        }
        const scale = Math.max(width / sourceWidth, height / sourceHeight);
        const cropWidth = Math.max(1, width / scale);
        const cropHeight = Math.max(1, height / scale);
        return createImageBitmap(
          video,
          Math.max(0, (sourceWidth - cropWidth) / 2),
          Math.max(0, (sourceHeight - cropHeight) / 2),
          cropWidth,
          cropHeight,
          {
            resizeWidth: width,
            resizeHeight: height,
            resizeQuality: "high",
          }
        );
      },
      dispose() {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
      },
    };
  } catch (error) {
    video.removeAttribute("src");
    video.load();
    video.remove();
    throw error;
  }
}

export async function renderVideoInWorker({
  source,
  values,
  isFill,
  composition = null,
  inputBitmap = null,
  inputVideo = null,
  width,
  height,
  duration,
  frameRate,
  bitrate,
  onProgress,
}) {
  if (!supportsOfflineVideoExport()) {
    throw new Error("Offline video export is not supported in this browser.");
  }

  let worker = null;
  let timeout = 0;
  let disposeWorker = null;
  let videoFrameSource = null;
  let workerInputBitmap = inputBitmap;
  try {
    if (inputVideo) {
      videoFrameSource = await createExportVideoFrameSource(inputVideo);
      workerInputBitmap = await videoFrameSource.capture(0, width, height);
    }

    worker = new Worker(new URL("./videoExportWorker.js", import.meta.url), {
      type: "module",
    });

    let rejectTimeout;
    const timeoutPromise = new Promise((_, reject) => {
      rejectTimeout = reject;
    });
    const refreshTimeout = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(
        () => rejectTimeout(new Error("Video export stalled.")),
        VIDEO_EXPORT_STALL_TIMEOUT_MS
      );
    };

    const rendered = new Promise((resolve, reject) => {
      worker.addEventListener("message", (event) => {
        const message = event.data || {};
        if (message.type === "input-frame-request") {
          if (!videoFrameSource) {
            reject(new Error("The export requested a video frame without a video input."));
            return;
          }
          videoFrameSource
            .capture(message.time, width, height)
            .then((bitmap) => {
              worker.postMessage(
                {
                  type: "input-frame",
                  requestId: message.requestId,
                  bitmap,
                },
                [bitmap]
              );
            })
            .catch((error) => {
              worker.postMessage({
                type: "input-frame-error",
                requestId: message.requestId,
                message: error?.message || String(error),
              });
              reject(error);
            });
        } else if (message.type === "ready") {
          refreshTimeout();
          worker.postMessage({ type: "record" });
        } else if (message.type === "progress") {
          refreshTimeout();
          onProgress?.(message.progress);
        } else if (message.type === "done") {
          const buffer = message.buffer;
          const type = message.mimeType || "video/webm";
          if (!buffer || !buffer.byteLength) {
            reject(new Error("The exported video was empty."));
            return;
          }
          resolve(new Blob([buffer], { type }));
        } else if (message.type === "error") {
          reject(new Error(message.message || "Video rendering failed."));
        }
      });
      worker.addEventListener(
        "error",
        (event) =>
          reject(new Error(event.message || "Video export worker failed.")),
        { once: true }
      );
    });
    disposeWorker = () =>
      new Promise((resolve) => {
        const disposalTimeout = window.setTimeout(resolve, 500);
        const onMessage = (event) => {
          if (event.data?.type !== "disposed") return;
          window.clearTimeout(disposalTimeout);
          worker.removeEventListener("message", onMessage);
          resolve();
        };
        worker.addEventListener("message", onMessage);
        worker.postMessage({ type: "dispose" });
      });

    const transfer = [];
    if (workerInputBitmap) transfer.push(workerInputBitmap);
    worker.postMessage(
      {
        type: "init",
        source,
        values,
        isFill,
        composition,
        inputBitmap: workerInputBitmap,
        dynamicVideoInput: Boolean(videoFrameSource),
        width,
        height,
        duration,
        frameRate,
        bitrate,
      },
      transfer
    );

    refreshTimeout();
    const blob = await Promise.race([rendered, timeoutPromise]);
    window.clearTimeout(timeout);
    onProgress?.(1);
    return blob;
  } finally {
    window.clearTimeout(timeout);
    await disposeWorker?.();
    worker?.terminate();
    workerInputBitmap?.close?.();
    if (workerInputBitmap !== inputBitmap) inputBitmap?.close?.();
    videoFrameSource?.dispose();
  }
}
