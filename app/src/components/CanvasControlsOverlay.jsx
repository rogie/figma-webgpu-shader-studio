import { useEffect, useLayoutEffect, useRef } from "react";
import {
  canvasControlName,
  colorToHex,
  fromFigCanvasValue,
  listCanvasControls,
  toFigCanvasValue,
} from "../lib/canvasControls.js";

// fig-canvas-control builds light-DOM handles; keep React from wiping them.
const opaqueContent = { __html: "" };

function forceSurfaceSync(control) {
  // value change with an existing handle only re-runs syncPositions (no remount).
  const value = control.getAttribute("value");
  if (value == null) return;
  control.removeAttribute("value");
  control.setAttribute("value", value);
}

function CanvasControl({
  name,
  def,
  type,
  value,
  size,
  surfaceSize,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const draggingRef = useRef(false);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const serialized = JSON.stringify(toFigCanvasValue(def, value, size));
  const colorHex =
    type === "color"
      ? colorToHex((value || def.defaultValue)?.color)
      : null;

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;

    const readDetail = (event) => {
      const detail = event.detail;
      return fromFigCanvasValue(def, detail, sizeRef.current);
    };

    const handleInput = (event) => {
      draggingRef.current = true;
      onInputValue?.(name, readDetail(event));
    };
    const handleChange = (event) => {
      draggingRef.current = false;
      onCommit?.(name, readDetail(event));
    };

    control.addEventListener("input", handleInput);
    control.addEventListener("change", handleChange);
    return () => {
      control.removeEventListener("input", handleInput);
      control.removeEventListener("change", handleChange);
    };
  }, [name, def, onCommit, onInputValue]);

  useLayoutEffect(() => {
    const control = controlRef.current;
    if (!control || draggingRef.current) return;
    if (control.getAttribute("value") !== serialized) {
      control.setAttribute("value", serialized);
    }
    if (colorHex != null) {
      if (control.getAttribute("color") !== colorHex) {
        control.setAttribute("color", colorHex);
      }
    }
  }, [serialized, colorHex]);

  // Overlay tracks the zoomed canvas box; nudge fig-canvas-control to relayout.
  useEffect(() => {
    const control = controlRef.current;
    if (!control || draggingRef.current || !surfaceSize) return;
    forceSurfaceSync(control);
  }, [surfaceSize?.width, surfaceSize?.height, surfaceSize?.left, surfaceSize?.top]);

  return (
    <fig-canvas-control
      ref={controlRef}
      type={type}
      name={canvasControlName(name, def)}
      snapping="modifier"
      drag-surface="parent"
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

export default function CanvasControlsOverlay({
  props,
  values,
  canvasSize,
  surfaceSize,
  onInputValue,
  onCommit,
}) {
  const controls = listCanvasControls(props);
  if (controls.length === 0) return null;

  return (
    <>
      {controls.map(({ name, def, type }) => (
        <CanvasControl
          key={`${name}:${type}`}
          name={name}
          def={def}
          type={type}
          value={values?.[name]}
          size={canvasSize}
          surfaceSize={surfaceSize}
          onInputValue={onInputValue}
          onCommit={onCommit}
        />
      ))}
    </>
  );
}
