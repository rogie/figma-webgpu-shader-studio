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

// FigUI3 controls generate their implementation in light DOM. Marking that
// content as opaque prevents React from deleting it on subsequent renders.
const opaqueContent = { __html: "" };

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function NumberControl({ def, value, onChange }) {
  const current = value ?? def.defaultValue ?? 0;
  if (def.control === "slider") {
    return (
      <fig-slider
        value={current}
        min={def.min ?? 0}
        max={def.max ?? 1}
        step={def.step ?? 0.01}
        units={def.unit || ""}
        text="true"
        onInput={(event) => onChange(readNumber(event))}
        dangerouslySetInnerHTML={opaqueContent}
      />
    );
  }
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

function SelectControl({ def, value, onChange }) {
  const options = def.options || [];
  const numeric = options.length > 0 && typeof options[0].value === "number";
  const optionMarkup = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}">${escapeHtml(
          option.label ?? option.value
        )}</option>`
    )
    .join("");
  return (
    <fig-dropdown
      value={value ?? def.defaultValue}
      onInput={(event) =>
        onChange(numeric ? Number(event.target.value) : event.target.value)
      }
      dangerouslySetInnerHTML={{ __html: optionMarkup }}
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
  const stops = value?.stops || def.defaultValue?.stops || [];
  const update = (index, stop) =>
    onChange({
      stops: stops.map((item, itemIndex) =>
        itemIndex === index ? stop : item
      ),
    });
  return (
    <div className="gradient-control">
      {stops.map((stop, index) => (
        <div className="gradient-stop" key={`${index}-${stop.position}`}>
          <fig-input-number
            value={stop.position}
            min="0"
            max="1"
            step="0.01"
            transform="100"
            units="%"
            onInput={(event) =>
              update(index, { ...stop, position: readNumber(event) })
            }
            dangerouslySetInnerHTML={opaqueContent}
          />
          <ColorControl
            def={{ defaultValue: stop.color }}
            value={stop.color}
            onChange={(color) => update(index, { ...stop, color })}
          />
          <fig-button
            variant="ghost"
            icon="true"
            disabled={stops.length <= 2}
            onClick={() =>
              onChange({
                stops: stops.filter((_, itemIndex) => itemIndex !== index),
              })
            }
          >
            −
          </fig-button>
        </div>
      ))}
      {stops.length < 8 && (
        <fig-button
          variant="secondary"
          onClick={() =>
            onChange({
              stops: [
                ...stops,
                {
                  position: 1,
                  color: { r: 1, g: 1, b: 1, a: 1 },
                },
              ],
            })
          }
        >
          Add stop
        </fig-button>
      )}
    </div>
  );
}

function Control({ def, value, onChange }) {
  if (def.control === "select") {
    return <SelectControl def={def} value={value} onChange={onChange} />;
  }
  if (def.type === "number") {
    return <NumberControl def={def} value={value} onChange={onChange} />;
  }
  if (def.type === "boolean") {
    return (
      <fig-switch
        checked={value ?? def.defaultValue ?? false}
        onInput={(event) => onChange(event.target.checked)}
        dangerouslySetInnerHTML={opaqueContent}
      />
    );
  }
  if (def.type === "string") {
    return (
      <fig-input-text
        value={value ?? def.defaultValue ?? ""}
        onInput={(event) => onChange(event.target.value)}
        dangerouslySetInnerHTML={opaqueContent}
      />
    );
  }
  if (def.type === "color") {
    return <ColorControl def={def} value={value} onChange={onChange} />;
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

export default function Controls({ props, values, onChange }) {
  const entries = Object.entries(props || {});
  if (entries.length === 0) {
    return (
      <fig-field>
        <p className="empty-state">This shader has no exposed properties.</p>
      </fig-field>
    );
  }
  return entries.map(([name, def]) => (
    <fig-field
      direction="horizontal"
      key={`${name}:${def.type}:${def.control || ""}:${JSON.stringify(
        def.options || []
      )}`}
    >
      <label>{def.label || name}</label>
      <Control
        def={def}
        value={values[name]}
        onChange={(value) => onChange(name, value)}
      />
    </fig-field>
  ));
}
