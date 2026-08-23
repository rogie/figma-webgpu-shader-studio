import { memo, useEffect, useRef, useState } from "react";
import {
  readPreviewPixelRatioMode,
  subscribePreviewPixelRatioMode,
  writePreviewPixelRatioMode,
} from "../runtime/dpi.js";
import { calculateFrameRate } from "../runtime/frameRate.js";

const opaqueContent = { __html: "" };
const ZOOM_PRESETS = [50, 100, 200];

function PreviewFps({
  hostRef,
  previewZoom = 1,
  onPreviewZoomChange,
}) {
  const [fps, setFps] = useState(0);
  const [pixelRatioMode, setPixelRatioMode] = useState(
    readPreviewPixelRatioMode
  );
  const resolutionControlRef = useRef(null);
  const zoomControlRef = useRef(null);
  const zoomPercent = Math.round(previewZoom * 100);
  const zoomOptions = (
    ZOOM_PRESETS.includes(zoomPercent)
      ? ZOOM_PRESETS
      : [...ZOOM_PRESETS, zoomPercent].sort((a, b) => a - b)
  ).map((percent) => ({
    value: String(percent),
    label: `${percent}%`,
  }));

  useEffect(() => {
    const control = resolutionControlRef.current;
    if (!control) return undefined;
    const updateResolution = (event) => {
      const detail = event.detail;
      const value =
        detail && typeof detail === "object" && "value" in detail
          ? detail.value
          : (detail ?? event.target.value);
      writePreviewPixelRatioMode(value);
    };
    control.addEventListener("change", updateResolution);
    return () => control.removeEventListener("change", updateResolution);
  }, [hostRef]);

  useEffect(() => {
    const control = zoomControlRef.current;
    if (!control) return undefined;
    const updateZoom = (event) => {
      // Ignore programmatic clamps when React syncs the live canvas zoom.
      const isOpen =
        control.hasAttribute("open") && control.getAttribute("open") !== "false";
      if (!isOpen) return;
      const detail = event.detail;
      const value =
        detail && typeof detail === "object" && "value" in detail
          ? detail.value
          : (detail ?? event.target.value);
      const percent = Number(value);
      if (!Number.isFinite(percent)) return;
      onPreviewZoomChange?.(percent / 100);
    };
    control.addEventListener("change", updateZoom);
    return () => control.removeEventListener("change", updateZoom);
  }, [onPreviewZoomChange]);

  useEffect(
    () =>
      subscribePreviewPixelRatioMode((mode) => {
        setPixelRatioMode(mode);
        hostRef.current?.setPreviewPixelRatioMode?.(mode);
      }),
    [hostRef]
  );

  useEffect(() => {
    let previousFrame = null;
    let previousTime = performance.now();
    const sample = () => {
      const now = performance.now();
      const host = hostRef.current;
      const currentFrame = Number(host?.presentedFrames) || 0;
      const nextFps =
        host?.ready && host?.active && previousFrame != null
          ? calculateFrameRate(previousFrame, currentFrame, now - previousTime)
          : 0;
      previousFrame = currentFrame;
      previousTime = now;
      setFps((current) => (current === nextFps ? current : nextFps));
    };
    const interval = window.setInterval(sample, 500);
    return () => window.clearInterval(interval);
  }, [hostRef]);

  return (
    <div className="preview-performance">
      <fig-tooltip text="Pixel ratio">
        <fig-select
          ref={resolutionControlRef}
          class="preview-resolution"
          variant="ghost"
          position="top left"
          value={pixelRatioMode}
          options={JSON.stringify([
            { value: "1x", label: "1x" },
            { value: "2x", label: "2x" },
          ])}
          aria-label="Preview resolution"
          dangerouslySetInnerHTML={opaqueContent}
        />
      </fig-tooltip>
      <fig-tooltip text="Zoom">
        <fig-select
          ref={zoomControlRef}
          class="preview-zoom"
          variant="ghost"
          position="top left"
          options={JSON.stringify(zoomOptions)}
          value={String(zoomPercent)}
          aria-label={`Zoom ${zoomPercent}%`}
          dangerouslySetInnerHTML={opaqueContent}
        />
      </fig-tooltip>
      <div
        className="preview-fps"
        aria-label={`Preview rendering at ${fps} frames per second`}
      >
        <strong>{fps}</strong>
        <span>FPS</span>
      </div>
    </div>
  );
}

export default memo(PreviewFps);
