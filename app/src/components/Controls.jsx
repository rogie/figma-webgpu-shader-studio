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
    } else if (name === "value" && control.localName === "fig-input-number" && Number(control.value) !== Number(value)) {
      // User edits update the live number without reflecting its value attribute.
      // Reapply resets even when the attribute already contains the reset value.
      control.removeAttribute(name);
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

const companionIcons = {
  X: { text: "X position", content: { __html: '<fig-icon slot="prepend">X</fig-icon>' } },
  Y: { text: "Y position", content: { __html: '<fig-icon slot="prepend">Y</fig-icon>' } },
  A: {
    text: "Angle",
    content: {
      __html: '<fig-icon slot="prepend"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.59619 6.69714C9.79145 6.50188 10.108 6.50188 10.3032 6.69714L15.2534 11.6473C15.4482 11.8426 15.4485 12.1593 15.2534 12.3544L10.3032 17.3036C10.108 17.4989 9.79145 17.4989 9.59619 17.3036C9.40097 17.1083 9.40094 16.7918 9.59619 16.5966L11.771 14.4208C10.696 12.9906 10.6958 11.0091 11.771 9.57898L9.59619 7.40417C9.40093 7.20891 9.40093 6.89241 9.59619 6.69714ZM12.4878 10.2958C11.7904 11.3212 11.7906 12.6785 12.4878 13.704L14.1919 12.0009L12.4878 10.2958Z" fill="currentColor"/></svg></fig-icon>',
    },
  },
  R: {
    text: "Radius",
    content: {
      __html: '<fig-icon slot="prepend"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.65442 15.709C5.91682 15.76 6.09373 16.0085 6.06555 16.2744C6.02283 16.6771 6.00012 17.086 6.00012 17.5C6.00012 17.7726 5.7863 17.9997 5.51379 18H5.49231C5.22385 18 5.0007 17.788 5.00012 17.5195C5.00011 17.5131 5.00012 17.5065 5.00012 17.5C5.00012 17.0357 5.02514 16.5772 5.07434 16.126C5.10517 15.8436 5.37555 15.6551 5.65442 15.709ZM13.5001 10C13.776 10.0003 14.0001 10.224 14.0001 10.5C14.0001 10.776 13.776 10.9997 13.5001 11H11.7072L13.9806 13.2734C14.9342 12.4788 16.161 12.0003 17.4991 12C17.5155 12 17.5326 11.9998 17.549 12C17.8047 12.0028 18.0001 12.2197 18.0001 12.4756V12.5264C18.0001 12.794 17.7668 12.9998 17.4991 13C15.0144 13.0006 12.9992 15.0151 12.9991 17.5C12.9992 17.7672 12.7936 17.9997 12.5265 18H12.4747C12.219 17.9998 12.0028 17.8046 12.0001 17.5488C12 17.5327 11.9991 17.5162 11.9991 17.5C11.9991 16.1612 12.4782 14.9342 13.2736 13.9805L11.0001 11.707V13.5C11.0001 13.776 10.776 13.9997 10.5001 14C10.2241 13.9998 10.0001 13.776 10.0001 13.5V10.5C10.0001 10.224 10.2241 10.0002 10.5001 10H13.5001ZM6.0177 12.5518C6.13027 12.2913 6.44388 12.19 6.69446 12.3232C6.9305 12.4491 7.02592 12.7393 6.92102 12.9854C6.73214 13.4281 6.5705 13.8853 6.43762 14.3545C6.36473 14.6119 6.10746 14.7771 5.84485 14.7266C5.56624 14.6724 5.38454 14.3964 5.46106 14.123C5.61209 13.5837 5.79878 13.059 6.0177 12.5518ZM7.9718 9.41309C8.15561 9.19695 8.48395 9.19108 8.68469 9.3916C8.87373 9.58088 8.87957 9.88529 8.70715 10.0898C8.39459 10.4602 8.10533 10.8515 7.84094 11.2598C7.69564 11.484 7.40319 11.5665 7.16711 11.4414C6.9161 11.3081 6.82503 10.9921 6.97864 10.7529C7.28001 10.2839 7.61234 9.83634 7.9718 9.41309ZM10.7511 6.97949C10.9901 6.82629 11.3063 6.91721 11.4396 7.16797C11.5649 7.40399 11.4821 7.69736 11.2579 7.84277C10.8506 8.10656 10.4606 8.39536 10.0909 8.70703C9.88638 8.87954 9.58104 8.87363 9.39172 8.68457C9.19122 8.48384 9.19709 8.1555 9.41321 7.97168C9.83569 7.61263 10.2829 7.28054 10.7511 6.97949ZM13.9113 5.52246C14.183 5.44145 14.4616 5.61615 14.5206 5.89355C14.5762 6.1553 14.4153 6.41439 14.1593 6.49219C13.7574 6.61395 13.3645 6.75767 12.9825 6.9209C12.7365 7.02607 12.4463 6.93046 12.3204 6.69434C12.1873 6.44382 12.2885 6.13109 12.549 6.01855C12.9903 5.82807 13.4453 5.66182 13.9113 5.52246ZM17.5206 5C17.7883 5.00081 17.9999 5.22253 18.0001 5.49023V5.51172C18 5.78419 17.7726 5.99976 17.5001 6C17.017 6.00003 16.54 6.03119 16.0724 6.08984C15.807 6.12307 15.5547 5.95104 15.4991 5.68945C15.4402 5.41153 15.6246 5.1375 15.9064 5.10156C16.4281 5.03505 16.9606 5.00003 17.5001 5C17.5067 5 17.5141 4.99999 17.5206 5Z" fill="currentColor" fill-opacity="0.9"/></svg></fig-icon>',
    },
  },
};

function CompanionNumber({ field, icon, label, current, currentRef, defaultValue, units, step = 0.01, min, max, onInputValue, onCommit }) {
  const controlRef = useRef(null);
  const readValue = useCallback((event) => {
    const number = readNumber(event);
    if (!Number.isFinite(number)) return null;
    currentRef.current = { ...currentRef.current, [field]: number };
    return currentRef.current;
  }, [currentRef, field]);
  const interactingRef = useControlEvents(controlRef, readValue, onInputValue, onCommit);
  useSyncedAttribute(controlRef, "value", current[field], interactingRef);
  const adornment = companionIcons[icon];

  return (
    <fig-tooltip text={adornment.text}>
      <fig-input-number
        ref={controlRef}
        aria-label={label}
        default={defaultValue}
        units={units}
        step={step}
        min={min}
        max={max}
        steppers="false"
        full=""
        dangerouslySetInnerHTML={adornment.content}
      />
    </fig-tooltip>
  );
}

function PointFields({ slot, label, def, current, currentRef, end = false, onInputValue, onCommit }) {
  const xField = end ? "x2" : "x";
  const yField = end ? "y2" : "y";
  return (
    <fig-stack slot={slot} direction="horizontal" full="">
      <CompanionNumber field={xField} icon="X" label={`${label} X`} current={current} currentRef={currentRef}
        defaultValue={def.defaultValue?.[xField] ?? 50} units={positionUnits(def)}
        step={def.positionStep ?? def.step ?? 0.01} onInputValue={onInputValue} onCommit={onCommit} />
      <CompanionNumber field={yField} icon="Y" label={`${label} Y`} current={current} currentRef={currentRef}
        defaultValue={def.defaultValue?.[yField] ?? 50} units={positionUnits(def)}
        step={def.positionStep ?? def.step ?? 0.01} onInputValue={onInputValue} onCommit={onCommit} />
    </fig-stack>
  );
}

function SpatialProperty({ name, def, value, onInputValue, onCommit }) {
  const current = value || def.defaultValue || { x: 50, y: 50, radius: 0, angle: 0, x2: 75, y2: 75 };
  const currentRef = useRef(current);
  currentRef.current = current;
  const label = def.label || name;
  const input = useCallback(next => onInputValue(name, next), [name, onInputValue]);
  const commit = useCallback(next => onCommit(name, next), [name, onCommit]);
  const hasRadius = def.type === "point-radius" || def.type === "point-angle-radius";
  const hasAngle = def.type === "point-angle-radius";
  const angleUnit = def.angleUnit || "deg";
  return (
    <>
      <PropertyRow label={label}>
        <PointFields slot="input" label={def.type === "point-point-line" ? `${label} start` : label}
          def={def} current={current} currentRef={currentRef} onInputValue={input} onCommit={commit} />
      </PropertyRow>
      {hasRadius && (
        <PropertyRow>
          <fig-stack slot="input" direction="horizontal" full="">
            {hasAngle && (
              <CompanionNumber field="angle" icon="A" label={`${label} angle`} current={current} currentRef={currentRef}
                defaultValue={def.defaultValue?.angle ?? 0} units={angleUnit === "deg" ? "°" : angleUnit}
                step={def.angleStep ?? 1} onInputValue={input} onCommit={commit} />
            )}
            <CompanionNumber field="radius" icon="R" label={`${label} radius`} current={current} currentRef={currentRef}
              defaultValue={def.defaultValue?.radius ?? 0} units={radiusUnits(def)} min={0} max={def.maxRadius}
              step={def.radiusStep ?? def.step ?? 0.01} onInputValue={input} onCommit={commit} />
          </fig-stack>
        </PropertyRow>
      )}
      {def.type === "point-point-line" && (
        <PropertyRow>
          <PointFields slot="input" label={`${label} end`} def={def} current={current} currentRef={currentRef} end
            onInputValue={input} onCommit={commit} />
        </PropertyRow>
      )}
    </>
  );
}

function ColorPointProperty({ name, def, value, onInputValue, onCommit }) {
  const colorRef = useRef(null);
  const current = value || def.defaultValue || { x: 50, y: 50, color: { r: 1, g: 1, b: 1, a: 1 } };
  const currentRef = useRef(current);
  currentRef.current = current;
  const input = useCallback(next => onInputValue(name, next), [name, onInputValue]);
  const commit = useCallback(next => onCommit(name, next), [name, onCommit]);
  const readColor = useCallback((event, control) => {
    const parsed = readColorControlValue(event, control.getAttribute("value") || "");
    if (!parsed) return null;
    const color = hexToColor(parsed.color);
    if (parsed.alpha != null) color.a = parsed.alpha;
    return { ...currentRef.current, color };
  }, []);
  const interactingRef = useControlEvents(colorRef, readColor, input, commit);
  useSyncedAttribute(colorRef, "value", colorToHex(current.color), interactingRef);
  const label = def.label || name;
  return (
    <>
      <PropertyRow label={label}>
        <PointFields slot="input" label={label} def={def} current={current} currentRef={currentRef} onInputValue={input} onCommit={commit} />
      </PropertyRow>
      <PropertyRow>
        <fig-input-color ref={colorRef} slot="input" aria-label={`${label} color`}
          default={colorToHex(def.defaultValue?.color || { r: 1, g: 1, b: 1, a: 1 })}
          text="true" alpha="true" full="" dangerouslySetInnerHTML={opaqueContent} />
      </PropertyRow>
    </>
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
      return <SpatialProperty {...shared} />;
    }
    if (def.type === "point-radius") {
      return <SpatialProperty {...shared} />;
    }
    if (def.type === "point-angle-radius") {
      return <SpatialProperty {...shared} />;
    }
    if (def.type === "point-point-line") {
      return <SpatialProperty {...shared} />;
    }
    if (def.type === "color-point") {
      return <ColorPointProperty {...shared} />;
    }
    return <UnknownProperty key={shared.key} name={name} def={def} />;
  });
}
