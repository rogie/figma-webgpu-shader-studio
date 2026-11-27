import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFigOverlayRoot } from "../lib/figOverlay.js";
import { canvasColorFromControlEvent } from "../lib/layoutStorage.js";
import PlayControls from "./PlayControls.jsx";
import PreviewFps from "./PreviewFps.jsx";

const opaqueContent = { __html: "" };

function PreviewSettings({
  canvasColor,
  onCanvasColorChange,
  showCanvasHandles,
  onCanvasHandlesChange,
}) {
  const popupId = useId();
  const handlesLabelId = useId();
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const colorRef = useRef(null);
  const handlesRef = useRef(null);
  const [portalRoot] = useState(getFigOverlayRoot);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    popup.anchor = triggerRef.current;
    handlesRef.current
      ?.querySelector("input")
      ?.setAttribute("aria-labelledby", handlesLabelId);
    const onPopupState = (event) => {
      if (event.target !== popup) return;
      setExpanded(event.detail.requestedOpen);
      if (event.detail.state === "open") colorRef.current?.focus();
    };
    popup.addEventListener("fig-popup-lifecycle", onPopupState);
    return () => popup.removeEventListener("fig-popup-lifecycle", onPopupState);
  }, [handlesLabelId]);

  return (
    <>
      <fig-tooltip text="Preview settings">
        <fig-button
          ref={triggerRef}
          type="button"
          variant="ghost"
          icon="true"
          selected={expanded ? "" : undefined}
          aria-label="Preview settings"
          aria-haspopup="dialog"
          aria-controls={popupId}
          aria-expanded={expanded}
          onClick={() => {
            const popup = popupRef.current;
            if (popup) popup.open = !popup.open;
          }}
        >
          <fig-icon name="adjust" />
        </fig-button>
      </fig-tooltip>
      {portalRoot && createPortal(
        <dialog
          id={popupId}
          is="fig-popup"
          ref={popupRef}
          class="preview-settings-popup"
          role="dialog"
          aria-label="Preview settings"
          position="top center"
          variant="popover"
          popover="manual"
          closedby="any"
        >
          <fig-content>
            <fig-property ratio="1:2">
              <label slot="label">Canvas</label>
              <fig-input-color
                ref={colorRef}
                slot="input"
                full=""
                alpha="true"
                value={canvasColor}
                aria-label="Canvas color"
                onInput={(event) => {
                  onCanvasColorChange?.(canvasColorFromControlEvent(event, canvasColor));
                }}
                dangerouslySetInnerHTML={opaqueContent}
              />
            </fig-property>
            <fig-property ratio="1:2">
              <label id={handlesLabelId} slot="label">Handles</label>
              <fig-switch
                ref={handlesRef}
                slot="input"
                checked={showCanvasHandles ? "" : undefined}
                onInput={(event) => onCanvasHandlesChange?.(event.target.checked)}
                dangerouslySetInnerHTML={opaqueContent}
              />
            </fig-property>
          </fig-content>
        </dialog>,
        portalRoot,
      )}
    </>
  );
}

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
  onCanvasHandlesChange,
  canvasColor,
  onCanvasColorChange,
}) {
  return (
    <div className="tools background--light">
      <div className="preview-tools-layout">
        <div className="preview-tools-main">
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
          <PreviewSettings
            canvasColor={canvasColor}
            onCanvasColorChange={onCanvasColorChange}
            showCanvasHandles={showCanvasHandles}
            onCanvasHandlesChange={onCanvasHandlesChange}
          />
        </div>
        {!fatal && (
          <fig-toolbelt
            class="preview-tools-performance"
            aria-label="Preview zoom and performance"
          >
            <PreviewFps
              hostRef={hostRef}
              previewZoom={previewZoom}
              onPreviewZoomChange={onPreviewZoomChange}
              showFps={showFps}
              initialPixelRatioMode={initialPixelRatioMode}
            />
          </fig-toolbelt>
        )}
      </div>
    </div>
  );
}
