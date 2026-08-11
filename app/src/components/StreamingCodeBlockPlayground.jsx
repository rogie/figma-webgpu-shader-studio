import { useEffect, useState } from "react";
import StreamingCodeBlock from "./StreamingCodeBlock.jsx";
import "../chat.css";

const MOCK_SOURCE = `import { defineProperties, makeShader } from "figma:shaders";

const properties = defineProperties({
  speed: {
    type: "number",
    label: "Speed",
    defaultValue: 0.35,
    min: 0,
    max: 2,
  },
  color: {
    type: "color",
    label: "Glow color",
    defaultValue: "#7C5CFF",
  },
});

const fragment = /* wgsl */ \`
struct Frame {
  time: f32,
  deltaTime: f32,
  frame: u32,
  _padding: u32,
}

@group(0) @binding(0) var<uniform> frame: Frame;

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let centered = uv * 2.0 - 1.0;
  let radius = length(centered);
  let pulse = 0.5 + 0.5 * sin(frame.time * 2.0);
  let glow = exp(-6.0 * abs(radius - 0.35 - pulse * 0.08));
  return vec4f(vec3f(glow), 1.0);
}
\`;

export default makeShader({
  properties,
  fragment,
});`;

function StateExample({ title, description, children }) {
  return (
    <article className="streaming-code-playground-example">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </article>
  );
}

export default function StreamingCodeBlockPlayground() {
  const [streamLength, setStreamLength] = useState(360);
  const [playing, setPlaying] = useState(true);
  const streamComplete = streamLength >= MOCK_SOURCE.length;

  useEffect(() => {
    if (!playing || streamComplete) return undefined;
    const timer = window.setInterval(() => {
      setStreamLength((current) => Math.min(current + 8, MOCK_SOURCE.length));
    }, 32);
    return () => window.clearInterval(timer);
  }, [playing, streamComplete]);

  useEffect(() => {
    if (streamComplete) setPlaying(false);
  }, [streamComplete]);

  const restart = () => {
    setStreamLength(1);
    setPlaying(true);
  };

  return (
    <main className="shader-viewer streaming-code-playground">
      <div className="streaming-code-playground-heading">
        <div>
          <h1>Streaming code block</h1>
          <p>Mock states for designing the inline AI code response.</p>
        </div>
        <hstack>
          <fig-button type="button" variant="secondary" onClick={restart}>
            Restart stream
          </fig-button>
          <fig-button
            type="button"
            variant="secondary"
            disabled={streamComplete ? "" : undefined}
            onClick={() => setPlaying((current) => !current)}
          >
            {playing ? "Pause" : "Resume"}
          </fig-button>
        </hstack>
      </div>

      <section className="shader-viewer-chat streaming-code-playground-panel">
        <div className="code-chat">
          <div className="streaming-code-playground-grid">
            <StateExample
              title="Live stream · Forced open"
              description="Non-collapsible, auto-scrolling, and receiving code."
            >
              <StreamingCodeBlock
                source={MOCK_SOURCE.slice(0, streamLength)}
                pending
                applied={false}
              />
            </StateExample>

            <StateExample
              title="Generated"
              description="Complete code that has not been applied."
            >
              <StreamingCodeBlock
                source={MOCK_SOURCE}
                pending={false}
                applied={false}
                defaultExpanded
              />
            </StateExample>

            <StateExample
              title="Applied"
              description="Complete code successfully applied to the editor."
            >
              <StreamingCodeBlock
                source={MOCK_SOURCE}
                pending={false}
                applied
                defaultExpanded
              />
            </StateExample>

            <StateExample
              title="Collapsed"
              description="The compact resting state retained in chat history."
            >
              <StreamingCodeBlock
                source={MOCK_SOURCE}
                pending={false}
                applied
                defaultExpanded={false}
              />
            </StateExample>
          </div>
        </div>
      </section>
    </main>
  );
}
