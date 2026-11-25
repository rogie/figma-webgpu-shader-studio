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
  readColorControlValue,
  readControlEventValue,
  readGradientControlValue,
  readNumber,
  readPointControlValue,
  serializeGradientValue,
  sliderTypeForProperty,
} from "./controls/controlValues.js";
import { useCoalescedPropertyCallback } from "./controls/useCoalescedPropertyCallback.js";

// FigUI3 leaf controls render implementation nodes in their light DOM. Marking
// that content as opaque keeps React from reconciling those generated nodes.
const opaqueContent = { __html: "" };

function PropertyRow({ label, children }) {
  return (
    <fig-property>
      <label slot="label">{label}</label>
      {children}
    </fig-property>
  );
}

function useControlEvents(ref, readValue, onInputValue, onCommit) {
  const readRef = useRef(readValue);
  const inputRef = useRef(onInputValue);
  const commitRef = useRef(onCommit);
  const interactingRef = useRef(false);

  useLayoutEffect(() => {
    readRef.current = readValue;
    inputRef.current = onInputValue;
    commitRef.current = onCommit;
  }, [onCommit, onInputValue, readValue]);

  useEffect(() => {
    const control = ref.current;
    if (!control) return undefined;

    const handleInput = (event) => {
      const next = readRef.current(event, control);
      if (next == null) return;
      interactingRef.current = true;
      inputRef.current?.(next);
    };
    const handleChange = (event) => {
      const next = readRef.current(event, control);
      interactingRef.current = false;
      if (next == null) return;
      commitRef.current?.(next);
    };
    const handleInteractionEnd = () => {
      interactingRef.current = false;
    };

    control.addEventListener("input", handleInput);
    control.addEventListener("change", handleChange);
    control.addEventListener("pointercancel", handleInteractionEnd);
    control.addEventListener("focusout", handleInteractionEnd);
    return () => {
      control.removeEventListener("input", handleInput);
      control.removeEventListener("change", handleChange);
      control.removeEventListener("pointercancel", handleInteractionEnd);
      control.removeEventListener("focusout", handleInteractionEnd);
    };
  }, [ref]);

  return interactingRef;
}

function useSyncedAttribute(ref, name, value, interactingRef) {
  useLayoutEffect(() => {
    const control = ref.current;
    if (!control || interactingRef?.current) return;
    if (control.matches(":focus-within")) return;
    if (value == null) {
      if (control.hasAttribute(name)) control.removeAttribute(name);
      return;
    }
    const next = String(value);
    if (control.getAttribute(name) !== next) {
      control.setAttribute(name, next);
    }
  }, [interactingRef, name, ref, value]);
}

function useSyncedBooleanAttribute(ref, name, enabled, interactingRef) {
  useLayoutEffect(() => {
    const control = ref.current;
    if (!control || interactingRef?.current) return;
    control.toggleAttribute(name, Boolean(enabled));
  }, [enabled, interactingRef, name, ref]);
}

function NumberProperty({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const current = value ?? def.defaultValue ?? 0;
  const readValue = useCallback((event) => {
    const next = readNumber(event);
    return Number.isFinite(next) ? next : null;
  }, []);
  const interactingRef = useControlEvents(
    controlRef,
    readValue,
    (next) => onInputValue(name, next),
    (next) => onCommit(name, next),
  );
  useSyncedAttribute(controlRef, "value", current, interactingRef);

  return (
    <PropertyRow label={def.label || name}>
      <fig-input-number
        ref={controlRef}
        slot="input"
        default={def.defaultValue ?? 0}
        min={def.min}
        max={def.max}
        step={def.step ?? 0.01}
        units={def.unit || ""}
        full=""
        dangerouslySetInnerHTML={opaqueContent}
      />
    </PropertyRow>
  );
}

function TextProperty({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const current = value ?? def.defaultValue ?? "";
  const readValue = useCallback(
    (event) => String(readControlEventValue(event) ?? ""),
    [],
  );
  const interactingRef = useControlEvents(
    controlRef,
    readValue,
    (next) => onInputValue(name, next),
    (next) => onCommit(name, next),
  );
  useSyncedAttribute(controlRef, "value", current, interactingRef);

  return (
    <PropertyRow label={def.label || name}>
      <fig-input-text
        ref={controlRef}
        slot="input"
        default={def.defaultValue ?? ""}
        full=""
        dangerouslySetInnerHTML={opaqueContent}
      />
    </PropertyRow>
  );
}

function SliderProperty({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const current = value ?? def.defaultValue ?? 0;
  const min = def.min ?? 0;
  const max = def.max ?? 1;
  const step = def.step ?? 0.01;
  const type = sliderTypeForProperty(name, min, max, step);
  const units = type === "opacity" ? "%" : def.unit || "";
  const readValue = useCallback((event) => {
    const next = Number(readControlEventValue(event));
    return Number.isFinite(next) ? next : null;
  }, []);
  const interactingRef = useControlEvents(
    controlRef,
    readValue,
    (next) => onInputValue(name, next),
    (next) => onCommit(name, next),
  );
  useSyncedAttribute(controlRef, "value", current, interactingRef);

  return (
    <PropertyRow label={def.label || name}>
      <fig-slider
        ref={controlRef}
        slot="input"
        default={def.defaultValue ?? 0}
        min={min}
        max={max}
        step={step}
        units={units}
        text="true"
        full=""
        {...(type ? { type } : {})}
        dangerouslySetInnerHTML={opaqueContent}
      />
    </PropertyRow>
  );
}

function SwitchProperty({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const checked = Boolean(value ?? def.defaultValue ?? false);
  const readValue = useCallback(
    (_event, control) => Boolean(control.checked),
    [],
  );
  const interactingRef = useControlEvents(
    controlRef,
    readValue,
    (next) => onInputValue(name, next),
    (next) => onCommit(name, next),
  );
  useSyncedBooleanAttribute(
    controlRef,
    "checked",
    checked,
    interactingRef,
  );

  return (
    <PropertyRow label={def.label || name}>
      <fig-switch
        ref={controlRef}
        slot="input"
        default-checked={def.defaultValue ? "" : undefined}
        dangerouslySetInnerHTML={opaqueContent}
      />
    </PropertyRow>
  );
}

function SelectProperty({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const selectedValueRef = useRef(value ?? def.defaultValue);
  const previewedRef = useRef(false);
  const options = def.options || [];
  const numeric = options.length > 0 && typeof options[0].value === "number";
  const current = value ?? def.defaultValue;

  useLayoutEffect(() => {
    selectedValueRef.current = current;
  }, [current]);
  useSyncedAttribute(
    controlRef,
    "value",
    current == null ? "" : String(current),
  );

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return undefined;
    const parseValue = (raw) => (numeric ? Number(raw) : raw);
    const restorePreview = () => {
      if (!previewedRef.current) return;
      previewedRef.current = false;
      onInputValue(name, selectedValueRef.current);
    };
    const handleChange = (event) => {
      const next = parseValue(readControlEventValue(event));
      selectedValueRef.current = next;
      previewedRef.current = false;
      onCommit(name, next);
    };
    const handlePreview = (event) => {
      const next = parseValue(readControlEventValue(event));
      previewedRef.current = true;
      onInputValue(name, next);
    };
    const observer = new MutationObserver(() => {
      if (!control.hasAttribute("open")) restorePreview();
    });

    control.addEventListener("change", handleChange);
    control.addEventListener("optionhover", handlePreview);
    control.addEventListener("optionfocus", handlePreview);
    observer.observe(control, {
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => {
      control.removeEventListener("change", handleChange);
      control.removeEventListener("optionhover", handlePreview);
      control.removeEventListener("optionfocus", handlePreview);
      observer.disconnect();
    };
  }, [name, numeric, onCommit, onInputValue]);

  return (
    <PropertyRow label={def.label || name}>
      <fig-select
        ref={controlRef}
        slot="input"
        default={def.defaultValue == null ? undefined : String(def.defaultValue)}
        options={formatSelectOptions(options)}
        full=""
        dangerouslySetInnerHTML={opaqueContent}
      />
    </PropertyRow>
  );
}

function ColorProperty({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const current =
    value || def.defaultValue || { r: 0, g: 0, b: 0, a: 1 };
  const readValue = useCallback((event, control) => {
    const parsed = readColorControlValue(
      event,
      control.getAttribute("value") || "",
    );
    if (!parsed) return null;
    const color = hexToColor(parsed.color);
    if (parsed.alpha != null) color.a = parsed.alpha;
    return color;
  }, []);
  const interactingRef = useControlEvents(
    controlRef,
    readValue,
    (next) => onInputValue(name, next),
    (next) => onCommit(name, next),
  );
  useSyncedAttribute(
    controlRef,
    "value",
    colorToHex(current),
    interactingRef,
  );

  return (
    <PropertyRow label={def.label || name}>
      <fig-input-color
        ref={controlRef}
        slot="input"
        default={colorToHex(
          def.defaultValue || { r: 0, g: 0, b: 0, a: 1 },
        )}
        text="true"
        alpha="true"
        full=""
        dangerouslySetInnerHTML={opaqueContent}
      />
    </PropertyRow>
  );
}

function GradientProperty({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const stops = value?.stops || def.defaultValue?.stops || [];
  const serialized = serializeGradientValue(stops);
  const readValue = useCallback(readGradientControlValue, []);
  const interactingRef = useControlEvents(
    controlRef,
    readValue,
    (next) => onInputValue(name, next),
    (next) => onCommit(name, next),
  );
  useSyncedAttribute(controlRef, "value", serialized, interactingRef);

  return (
    <PropertyRow label={def.label || name}>
      <fig-input-gradient
        ref={controlRef}
        slot="input"
        default={serializeGradientValue(def.defaultValue?.stops || [])}
        edit="picker"
        full=""
        dangerouslySetInnerHTML={opaqueContent}
      />
    </PropertyRow>
  );
}

function positionUnits(def) {
  return def.positionUnit || def.unit || "%";
}

function radiusUnits(def) {
  return def.radiusUnit || def.positionUnit || def.unit || "%";
}

function usePointEvents(
  ref,
  name,
  currentRef,
  onInputValue,
  onCommit,
  merge,
) {
  const readValue = useCallback(
    (event) => merge(readPointControlValue(event, currentRef.current)),
    [currentRef, merge],
  );
  return useControlEvents(
    ref,
    readValue,
    (next) => onInputValue(name, next),
    (next) => onCommit(name, next),
  );
}

function PointProperty({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const controlRef = useRef(null);
  const current = value || def.defaultValue || { x: 50, y: 50 };
  const currentRef = useRef(current);
  currentRef.current = current;
  const merge = useCallback((point) => point, []);
  const interactingRef = usePointEvents(
    controlRef,
    name,
    currentRef,
    onInputValue,
    onCommit,
    merge,
  );
  useSyncedAttribute(controlRef, "x", current.x ?? 50, interactingRef);
  useSyncedAttribute(controlRef, "y", current.y ?? 50, interactingRef);

  return (
    <PropertyRow label={def.label || name}>
      <fig-input-point
        ref={controlRef}
        slot="input"
        default-x={def.defaultValue?.x ?? 50}
        default-y={def.defaultValue?.y ?? 50}
        units={positionUnits(def)}
        full=""
        dangerouslySetInnerHTML={opaqueContent}
      />
    </PropertyRow>
  );
}

function PointRadiusProperty({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const pointRef = useRef(null);
  const radiusRef = useRef(null);
  const current =
    value || def.defaultValue || { x: 50, y: 50, radius: 0 };
  const currentRef = useRef(current);
  currentRef.current = current;
  const mergePoint = useCallback(
    (point) => ({ ...currentRef.current, ...point }),
    [],
  );
  const pointInteractingRef = usePointEvents(
    pointRef,
    name,
    currentRef,
    onInputValue,
    onCommit,
    mergePoint,
  );
  const readRadius = useCallback((event) => {
    const radius = readNumber(event);
    return Number.isFinite(radius)
      ? { ...currentRef.current, radius }
      : null;
  }, []);
  const radiusInteractingRef = useControlEvents(
    radiusRef,
    readRadius,
    (next) => onInputValue(name, next),
    (next) => onCommit(name, next),
  );
  useSyncedAttribute(pointRef, "x", current.x ?? 50, pointInteractingRef);
  useSyncedAttribute(pointRef, "y", current.y ?? 50, pointInteractingRef);
  useSyncedAttribute(
    radiusRef,
    "value",
    current.radius ?? 0,
    radiusInteractingRef,
  );

  const label = def.label || name;
  return (
    <PropertyRow label={label}>
      <fig-stack slot="input" direction="vertical" full="">
        <fig-input-point
          ref={pointRef}
          aria-label={`${label} position`}
          default-x={def.defaultValue?.x ?? 50}
          default-y={def.defaultValue?.y ?? 50}
          units={positionUnits(def)}
          full=""
          dangerouslySetInnerHTML={opaqueContent}
        />
        <fig-input-number
          ref={radiusRef}
          aria-label={`${label} radius`}
          default={def.defaultValue?.radius ?? 0}
          min="0"
          step={def.radiusStep ?? def.step ?? 0.01}
          units={radiusUnits(def)}
          full=""
          dangerouslySetInnerHTML={opaqueContent}
        />
      </fig-stack>
    </PropertyRow>
  );
}

function PointRadiusAngleProperty({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const pointRef = useRef(null);
  const radiusRef = useRef(null);
  const angleRef = useRef(null);
  const current =
    value ||
    def.defaultValue || { x: 50, y: 50, radius: 0, angle: 0 };
  const currentRef = useRef(current);
  currentRef.current = current;
  const mergePoint = useCallback(
    (point) => ({ ...currentRef.current, ...point }),
    [],
  );
  const pointInteractingRef = usePointEvents(
    pointRef,
    name,
    currentRef,
    onInputValue,
    onCommit,
    mergePoint,
  );
  const readRadius = useCallback((event) => {
    const radius = readNumber(event);
    return Number.isFinite(radius)
      ? { ...currentRef.current, radius }
      : null;
  }, []);
  const readAngle = useCallback((event) => {
    const angle = Number(readControlEventValue(event));
    return Number.isFinite(angle)
      ? { ...currentRef.current, angle }
      : null;
  }, []);
  const radiusInteractingRef = useControlEvents(
    radiusRef,
    readRadius,
    (next) => onInputValue(name, next),
    (next) => onCommit(name, next),
  );
  const angleInteractingRef = useControlEvents(
    angleRef,
    readAngle,
    (next) => onInputValue(name, next),
    (next) => onCommit(name, next),
  );
  useSyncedAttribute(pointRef, "x", current.x ?? 50, pointInteractingRef);
  useSyncedAttribute(pointRef, "y", current.y ?? 50, pointInteractingRef);
  useSyncedAttribute(
    radiusRef,
    "value",
    current.radius ?? 0,
    radiusInteractingRef,
  );
  useSyncedAttribute(
    angleRef,
    "value",
    current.angle ?? 0,
    angleInteractingRef,
  );

  const label = def.label || name;
  return (
    <PropertyRow label={label}>
      <fig-stack slot="input" direction="vertical" full="">
        <fig-input-point
          ref={pointRef}
          aria-label={`${label} position`}
          default-x={def.defaultValue?.x ?? 50}
          default-y={def.defaultValue?.y ?? 50}
          units={positionUnits(def)}
          full=""
          dangerouslySetInnerHTML={opaqueContent}
        />
        <fig-input-number
          ref={radiusRef}
          aria-label={`${label} radius`}
          default={def.defaultValue?.radius ?? 0}
          min="0"
          step={def.radiusStep ?? def.step ?? 0.01}
          units={radiusUnits(def)}
          full=""
          dangerouslySetInnerHTML={opaqueContent}
        />
        <fig-angle
          ref={angleRef}
          aria-label={`${label} angle`}
          default={def.defaultValue?.angle ?? 0}
          step={def.angleStep ?? 1}
          units={def.angleUnit || "deg"}
          dial="false"
          dangerouslySetInnerHTML={opaqueContent}
        />
      </fig-stack>
    </PropertyRow>
  );
}

function PointPointProperty({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const startRef = useRef(null);
  const endRef = useRef(null);
  const current =
    value || def.defaultValue || { x: 25, y: 25, x2: 75, y2: 75 };
  const currentRef = useRef(current);
  currentRef.current = current;
  const mergeStart = useCallback(
    (point) => ({ ...currentRef.current, ...point }),
    [],
  );
  const mergeEnd = useCallback(
    (point) => ({
      ...currentRef.current,
      x2: point.x,
      y2: point.y,
    }),
    [],
  );
  const startInteractingRef = usePointEvents(
    startRef,
    name,
    currentRef,
    onInputValue,
    onCommit,
    mergeStart,
  );
  const endInteractingRef = usePointEvents(
    endRef,
    name,
    currentRef,
    onInputValue,
    onCommit,
    mergeEnd,
  );
  useSyncedAttribute(startRef, "x", current.x ?? 25, startInteractingRef);
  useSyncedAttribute(startRef, "y", current.y ?? 25, startInteractingRef);
  useSyncedAttribute(endRef, "x", current.x2 ?? 75, endInteractingRef);
  useSyncedAttribute(endRef, "y", current.y2 ?? 75, endInteractingRef);

  const label = def.label || name;
  const units = positionUnits(def);
  return (
    <PropertyRow label={label}>
      <fig-stack slot="input" direction="vertical" full="">
        <fig-input-point
          ref={startRef}
          aria-label={`${label} start`}
          default-x={def.defaultValue?.x ?? 25}
          default-y={def.defaultValue?.y ?? 25}
          units={units}
          full=""
          dangerouslySetInnerHTML={opaqueContent}
        />
        <fig-input-point
          ref={endRef}
          aria-label={`${label} end`}
          default-x={def.defaultValue?.x2 ?? 75}
          default-y={def.defaultValue?.y2 ?? 75}
          units={units}
          full=""
          dangerouslySetInnerHTML={opaqueContent}
        />
      </fig-stack>
    </PropertyRow>
  );
}

function ColorPointProperty({
  name,
  def,
  value,
  onInputValue,
  onCommit,
}) {
  const pointRef = useRef(null);
  const colorRef = useRef(null);
  const current =
    value ||
    def.defaultValue || {
      x: 50,
      y: 50,
      color: { r: 1, g: 1, b: 1, a: 1 },
    };
  const currentRef = useRef(current);
  currentRef.current = current;
  const mergePoint = useCallback(
    (point) => ({ ...currentRef.current, ...point }),
    [],
  );
  const pointInteractingRef = usePointEvents(
    pointRef,
    name,
    currentRef,
    onInputValue,
    onCommit,
    mergePoint,
  );
  const readColor = useCallback((event, control) => {
    const parsed = readColorControlValue(
      event,
      control.getAttribute("value") || "",
    );
    if (!parsed) return null;
    const color = hexToColor(parsed.color);
    if (parsed.alpha != null) color.a = parsed.alpha;
    return { ...currentRef.current, color };
  }, []);
  const colorInteractingRef = useControlEvents(
    colorRef,
    readColor,
    (next) => onInputValue(name, next),
    (next) => onCommit(name, next),
  );
  useSyncedAttribute(pointRef, "x", current.x ?? 50, pointInteractingRef);
  useSyncedAttribute(pointRef, "y", current.y ?? 50, pointInteractingRef);
  useSyncedAttribute(
    colorRef,
    "value",
    colorToHex(current.color),
    colorInteractingRef,
  );

  const label = def.label || name;
  return (
    <PropertyRow label={label}>
      <fig-stack slot="input" direction="vertical" full="">
        <fig-input-point
          ref={pointRef}
          aria-label={`${label} position`}
          default-x={def.defaultValue?.x ?? 50}
          default-y={def.defaultValue?.y ?? 50}
          units={positionUnits(def)}
          full=""
          dangerouslySetInnerHTML={opaqueContent}
        />
        <fig-input-color
          ref={colorRef}
          aria-label={`${label} color`}
          default={colorToHex(
            def.defaultValue?.color || { r: 1, g: 1, b: 1, a: 1 },
          )}
          text="true"
          alpha="true"
          full=""
          dangerouslySetInnerHTML={opaqueContent}
        />
      </fig-stack>
    </PropertyRow>
  );
}

function UnknownProperty({ name, def }) {
  return (
    <PropertyRow label={def.label || name}>
      <code slot="input" className="unknown-type">
        {def.type || "unknown"}
      </code>
    </PropertyRow>
  );
}

export default function Controls({ props, values, onChange, onInput }) {
  const coalescedChange = useCoalescedPropertyCallback(onChange);
  const coalescedInput = useCoalescedPropertyCallback(onInput);
  const entries = Object.entries(props || {})
    .filter(([, def]) => showsInPropertyPanel(def))
    .sort(([, a], [, b]) => {
      const aCanvas = CANVAS_PROP_TYPES.has(a?.type) ? 1 : 0;
      const bCanvas = CANVAS_PROP_TYPES.has(b?.type) ? 1 : 0;
      return aCanvas - bCanvas;
    });

  if (entries.length === 0) {
    return (
      <fig-property>
        <p slot="input" className="empty-state">
          This shader has no exposed properties.
        </p>
      </fig-property>
    );
  }

  return entries.map(([name, def]) => {
    const shared = {
      key: `${name}:${def.type}:${def.control || ""}:${JSON.stringify(
        def.options || [],
      )}`,
      name,
      def,
      value: values[name],
      onInputValue: coalescedInput,
      onCommit: coalescedChange,
    };
    if (def.type === "number" && def.control === "slider") {
      return <SliderProperty {...shared} />;
    }
    if (def.control === "select") {
      return <SelectProperty {...shared} />;
    }
    if (def.type === "boolean") {
      return <SwitchProperty {...shared} />;
    }
    if (def.type === "number") {
      return <NumberProperty {...shared} />;
    }
    if (def.type === "string") {
      return <TextProperty {...shared} />;
    }
    if (def.type === "color") {
      return <ColorProperty {...shared} />;
    }
    if (def.type === "gradient") {
      return <GradientProperty {...shared} />;
    }
    if (def.type === "point") {
      return <PointProperty {...shared} />;
    }
    if (def.type === "point-radius") {
      return <PointRadiusProperty {...shared} />;
    }
    if (def.type === "point-angle-radius") {
      return <PointRadiusAngleProperty {...shared} />;
    }
    if (def.type === "point-point-line") {
      return <PointPointProperty {...shared} />;
    }
    if (def.type === "color-point") {
      return <ColorPointProperty {...shared} />;
    }
    return <UnknownProperty key={shared.key} name={name} def={def} />;
  });
}
