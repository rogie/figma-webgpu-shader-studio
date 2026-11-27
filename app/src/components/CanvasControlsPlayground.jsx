import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CanvasControlsOverlay from "./CanvasControlsOverlay.jsx";
import Controls from "./Controls.jsx";
import "./CanvasControlsPlayground.css";

const EXAMPLES = [
  { type: "point", title: "Point", label: "Position", defaultValue: { x: 50, y: 50 } },
  { type: "point-radius", title: "Point + radius", label: "Area", defaultValue: { x: 50, y: 50, radius: 28 } },
  { type: "point-angle-radius", title: "Point + angle + radius", label: "Wind", defaultValue: { x: 50, y: 50, radius: 30, angle: -45 } },
  { type: "point-point-line", title: "Two-point line", label: "Line", defaultValue: { x: 25, y: 65, x2: 75, y2: 35 } },
  { type: "color-point", title: "Color point", label: "Color", defaultValue: { x: 50, y: 50, color: { r: 0.05, g: 0.6, b: 1, a: 1 } } },
];

function ControlExample({ example }) {
  const [value, setValue] = useState(example.defaultValue);
  const [size, setSize] = useState({ width: 360, height: 260 });
  const surfaceRef = useRef(null);
  const props = useMemo(() => ({
    example: {
      type: example.type,
      label: example.label,
      defaultValue: example.defaultValue,
      mode: "canvas_and_ui",
      positionUnit: "%",
      radiusUnit: "%",
      minRadius: 0,
      maxRadius: 100,
    },
  }), [example]);
  const updateValue = useCallback((_name, next) => setValue(next), []);

  useEffect(() => {
    const surface = surfaceRef.current;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="canvas-control-example" aria-label={example.title}>
      <fig-header borderless="">
        <h2>{example.title}</h2>
        <fig-button variant="ghost" onClick={() => setValue(example.defaultValue)}>
          Reset
        </fig-button>
      </fig-header>
      <div className="canvas-control-example-body">
        <div ref={surfaceRef} className="canvas-control-example-surface" aria-label={`${example.title} canvas`}>
          <CanvasControlsOverlay
            props={props}
            values={{ example: value }}
            canvasSize={size}
            surfaceSize={size}
            onInputValue={updateValue}
            onCommit={updateValue}
          />
        </div>
        <aside className="canvas-control-example-properties" aria-label={`${example.title} properties`}>
          <fig-header borderless=""><h3>Properties</h3></fig-header>
          <div className="properties-pane">
            <Controls props={props} values={{ example: value }} onInput={updateValue} onChange={updateValue} />
          </div>
        </aside>
      </div>
      <details className="canvas-control-example-value">
        <summary>Current value · {example.type}</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </section>
  );
}

export default function CanvasControlsPlayground() {
  return (
    <main className="canvas-controls-playground">
      <header className="canvas-controls-playground-heading">
        <h1>Canvas controls</h1>
        <p>All five canvas controls with their companion property inputs. Drag a handle or edit a field to see both update.</p>
      </header>
      <div className="canvas-controls-playground-grid">
        {EXAMPLES.map(example => <ControlExample key={example.type} example={example} />)}
      </div>
    </main>
  );
}
