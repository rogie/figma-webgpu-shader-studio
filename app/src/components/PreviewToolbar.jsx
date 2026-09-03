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
  canvasTheme,
  onCanvasThemeChange,
}) {
  const canvasControlsLabel = showCanvasHandles
    ? "Hide canvas handles"
    : "Show canvas handles";
  const canvasThemeLabel =
    canvasTheme === "dark" ? "Use light canvas" : "Use dark canvas";

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
      <fig-tooltip text={canvasThemeLabel}>
        <fig-button
          variant="ghost"
          icon="true"
          aria-label={canvasThemeLabel}
          onClick={onCanvasThemeChange}
        >
          <fig-icon name={canvasTheme === "dark" ? "moon" : "sun"} />
        </fig-button>
      </fig-tooltip>
    </div>
  );
}
