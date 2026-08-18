import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  CANVAS_PROP_TYPES,
  colorToHex,
  hexToColor,
  showsInPropertyPanel,
} from "../lib/canvasControls.js";
import {
  formatSelectOptions,
  readNumber,
  readPropskitSliderNumber,
  sliderTypeForProperty,
} from "./controls/controlValues.js";
import { useCoalescedPropertyCallback } from "./controls/useCoalescedPropertyCallback.js";

// FigUI3 controls generate their implementation in light DOM. Marking that
// content as opaque prevents React from deleting it on subsequent renders.
const opaqueContent = { __html: "" };

function NumberControl({ def, value, onChange }) {
  const current = value ?? def.defaultValue ?? 0;
  return (
    <fig-input-number
      value={current}
      min={def.min}
      max={def.max}
      step={def.step ?? 0.01}
      units={def.unit || ""}
      onInput={(event) => onChange(readNumber(event))}
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function PropskitNumberControl({ name, def, value, onChange }) {
  const numberRef = useRef(null);

  useEffect(() => {
    const control = numberRef.current;
    if (!control) return;
    const handleValue = (event) => {
      const next = readNumber(event);
      if (Number.isFinite(next)) onChange(name, next);
    };
    control.addEventListener("input", handleValue);
    control.addEventListener("change", handleValue);
    return () => {
      control.removeEventListener("input", handleValue);
      control.removeEventListener("change", handleValue);
    };
  }, [name, onChange]);

  return (
    <propskit-number
      ref={numberRef}
      label={def.label || name}
      direction="horizontal"
      size="large"
      value={value ?? def.defaultValue ?? 0}
      default={def.defaultValue ?? 0}
      min={def.min}
      max={def.max}
      step={def.step ?? 0.01}
      units={def.unit || ""}
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function PropskitTextControl({ name, def, value, onChange }) {
  const textRef = useRef(null);

  useEffect(() => {
    const control = textRef.current;
    if (!control) return;
    const handleValue = (event) => {
      const detail = event.detail;
      const next =
        detail && typeof detail === "object" && "value" in detail
          ? detail.value
          : (detail ?? event.target.value);
      onChange(name, String(next ?? ""));
    };
    control.addEventListener("input", handleValue);
    control.addEventListener("change", handleValue);
    return () => {
      control.removeEventListener("input", handleValue);
      control.removeEventListener("change", handleValue);
    };
  }, [name, onChange]);

  return (
    <propskit-text
      ref={textRef}
      label={def.label || name}
      direction="horizontal"
      size="large"
      value={value ?? def.defaultValue ?? ""}
      default={def.defaultValue ?? ""}
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function PropskitSliderControl({ name, def, value, onInputValue, onCommit }) {
  const sliderRef = useRef(null);
  const draggingRef = useRef(false);
  const latestValue = value ?? def.defaultValue ?? 0;
  const min = def.min ?? 0;
  const max = def.max ?? 1;
  const step = def.step ?? 0.01;
  const sliderType = sliderTypeForProperty(name, min, max, step);
  const units = sliderType === "opacity" ? "%" : def.unit || "";

  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider) return;
    const readNext = (event) => {
      const next = readPropskitSliderNumber(event);
      return Number.isFinite(next) ? next : null;
    };
    const handleInput = (event) => {
      draggingRef.current = true;
      const next = readNext(event);
      if (next != null) onInputValue(name, next);
    };
    const handleChange = (event) => {
      draggingRef.current = false;
      const next = readNext(event);
      if (next != null) onCommit(name, next);
    };
    const endDrag = () => {
      draggingRef.current = false;
    };
    slider.addEventListener("input", handleInput);
    slider.addEventListener("change", handleChange);
    slider.addEventListener("pointerup", endDrag);
    slider.addEventListener("pointercancel", endDrag);
    return () => {
      slider.removeEventListener("input", handleInput);
      slider.removeEventListener("change", handleChange);
      slider.removeEventListener("pointerup", endDrag);
      slider.removeEventListener("pointercancel", endDrag);
    };
  }, [name, onCommit, onInputValue]);

  // Keep `value` off the React props path. Rewriting the attribute from React
  // while scrubbing re-enters propskit's attr sync / fig-slider value path.
  useLayoutEffect(() => {
    const slider = sliderRef.current;
    if (!slider || draggingRef.current) return;
    if (slider.matches(":focus-within")) return;
    if (slider.hasAttribute("data-elastic-dragging")) return;
    if (slider.hasAttribute("data-number-scrubbing")) return;
    const current = Number(slider.getAttribute("value"));
    if (Number.isFinite(current) && current === Number(latestValue)) return;
    const next = String(latestValue);
    if (slider.getAttribute("value") === next) return;
    slider.setAttribute("value", next);
  }, [latestValue]);

  return (
    <propskit-slider
      ref={sliderRef}
      label={def.label || name}
      direction="horizontal"
      size="large"
      default={def.defaultValue}
      min={min}
      max={max}
      step={step}
      units={units}
      text="true"
      {...(sliderType ? { type: sliderType } : {})}
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function SwitchControl({ name, def, value, onChange }) {
  const switchRef = useRef(null);
  const checked = Boolean(value ?? def.defaultValue ?? false);

  useEffect(() => {
    const control = switchRef.current;
    if (!control) return;
    const handleValue = (event) => {
      const next = event.detail?.checked ?? control.checked;
      onChange(name, Boolean(next));
    };
    control.addEventListener("input", handleValue);
    control.addEventListener("change", handleValue);
    return () => {
      control.removeEventListener("input", handleValue);
      control.removeEventListener("change", handleValue);
    };
  }, [name, onChange]);

  const defaultChecked = Boolean(def.defaultValue);
  return (
    <propskit-switch
      ref={switchRef}
      label={def.label || name}
      direction="horizontal"
      size="large"
      {...(checked ? { checked: "" } : {})}
      {...(defaultChecked ? { default: "" } : {})}
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function SelectControl({ name, def, value, onChange, onPreview }) {
  const selectRef = useRef(null);
  const selectedValueRef = useRef(null);
  const hoveredValueRef = useRef(null);
  const options = def.options || [];
  const numeric = options.length > 0 && typeof options[0].value === "number";
  const current = value ?? def.defaultValue;
  selectedValueRef.current = current;

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return;
    const innerSelect = select.querySelector("fig-select");
    if (!innerSelect) return;

    const readValue = (raw) => (numeric ? Number(raw) : raw);
    const restoreSelected = () => {
      if (hoveredValueRef.current == null) return;
      hoveredValueRef.current = null;
      onPreview(name, selectedValueRef.current);
    };
    const handleValue = (event) => {
      // propskit-select forwards fig-select detail as the raw string value.
      const detail = event.detail;
      const raw =
        detail && typeof detail === "object" && "value" in detail
          ? detail.value
          : (detail ?? event.target.value);
      const next = readValue(raw);
      selectedValueRef.current = next;
      hoveredValueRef.current = null;
      onChange(name, next);
    };
    const handleOptionHover = (event) => {
      const next = readValue(event.detail);
      if (Object.is(hoveredValueRef.current, next)) return;
      hoveredValueRef.current = next;
      onPreview(name, next);
    };
    select.addEventListener("input", handleValue);
    select.addEventListener("change", handleValue);
    select.addEventListener("optionhover", handleOptionHover);

    const openObserver = new MutationObserver(() => {
      if (!innerSelect?.open) restoreSelected();
    });
    openObserver.observe(innerSelect, {
      attributes: true,
      attributeFilter: ["open"],
    });

    return () => {
      select.removeEventListener("input", handleValue);
      select.removeEventListener("change", handleValue);
      select.removeEventListener("optionhover", handleOptionHover);
      openObserver.disconnect();
    };
  }, [name, numeric, onChange, onPreview]);

  const defaultValue =
    def.defaultValue == null ? "" : String(def.defaultValue);
  return (
    <propskit-select
      ref={selectRef}
      label={def.label || name}
      direction="horizontal"
      size="large"
      value={current == null ? "" : String(current)}
      default={defaultValue}
      options={formatSelectOptions(options)}
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function PropskitColorControl({ name, def, value, onChange }) {
  const colorRef = useRef(null);
  const current =
    value || def.defaultValue || { r: 0, g: 0, b: 0, a: 1 };

  useEffect(() => {
    const control = colorRef.current;
    if (!control) return;
    const handleValue = () => {
      const input = control.querySelector("fig-input-color");
      const rgba = input?.rgba;
      if (!rgba) return;
      onChange(name, {
        r: rgba.r / 255,
        g: rgba.g / 255,
        b: rgba.b / 255,
        a: rgba.a,
      });
    };
    control.addEventListener("input", handleValue);
    control.addEventListener("change", handleValue);
    return () => {
      control.removeEventListener("input", handleValue);
      control.removeEventListener("change", handleValue);
    };
  }, [name, onChange]);

  const defaultColor =
    def.defaultValue || { r: 0, g: 0, b: 0, a: 1 };
  return (
    <propskit-color
      ref={colorRef}
      label={def.label || name}
      direction="horizontal"
      size="large"
      value={colorToHex(current)}
      default={colorToHex(defaultColor)}
      alpha="true"
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function propskitPositionUnits(def) {
  const unit = def?.positionUnit || def?.unit || "%";
  return unit === "%" || unit === "percent" ? "percent" : undefined;
}

function propskitRadiusUnits(def) {
  const unit = def?.radiusUnit || def?.positionUnit || def?.unit || "%";
  return unit === "%" || unit === "percent" ? "percent" : undefined;
}

function serializePropskitRadius(radius, percentUnits) {
  const number = Number(radius ?? 0);
  return percentUnits ? `${number}%` : number;
}

function parsePropskitRadius(raw) {
  if (typeof raw === "string" && raw.trim().endsWith("%")) {
    return Number.parseFloat(raw);
  }
  return Number(raw ?? 0);
}

function readPropskitDetail(event) {
  const detail = event.detail;
  if (typeof detail === "string") {
    try {
      return JSON.parse(detail);
    } catch {
      return null;
    }
  }
  return detail && typeof detail === "object" ? detail : null;
}

function usePropskitSpatialEvents(ref, name, mapDetail, onInputValue, onCommit) {
  const mapDetailRef = useRef(mapDetail);
  const onInputRef = useRef(onInputValue);
  const onCommitRef = useRef(onCommit);
  const draggingRef = useRef(false);
  useLayoutEffect(() => {
    mapDetailRef.current = mapDetail;
    onInputRef.current = onInputValue;
    onCommitRef.current = onCommit;
  }, [mapDetail, onCommit, onInputValue]);

  useEffect(() => {
    const control = ref.current;
    if (!control) return;
    const handleInput = (event) => {
      draggingRef.current = true;
      const detail = readPropskitDetail(event);
      const next = detail ? mapDetailRef.current(detail) : null;
      if (next) onInputRef.current(name, next);
    };
    const handleChange = (event) => {
      draggingRef.current = false;
      const detail = readPropskitDetail(event);
      const next = detail ? mapDetailRef.current(detail) : null;
      if (next) onCommitRef.current(name, next);
    };
    const endDrag = () => {
      draggingRef.current = false;
    };
    control.addEventListener("input", handleInput);
    control.addEventListener("change", handleChange);
    control.addEventListener("pointerup", endDrag);
    control.addEventListener("pointercancel", endDrag);
    return () => {
      control.removeEventListener("input", handleInput);
      control.removeEventListener("change", handleChange);
      control.removeEventListener("pointerup", endDrag);
      control.removeEventListener("pointercancel", endDrag);
    };
  }, [name, ref]);

  return draggingRef;
}

/** Avoid rewriting attrs while the control is being scrubbed (same as slider). */
function useSyncPropskitValueAttr(ref, serialized, draggingRef) {
  useLayoutEffect(() => {
    const control = ref.current;
    if (!control || draggingRef.current) return;
    if (control.matches(":focus-within")) return;
    if (control.getAttribute("value") === serialized) return;
    control.setAttribute("value", serialized);
  }, [draggingRef, ref, serialized]);
}

function useSyncPropskitPositionAttrs(ref, x, y, draggingRef) {
  useLayoutEffect(() => {
    const control = ref.current;
    if (!control || draggingRef.current) return;
    if (control.matches(":focus-within")) return;
    const nextX = String(x);
    const nextY = String(y);
    if (control.getAttribute("x") !== nextX) control.setAttribute("x", nextX);
    if (control.getAttribute("y") !== nextY) control.setAttribute("y", nextY);
  }, [draggingRef, ref, x, y]);
}

function PropskitPositionControl({ name, def, value, onInputValue, onCommit }) {
  const controlRef = useRef(null);
  const current = value || def.defaultValue || { x: 50, y: 50 };
  const currentRef = useRef(current);
  currentRef.current = current;
  const defaults = def.defaultValue || { x: 50, y: 50 };
  const units = propskitPositionUnits(def);
  const mapDetail = useCallback(
    (detail) => ({
      x: Number(detail.x ?? currentRef.current.x ?? 50),
      y: Number(detail.y ?? currentRef.current.y ?? 50),
    }),
    []
  );
  const draggingRef = usePropskitSpatialEvents(
    controlRef,
    name,
    mapDetail,
    onInputValue,
    onCommit
  );
  useSyncPropskitPositionAttrs(
    controlRef,
    current.x ?? 50,
    current.y ?? 50,
    draggingRef
  );

  return (
    <propskit-position
      ref={controlRef}
      label={def.label || name}
      size="large"
      default={JSON.stringify({
        x: defaults.x ?? 50,
        y: defaults.y ?? 50,
      })}
      {...(units ? { units } : {})}
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function PropskitPointRadiusControl({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const current = value || def.defaultValue || { x: 50, y: 50, radius: 0 };
  const currentRef = useRef(current);
  currentRef.current = current;
  const units = propskitRadiusUnits(def);
  const serialized = JSON.stringify({
    x: current.x ?? 50,
    y: current.y ?? 50,
    radius: serializePropskitRadius(current.radius, units === "percent"),
  });
  const mapDetail = useCallback(
    (detail) => ({
      x: Number(detail.x ?? currentRef.current.x ?? 50),
      y: Number(detail.y ?? currentRef.current.y ?? 50),
      radius: parsePropskitRadius(detail.radius ?? currentRef.current.radius),
    }),
    []
  );
  const draggingRef = usePropskitSpatialEvents(
    controlRef,
    name,
    mapDetail,
    onInputValue,
    onCommit
  );
  useSyncPropskitValueAttr(controlRef, serialized, draggingRef);

  return (
    <propskit-point-radius
      ref={controlRef}
      label={def.label || name}
      size="large"
      {...(units ? { units } : {})}
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function PropskitPointRadiusAngleControl({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const current =
    value || def.defaultValue || { x: 50, y: 50, radius: 0, angle: 0 };
  const currentRef = useRef(current);
  currentRef.current = current;
  const units = propskitRadiusUnits(def);
  const serialized = JSON.stringify({
    x: current.x ?? 50,
    y: current.y ?? 50,
    radius: serializePropskitRadius(current.radius, units === "percent"),
    angle: current.angle ?? 0,
  });
  const mapDetail = useCallback(
    (detail) => ({
      x: Number(detail.x ?? currentRef.current.x ?? 50),
      y: Number(detail.y ?? currentRef.current.y ?? 50),
      radius: parsePropskitRadius(detail.radius ?? currentRef.current.radius),
      angle: Number(detail.angle ?? currentRef.current.angle ?? 0),
    }),
    []
  );
  const draggingRef = usePropskitSpatialEvents(
    controlRef,
    name,
    mapDetail,
    onInputValue,
    onCommit
  );
  useSyncPropskitValueAttr(controlRef, serialized, draggingRef);

  return (
    <propskit-point-radius-angle
      ref={controlRef}
      label={def.label || name}
      size="large"
      {...(units ? { units } : {})}
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function PropskitPointPointControl({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const current =
    value || def.defaultValue || { x: 25, y: 25, x2: 75, y2: 75 };
  const currentRef = useRef(current);
  currentRef.current = current;
  const units = propskitPositionUnits(def);
  const serialized = JSON.stringify({
    x: current.x ?? 25,
    y: current.y ?? 25,
    x2: current.x2 ?? 75,
    y2: current.y2 ?? 75,
  });
  const mapDetail = useCallback(
    (detail) => ({
      x: Number(detail.x ?? currentRef.current.x ?? 25),
      y: Number(detail.y ?? currentRef.current.y ?? 25),
      x2: Number(detail.x2 ?? currentRef.current.x2 ?? 75),
      y2: Number(detail.y2 ?? currentRef.current.y2 ?? 75),
    }),
    []
  );
  const draggingRef = usePropskitSpatialEvents(
    controlRef,
    name,
    mapDetail,
    onInputValue,
    onCommit
  );
  useSyncPropskitValueAttr(controlRef, serialized, draggingRef);

  return (
    <propskit-point-point
      ref={controlRef}
      label={def.label || name}
      size="large"
      {...(units ? { units } : {})}
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function PropskitColorPointControl({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const current =
    value ||
    def.defaultValue || {
      x: 50,
      y: 50,
      color: { r: 1, g: 1, b: 1, a: 1 },
    };
  const currentRef = useRef(current);
  currentRef.current = current;
  // Keep #RRGGBBAA so opacity-only canvas edits still change the serialized
  // value (6-digit hex would look identical and skip the panel sync).
  const serialized = JSON.stringify({
    x: current.x ?? 50,
    y: current.y ?? 50,
    color: colorToHex(current.color || { r: 1, g: 1, b: 1, a: 1 }),
  });
  const mapDetail = useCallback((detail) => {
    const fallback = currentRef.current;
    let color =
      typeof detail.color === "string"
        ? hexToColor(detail.color)
        : { ...(fallback.color || { r: 1, g: 1, b: 1, a: 1 }) };
    if (detail.alpha != null && Number.isFinite(Number(detail.alpha))) {
      color = {
        ...color,
        a: Math.max(0, Math.min(1, Number(detail.alpha))),
      };
    } else if (
      detail.opacity != null &&
      Number.isFinite(Number(detail.opacity))
    ) {
      color = {
        ...color,
        a: Math.max(0, Math.min(100, Number(detail.opacity))) / 100,
      };
    }
    return {
      x: Number(detail.x ?? fallback.x ?? 50),
      y: Number(detail.y ?? fallback.y ?? 50),
      color,
    };
  }, []);
  const draggingRef = usePropskitSpatialEvents(
    controlRef,
    name,
    mapDetail,
    onInputValue,
    onCommit
  );
  useSyncPropskitValueAttr(controlRef, serialized, draggingRef);

  // propskit-color-point's inner color control omits alpha; enable it so the
  // panel can show/edit opacity that canvas color handles emit.
  useLayoutEffect(() => {
    const host = controlRef.current;
    if (!host) return;
    const color = host.querySelector?.("propskit-color");
    if (color && color.getAttribute("alpha") !== "true") {
      color.setAttribute("alpha", "true");
    }
  }, []);

  return (
    <propskit-color-point
      ref={controlRef}
      label={def.label || name}
      size="large"
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function serializeGradient(stops) {
  return JSON.stringify({
    type: "gradient",
    gradient: {
      type: "linear",
      angle: 90,
      interpolationSpace: "srgb",
      hueInterpolation: "shorter",
      stops: stops.map((stop) => ({
        position: Math.max(0, Math.min(100, Number(stop.position) * 100)),
        color: colorToHex(stop.color).slice(0, 7),
        opacity: Math.round(
          Math.max(0, Math.min(1, Number(stop.color?.a ?? 1))) * 100
        ),
      })),
    },
  });
}

function PropskitGradientControl({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const gradientRef = useRef(null);
  const stops = value?.stops || def.defaultValue?.stops || [];
  const serialized = serializeGradient(stops);
  const serializedDefault = serializeGradient(def.defaultValue?.stops || stops);

  useEffect(() => {
    const control = gradientRef.current;
    if (!control) return;
    const readValue = (event) => {
      let detail = event.detail;
      if (typeof detail === "string") {
        try {
          detail = JSON.parse(detail);
        } catch {
          return null;
        }
      }
      const nextStops = detail?.gradient?.stops;
      if (!Array.isArray(nextStops)) return null;
      return {
        stops: nextStops.map((stop) => {
          const color = hexToColor(stop.color);
          color.a =
            stop.opacity == null
              ? color.a
              : Math.max(0, Math.min(100, Number(stop.opacity))) / 100;
          return {
            position:
              Math.max(0, Math.min(100, Number(stop.position))) / 100,
            color,
          };
        }),
      };
    };
    const handleInput = (event) => {
      const next = readValue(event);
      if (next) onInputValue(name, next);
    };
    const handleChange = (event) => {
      const next = readValue(event);
      if (next) onCommit(name, next);
    };
    control.addEventListener("input", handleInput);
    control.addEventListener("change", handleChange);
    return () => {
      control.removeEventListener("input", handleInput);
      control.removeEventListener("change", handleChange);
    };
  }, [name, onCommit, onInputValue]);

  return (
    <propskit-gradient
      ref={gradientRef}
      label={def.label || name}
      direction="horizontal"
      value={serialized}
      default={serializedDefault}
      size="large"
      edit="picker"
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function Control({ def, value, onChange }) {
  if (def.type === "number") {
    return <NumberControl def={def} value={value} onChange={onChange} />;
  }
  return <code className="unknown-type">{def.type || "unknown"}</code>;
}

export default function Controls({ props, values, onChange, onInput }) {
  const coalescedChange = useCoalescedPropertyCallback(onChange);
  const coalescedInput = useCoalescedPropertyCallback(onInput);
  // Spatial/canvas-handle props stay at the bottom so ordinary controls stay
  // grouped at the top of the panel.
  const entries = Object.entries(props || {})
    .filter(([, def]) => showsInPropertyPanel(def))
    .sort(([, a], [, b]) => {
      const aCanvas = CANVAS_PROP_TYPES.has(a?.type) ? 1 : 0;
      const bCanvas = CANVAS_PROP_TYPES.has(b?.type) ? 1 : 0;
      return aCanvas - bCanvas;
    });
  if (entries.length === 0) {
    return (
      <fig-field>
        <p className="empty-state">This shader has no exposed properties.</p>
      </fig-field>
    );
  }
  return entries.map(([name, def]) => {
    const key = `${name}:${def.type}:${def.control || ""}:${JSON.stringify(
      def.options || []
    )}`;
    if (def.type === "number" && def.control === "slider") {
      return (
        <PropskitSliderControl
          key={key}
          name={name}
          def={def}
          value={values[name]}
          onInputValue={coalescedInput}
          onCommit={coalescedChange}
        />
      );
    }
    if (def.control === "select") {
      return (
        <SelectControl
          key={key}
          name={name}
          def={def}
          value={values[name]}
          onChange={coalescedChange}
          onPreview={coalescedInput}
        />
      );
    }
    if (def.type === "boolean") {
      return (
        <SwitchControl
          key={key}
          name={name}
          def={def}
          value={values[name]}
          onChange={coalescedChange}
        />
      );
    }
    if (def.type === "number" && def.control !== "slider") {
      return (
        <PropskitNumberControl
          key={key}
          name={name}
          def={def}
          value={values[name]}
          onChange={coalescedChange}
        />
      );
    }
    if (def.type === "string") {
      return (
        <PropskitTextControl
          key={key}
          name={name}
          def={def}
          value={values[name]}
          onChange={coalescedChange}
        />
      );
    }
    if (def.type === "color") {
      return (
        <PropskitColorControl
          key={key}
          name={name}
          def={def}
          value={values[name]}
          onChange={coalescedChange}
        />
      );
    }
    if (def.type === "gradient") {
      return (
        <PropskitGradientControl
          key={key}
          name={name}
          def={def}
          value={values[name]}
          onInputValue={coalescedInput}
          onCommit={coalescedChange}
        />
      );
    }
    if (def.type === "point") {
      return (
        <PropskitPositionControl
          key={key}
          name={name}
          def={def}
          value={values[name]}
          onInputValue={coalescedInput}
          onCommit={coalescedChange}
        />
      );
    }
    if (def.type === "point-radius") {
      return (
        <PropskitPointRadiusControl
          key={key}
          name={name}
          def={def}
          value={values[name]}
          onInputValue={coalescedInput}
          onCommit={coalescedChange}
        />
      );
    }
    if (def.type === "point-angle-radius") {
      return (
        <PropskitPointRadiusAngleControl
          key={key}
          name={name}
          def={def}
          value={values[name]}
          onInputValue={coalescedInput}
          onCommit={coalescedChange}
        />
      );
    }
    if (def.type === "point-point-line") {
      return (
        <PropskitPointPointControl
          key={key}
          name={name}
          def={def}
          value={values[name]}
          onInputValue={coalescedInput}
          onCommit={coalescedChange}
        />
      );
    }
    if (def.type === "color-point") {
      return (
        <PropskitColorPointControl
          key={key}
          name={name}
          def={def}
          value={values[name]}
          onInputValue={coalescedInput}
          onCommit={coalescedChange}
        />
      );
    }
    return (
      <fig-field direction="horizontal" key={key}>
        <label>{def.label || name}</label>
        <Control
          def={def}
          value={values[name]}
          onChange={(value) => coalescedChange(name, value)}
        />
      </fig-field>
    );
  });
}
