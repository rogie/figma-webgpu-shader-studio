import { useEffect, useRef, useState } from "react";
import Preview, {
  FillDropLoading,
  FillDropOverlay,
} from "./Preview.jsx";
import "../chat.css";

const STATES = [
  {
    id: "idle",
    title: "Idle",
    description: "The canvas is ready to accept a file.",
    result: "No overlay or status message.",
  },
  {
    id: "dragging",
    title: "Dragging over fill",
    description: "A file is inside the canvas drop target.",
    result: "Shows the production fill replacement overlay.",
    overlay: true,
  },
  {
    id: "empty",
    title: "Empty drop",
    description: "The drop contains no file.",
    result: "Returns to idle without feedback.",
  },
  {
    id: "loading",
    title: "Loading",
    description: "A supported file was accepted and is being decoded.",
    result: "Shows an in-preview spinner, then returns to idle.",
    loading: true,
  },
  {
    id: "image",
    title: "Image or SVG applied",
    description: "The image decodes and becomes the composition fill.",
    result: "Returns to idle with the updated canvas preview.",
  },
  {
    id: "video",
    title: "Video applied",
    description: "The video decodes and becomes the composition fill.",
    result: "Returns to idle with the video playing in the canvas.",
  },
  {
    id: "unsupported",
    title: "Unsupported file",
    description: "The dropped file is not an image, SVG, or video.",
    result: "Error: “Drop an image, SVG, or video to replace the fill.”",
  },
  {
    id: "oversized",
    title: "File too large",
    description: "The supported file exceeds the 25 MB media limit.",
    result: "Error: “Input media must be 25 MB or smaller.”",
  },
  {
    id: "failure",
    title: "Decode or load failure",
    description: "The browser cannot decode or load the accepted media.",
    result: "The runtime error surface displays the load failure.",
  },
  {
    id: "protected",
    title: "Protected preview",
    description: "The preview can display the dropped media without editing the graph.",
    result: "Canvas input updates; the composition fill remains unchanged.",
  },
];

function StateStage({ overlay = false, loading = false }) {
  return (
    <div
      className="shader-viewer-visualizer"
      style={{ position: "relative", width: "100%", height: "12rem" }}
    >
      <fig-preview
        class={`canvas-stage canvas-stage--light${overlay ? " is-dragging" : ""}`}
        full=""
        checkerboard=""
        aspect-ratio="auto"
      >
        {overlay ? <FillDropOverlay dropTarget="fill" /> : null}
        {loading ? <FillDropLoading /> : null}
      </fig-preview>
    </div>
  );
}

function StateExample({ state }) {
  return (
    <article className="streaming-code-playground-example">
      <header>
        <h2>{state.title}</h2>
        <p>{state.description}</p>
      </header>
      <StateStage overlay={state.overlay} loading={state.loading} />
      <p>{state.result}</p>
    </article>
  );
}

export default function FillUploadPlayground() {
  const canvasRef = useRef(null);
  const [result, setResult] = useState(
    "Drag an image, SVG, video, unsupported file, or empty selection onto the canvas."
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 960;
    canvas.height = 540;
    const context = canvas.getContext("2d");
    if (!context) return;
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#7c3aed");
    gradient.addColorStop(0.5, "#2563eb");
    gradient.addColorStop(1, "#06b6d4");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const onPickFile = (file) => {
    const size = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    setResult(`Accepted ${file.name || "unnamed file"} · ${file.type || "unknown type"} · ${size}`);
  };

  return (
    <main className="shader-viewer streaming-code-playground">
      <div className="streaming-code-playground-heading">
        <div>
          <h1>Fill upload drag and drop</h1>
          <p>
            Live interaction and every state in the composition fill upload
            flow.
          </p>
        </div>
      </div>

      <section className="shader-viewer-chat streaming-code-playground-panel">
        <div className="code-chat">
          <div className="streaming-code-playground-grid">
            <article className="streaming-code-playground-example">
              <header>
                <h2>Live drop target</h2>
                <p>Drop real files here to exercise production validation.</p>
              </header>
              <div
                className="shader-viewer-visualizer"
                style={{ position: "relative", width: "100%", height: "20rem" }}
              >
                <Preview
                  canvasRef={canvasRef}
                  props={[]}
                  values={{}}
                  onPickFile={onPickFile}
                  onDropError={setResult}
                  dropTarget="fill"
                  showCanvasControls={false}
                  canvasTheme="light"
                />
              </div>
              <p aria-live="polite">{result}</p>
            </article>

            {STATES.map((state) => (
              <StateExample key={state.id} state={state} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
