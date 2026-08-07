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

export async function renderVideoInWorker({
  source,
  values,
  isFill,
  inputBitmap = null,
  width,
  height,
  duration,
  frameRate,
  bitrate,
  onProgress,
}) {
  if (
    typeof Worker !== "function" ||
    typeof OffscreenCanvas !== "function" ||
    typeof HTMLCanvasElement !== "function" ||
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen !== "function"
  ) {
    throw new Error("Offscreen worker export is not supported in this browser.");
  }
  if (typeof window.MediaRecorder !== "function") {
    throw new Error("Video encoding is not supported in this browser.");
  }

  const mimeType = supportedWebmMimeType(window.MediaRecorder);
  if (!mimeType) throw new Error("This browser cannot encode WebM video.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  Object.assign(canvas.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(canvas);

  let worker = null;
  let stream = null;
  let recorder = null;
  let timeout = 0;
  let disposeWorker = null;
  try {
    stream = canvas.captureStream(frameRate);
    const offscreen = canvas.transferControlToOffscreen();
    worker = new Worker(new URL("./videoExportWorker.js", import.meta.url), {
      type: "module",
    });

    const chunks = [];
    recorder = new window.MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate * 1_000_000,
    });
    const recording = new Promise((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) chunks.push(event.data);
      });
      recorder.addEventListener(
        "error",
        (event) =>
          reject(
            event.error || new Error("The browser could not encode the video.")
          ),
        { once: true }
      );
      recorder.addEventListener(
        "stop",
        () => resolve(new Blob(chunks, { type: mimeType })),
        { once: true }
      );
    });
    const encodingFailure = recording.then(
      () => new Promise(() => {}),
      (error) => Promise.reject(error)
    );

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
        if (message.type === "ready") {
          refreshTimeout();
          const startRendering = () => {
            refreshTimeout();
            worker.postMessage({ type: "record" });
          };
          recorder.addEventListener("start", startRendering, { once: true });
          try {
            recorder.start(250);
          } catch (error) {
            recorder.removeEventListener("start", startRendering);
            reject(error);
          }
        } else if (message.type === "progress") {
          refreshTimeout();
          onProgress?.(message.progress);
        } else if (message.type === "done") {
          resolve();
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

    const transfer = [offscreen];
    if (inputBitmap) transfer.push(inputBitmap);
    worker.postMessage(
      {
        type: "init",
        canvas: offscreen,
        source,
        values,
        isFill,
        inputBitmap,
        width,
        height,
        duration,
        frameRate,
      },
      transfer
    );

    refreshTimeout();
    await Promise.race([rendered, encodingFailure, timeoutPromise]);
    window.clearTimeout(timeout);
    onProgress?.(1);
    recorder.requestData?.();
    recorder.stop();
    const blob = await recording;
    if (!blob.size) throw new Error("The exported video was empty.");
    return blob;
  } finally {
    window.clearTimeout(timeout);
    if (recorder?.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Recorder may already be stopping after an encoding error.
      }
    }
    stream?.getTracks().forEach((track) => track.stop());
    await disposeWorker?.();
    worker?.terminate();
    canvas.remove();
    inputBitmap?.close?.();
  }
}
