import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  hexToColor,
  showsInPropertyPanel,
} from "../lib/canvasControls.js";

function toHexByte(value) {
  return Math.max(0, Math.min(255, Math.round((value ?? 0) * 255)))
    .toString(16)
    .padStart(2, "0");
}

function colorToHex(color) {
  return `#${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(
    color.b
  )}${toHexByte(color.a ?? 1)}`;
}

function readNumber(event) {
  const value = event.target.value ?? event.detail;
  return Number(value);
}

function readPropskitSliderNumber(event) {
  const detail = event.nativeEvent?.detail ?? event.detail;
  const value =
    detail && typeof detail === "object" && "value" in detail
      ? detail.value
      : detail;
  return Number(value);
}

// FigUI3 controls generate their implementation in light DOM. Marking that
// content as opaque prevents React from deleting it on subsequent renders.
const opaqueContent = { __html: "" };
const PROPERTY_INPUT_INTERVAL_MS = 24;

function useCoalescedPropertyCallback(callback) {
  const callbackRef = useRef(callback);
  const pendingRef = useRef(new Map());

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(
    () => () => {
      pendingRef.current.forEach(({ timer }) => window.clearTimeout(timer));
      pendingRef.current.clear();
    },
    []
  );

  return useCallback((name, value) => {
    const pending = pendingRef.current.get(name);
    if (pending) {
      pending.value = value;
      pending.hasTrailingValue = true;
      return;
    }

    callbackRef.current(name, value);
    const timer = window.setTimeout(() => {
      const latest = pendingRef.current.get(name);
      pendingRef.current.delete(name);
      if (latest?.hasTrailingValue) {
        callbackRef.current(name, latest.value);
      }
    }, PROPERTY_INPUT_INTERVAL_MS);
    pendingRef.current.set(name, {
      timer,
      value,
      hasTrailingValue: false,
    });
  }, []);
}

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
      min={def.min ?? 0}
      max={def.max ?? 1}
      step={def.step ?? 0.01}
      units={def.unit || ""}
      text="true"
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

// Match figui3 /propskit/lab: options attr is comma-separated, newline, or JSON
// array of strings / { value, label } objects (same as fig-options / fig-select).
function formatSelectOptions(options) {
  return JSON.stringify(
    options.map((option) => ({
      value: String(option.value),
      label: String(option.label ?? option.value),
    }))
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

function ColorControl({ def, value, onChange }) {
  const current =
    value || def.defaultValue || { r: 0, g: 0, b: 0, a: 1 };
  return (
    <fig-input-color
      value={colorToHex(current)}
      text="true"
      alpha="true"
      onInput={(event) => {
        const input =
          event.target.closest?.("fig-input-color") || event.currentTarget;
        const rgba = input.rgba;
        if (!rgba) return;
        onChange({
          r: rgba.r / 255,
          g: rgba.g / 255,
          b: rgba.b / 255,
          a: rgba.a,
        });
      }}
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

function VectorControl({ keys, def, value, onChange }) {
  const current = value || def.defaultValue || {};
  return (
    <div className="vector-control">
      {keys.map((key) => (
        <fig-input-number
          key={key}
          name={key}
          value={current[key] ?? 0}
          step={key === "angle" ? 1 : 0.1}
          units={key === "angle" ? "°" : ""}
          onInput={(event) =>
            onChange({ ...current, [key]: readNumber(event) })
          }
          dangerouslySetInnerHTML={{
            __html: `<span slot="prepend">${key[0].toUpperCase()}</span>`,
          }}
        />
      ))}
    </div>
  );
}

function GradientControl({ def, value, onChange }) {
  const gradientRef = useRef(null);
  const stops = value?.stops || def.defaultValue?.stops || [];
  const serialized = JSON.stringify({
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

  useEffect(() => {
    const control = gradientRef.current;
    if (!control) return;
    const handleValue = (event) => {
      const detail =
        typeof event.detail === "string"
          ? JSON.parse(event.detail)
          : event.detail;
      const nextStops = detail?.gradient?.stops;
      if (!Array.isArray(nextStops)) return;
      onChange({
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
      });
    };
    control.addEventListener("input", handleValue);
    control.addEventListener("change", handleValue);
    return () => {
      control.removeEventListener("input", handleValue);
      control.removeEventListener("change", handleValue);
    };
  }, [onChange]);

  return (
    <fig-input-gradient
      ref={gradientRef}
      value={serialized}
      size="large"
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

function Control({ def, value, onChange }) {
  if (def.type === "number") {
    return <NumberControl def={def} value={value} onChange={onChange} />;
  }
  if (def.type === "point") {
    return (
      <VectorControl
        keys={["x", "y"]}
        def={def}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (def.type === "point-radius") {
    return (
      <VectorControl
        keys={["x", "y", "radius"]}
        def={def}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (def.type === "point-point-line") {
    return (
      <VectorControl
        keys={["x", "y", "x2", "y2"]}
        def={def}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (def.type === "point-angle-radius") {
    return (
      <VectorControl
        keys={["x", "y", "radius", "angle"]}
        def={def}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (def.type === "color-point") {
    const current = value ||
      def.defaultValue || {
        x: 0,
        y: 0,
        color: { r: 1, g: 1, b: 1, a: 1 },
      };
    return (
      <div className="compound-control">
        <VectorControl
          keys={["x", "y"]}
          def={def}
          value={current}
          onChange={onChange}
        />
        <ColorControl
          def={{ defaultValue: current.color }}
          value={current.color}
          onChange={(color) => onChange({ ...current, color })}
        />
      </div>
    );
  }
  if (def.type === "gradient") {
    return (
      <GradientControl def={def} value={value} onChange={onChange} />
    );
  }
  return <code className="unknown-type">{def.type || "unknown"}</code>;
}

export default function Controls({ props, values, onChange, onInput }) {
  const coalescedChange = useCoalescedPropertyCallback(onChange);
  const coalescedInput = useCoalescedPropertyCallback(onInput);
  const entries = Object.entries(props || {}).filter(([, def]) =>
    showsInPropertyPanel(def)
  );
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
