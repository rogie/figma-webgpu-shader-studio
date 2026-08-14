import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import CanvasControlsOverlay from "./CanvasControlsOverlay.jsx";

const DefaultHtmlInput = lazy(() => import("./DefaultHtmlInput.jsx"));

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function Preview({
  canvasRef,
  uploading,
  props,
  values,
  onControlInput,
  onControlChange,
  onZoomChange,
  zoomRequest,
  onPickFile,
  onDropError,
  onStageSize,
  onPointerSurface,
  inputSource = "image",
  htmlInputRef,
}) {
  const stageRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [overlayBox, setOverlayBox] = useState(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const onStageSizeRef = useRef(onStageSize);
  onStageSizeRef.current = onStageSize;
  const onPointerSurfaceRef = useRef(onPointerSurface);
  onPointerSurfaceRef.current = onPointerSurface;
  const lastZoomRequestId = useRef(null);

  // The overlay covers the canvas box, so the host can read mousePosition from
  // it while a canvas control handle is hovered or dragged.
  const attachPointerSurface = useCallback((node) => {
    onPointerSurfaceRef.current?.(node);
  }, []);

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
    if (!canvas) return;
    if (inputSource === "html") {
      canvas.setAttribute("layoutsubtree", "");
      canvas.layoutSubtree = true;
    } else {
      canvas.removeAttribute("layoutsubtree");
      if ("layoutSubtree" in canvas) canvas.layoutSubtree = false;
    }
  }, [canvasRef, inputSource]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const report = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        onStageSizeRef.current?.(rect.width, rect.height);
      }
    };

    report();
    const resizeObserver = new ResizeObserver(report);
    resizeObserver.observe(stage);
    window.addEventListener("resize", report);

    // devicePixelRatio can change when moving between displays.
    let dprQuery = null;
    const onDprChange = () => {
      report();
      watchDpr();
    };
    const watchDpr = () => {
      dprQuery?.removeEventListener?.("change", onDprChange);
      dprQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio || 1}dppx)`
      );
      dprQuery.addEventListener?.("change", onDprChange);
    };
    watchDpr();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", report);
      dprQuery?.removeEventListener?.("change", onDprChange);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef?.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const sync = () => {
      const renderScale = Math.max(
        1,
        Number(canvas.dataset.renderScale) || 1
      );
      setCanvasSize({
        width: (canvas.width || 0) / renderScale,
        height: (canvas.height || 0) / renderScale,
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
      attributeFilter: ["width", "height", "data-render-scale"],
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
      // Trackpad pinch arrives as a ctrl+wheel gesture with a much smaller
      // delta than ordinary scrolling, so normalize it to the same feel.
      const zoomDelta = event.deltaY * (event.ctrlKey ? 3 : 1);
      setView((current) => {
        const nextZoom = clampZoom(
          current.zoom * Math.exp(-zoomDelta * 0.003)
        );
        if (nextZoom === current.zoom) return current;
        // Zoom from canvas center only (no cursor-anchored pan).
        return { zoom: nextZoom, x: 0, y: 0 };
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
        <canvas ref={canvasRef} className="preview-canvas">
          {inputSource === "html" ? (
            <div ref={htmlInputRef} className="preview-html-input">
              <Suspense fallback={null}>
                <DefaultHtmlInput />
              </Suspense>
            </div>
          ) : null}
        </canvas>
      </div>
      {overlayBox && (
        <div
          ref={attachPointerSurface}
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
    </div>
  );
}

export default memo(Preview);
