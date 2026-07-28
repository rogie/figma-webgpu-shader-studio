import { useEffect, useRef, useState } from "react";
import CanvasControlsOverlay from "./CanvasControlsOverlay.jsx";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export default function Preview({
  canvasRef,
  error,
  uploading,
  props,
  values,
  onControlInput,
  onControlChange,
  onZoomChange,
  zoomRequest,
  onPickFile,
  onDropError,
}) {
  const stageRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [overlayBox, setOverlayBox] = useState(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const lastZoomRequestId = useRef(null);

  useEffect(() => {
    onZoomChangeRef.current?.(view.zoom);
  }, [view.zoom]);

  useEffect(() => {
    if (!zoomRequest || zoomRequest.id === lastZoomRequestId.current) return;
    lastZoomRequestId.current = zoomRequest.id;
    setView({ zoom: clampZoom(zoomRequest.zoom), x: 0, y: 0 });
  }, [zoomRequest]);

  useEffect(() => {
    const canvas = canvasRef?.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const sync = () => {
      setCanvasSize({
        width: canvas.width || 0,
        height: canvas.height || 0,
      });
      const canvasRect = canvas.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      if (canvasRect.width <= 0 || canvasRect.height <= 0) {
        setOverlayBox(null);
        return;
      }
      setOverlayBox({
        left: canvasRect.left - stageRect.left,
        top: canvasRect.top - stageRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
      });
    };

    sync();
    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(canvas);
    resizeObserver.observe(stage);
    const attrObserver = new MutationObserver(sync);
    attrObserver.observe(canvas, {
      attributes: true,
      attributeFilter: ["width", "height"],
    });
    window.addEventListener("resize", sync);

    return () => {
      resizeObserver.disconnect();
      attrObserver.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [canvasRef]);

  // After zoom/pan, remeasure the transformed canvas so the overlay tracks it.
  useEffect(() => {
    const canvas = canvasRef?.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const id = requestAnimationFrame(() => {
      const canvasRect = canvas.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      if (canvasRect.width <= 0 || canvasRect.height <= 0) {
        setOverlayBox(null);
        return;
      }
      setOverlayBox({
        left: canvasRect.left - stageRect.left,
        top: canvasRect.top - stageRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [view, canvasRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (event) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const mx = event.clientX - rect.left - rect.width / 2;
      const my = event.clientY - rect.top - rect.height / 2;

      setView((current) => {
        const nextZoom = clampZoom(
          current.zoom * Math.exp(-event.deltaY * 0.0015)
        );
        if (nextZoom === current.zoom) return current;
        const ratio = nextZoom / current.zoom;
        return {
          zoom: nextZoom,
          x: mx - (mx - current.x) * ratio,
          y: my - (my - current.y) * ratio,
        };
      });
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;

    const isMedia =
      file.type.startsWith("image/") ||
      file.type.startsWith("video/") ||
      /\.(png|jpe?g|webp|gif|avif|mp4|mov|m4v|webm)$/i.test(file.name);
    if (!isMedia) {
      onDropError?.("Drop an image or video file.");
      return;
    }
    onPickFile(file);
  };

  return (
    <div
      ref={stageRef}
      className={`canvas-stage${dragging ? " is-dragging" : ""}`}
      onDrop={onDrop}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
      }}
      onDoubleClick={(e) => {
        if (e.target.closest("fig-handle, fig-canvas-control, svg")) return;
        setView({ zoom: 1, x: 0, y: 0 });
      }}
    >
      <div
        className="canvas-frame"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        <canvas ref={canvasRef} className="preview-canvas" />
      </div>
      {overlayBox && (
        <div
          className="canvas-controls-overlay"
          style={{
            left: overlayBox.left,
            top: overlayBox.top,
            width: overlayBox.width,
            height: overlayBox.height,
          }}
        >
          <CanvasControlsOverlay
            props={props}
            values={values}
            canvasSize={canvasSize}
            surfaceSize={overlayBox}
            onInputValue={onControlInput}
            onCommit={onControlChange}
          />
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <fig-icon name="add" />
          <strong>Drop image or video</strong>
          <span>Use it as the shader input</span>
        </div>
      )}
      {uploading && !dragging && (
        <div className="upload-overlay">
          <fig-spinner />
          <span>Loading input…</span>
        </div>
      )}
      {error && (
        <div className="error-overlay">
          <div className="error-title">Shader error</div>
          <pre className="error-body">{error}</pre>
        </div>
      )}
    </div>
  );
}
