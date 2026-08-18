import { memo, useEffect, useRef, useState } from "react";
import {
  readPreviewPixelRatioMode,
  subscribePreviewPixelRatioMode,
  writePreviewPixelRatioMode,
} from "../runtime/dpi.js";
import { calculateFrameRate } from "../runtime/frameRate.js";

const opaqueContent = { __html: "" };

function PreviewFps({ hostRef, canvasTheme = "light", onCanvasThemeChange }) {
  const [fps, setFps] = useState(0);
  const [pixelRatioMode, setPixelRatioMode] = useState(
    readPreviewPixelRatioMode
  );
  const resolutionControlRef = useRef(null);

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
      const currentFrame = Number(host?.frame?.frame) || 0;
      const nextFps =
        host?.ready &&
        host?.running &&
        host?.active &&
        previousFrame != null
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
      <fig-tooltip
        text={canvasTheme === "dark" ? "Use light canvas" : "Use dark canvas"}
      >
        <fig-button
          variant="ghost"
          icon="true"
          aria-label={
            canvasTheme === "dark" ? "Use light canvas" : "Use dark canvas"
          }
          onClick={() =>
            onCanvasThemeChange?.(canvasTheme === "dark" ? "light" : "dark")
          }
        >
          <fig-icon name={canvasTheme === "dark" ? "moon" : "sun"} />
        </fig-button>
      </fig-tooltip>
      <fig-tooltip text="Pixel ratio">
        <fig-select
          ref={resolutionControlRef}
          class="preview-resolution"
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
