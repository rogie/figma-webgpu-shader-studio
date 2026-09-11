import { useEffect, useRef } from "react";
import {
  canvasColorFillValue,
  canvasColorFromControlEvent,
} from "../lib/layoutStorage.js";
import CanvasControlsIcon from "./CanvasControlsIcon.jsx";
import PlayControls from "./PlayControls.jsx";
import PreviewFps from "./PreviewFps.jsx";

export default function PreviewToolbar({
  running,
  onTogglePlay,
  onSeek,
  showPlayback,
  fatal,
  hostRef,
  previewZoom,
  onPreviewZoomChange,
  showFps,
  initialPixelRatioMode,
  showCanvasHandles,
  onToggleCanvasHandles,
  canvasColor,
  onCanvasColorChange,
}) {
  const canvasColorPickerRef = useRef(null);
  const canvasColorSwatchRef = useRef(null);
  const canvasControlsLabel = showCanvasHandles
    ? "Hide canvas handles"
    : "Show canvas handles";

  useEffect(() => {
    const picker = canvasColorPickerRef.current;
    if (!picker) return undefined;
    picker.anchorElement = canvasColorSwatchRef.current;
    const updateCanvasColor = (event) => {
      onCanvasColorChange?.(canvasColorFromControlEvent(event, canvasColor));
    };
    picker.addEventListener("input", updateCanvasColor);
    return () => picker.removeEventListener("input", updateCanvasColor);
  }, [canvasColor, onCanvasColorChange]);

  return (
    <div className="tools background--light">
      {showPlayback && (
        <>
          <PlayControls
            running={running}
            onTogglePlay={onTogglePlay}
            onSeek={onSeek}
            hostRef={hostRef}
          />
          <fig-separator direction="vertical" />
        </>
      )}
      {!fatal && (
        <PreviewFps
          hostRef={hostRef}
          previewZoom={previewZoom}
          onPreviewZoomChange={onPreviewZoomChange}
          showFps={showFps}
          initialPixelRatioMode={initialPixelRatioMode}
        />
      )}
      <fig-separator direction="vertical" />
      <fig-tooltip text={canvasControlsLabel}>
        <fig-button
          type="button"
          variant="ghost"
          icon="true"
          aria-label={canvasControlsLabel}
          onClick={onToggleCanvasHandles}
        >
          <CanvasControlsIcon
            color={showCanvasHandles ? undefined : "tertiary"}
          />
        </fig-button>
      </fig-tooltip>
      <fig-separator direction="vertical" />
      <fig-fill-picker
        ref={canvasColorPickerRef}
        mode="solid"
        dialog-position="top center"
        value={canvasColorFillValue(canvasColor)}
        aria-label="Canvas color"
      >
        <fig-tooltip text="Canvas color">
          <fig-swatch
            ref={canvasColorSwatchRef}
            background={canvasColor}
            size="medium"
          />
        </fig-tooltip>
      </fig-fill-picker>
    </div>
  );
}
