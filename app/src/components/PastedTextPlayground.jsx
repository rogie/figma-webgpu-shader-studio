import { useCallback, useEffect, useRef, useState } from "react";
import { analyzePaste, splitComposerPaste } from "../lib/pastedText.js";
import { LANGUAGE_PACKAGES } from "../lib/pastedHighlight.js";
import { ANON_YOU_LABEL } from "../lib/shaderLibrary.js";
import PastedText from "./PastedText.jsx";
import SendIcon from "./SendIcon.jsx";
import UserAvatar from "./UserAvatar.jsx";
import "../chat.css";

const SAMPLE = `export type AsciifyCharset = "ascii" | "blocks" | "binary";

export interface AsciifyOptions {
  /** Radius of the ascii lens around the cursor, relative to the screen height. */
  radius?: number;
  /** Size of one glyph pixel in CSS pixels. Characters are 5x5 glyph pixels. */
  scale?: number;
  /** Built-in character ramp: real ascii glyphs, shade blocks, or binary digits. */
  charset?: AsciifyCharset;
}

const CHARSETS: Record<AsciifyCharset, number[]> = {
  ascii: [0, 128, 131200, 14336, 459200, 469440, 4357252],
  blocks: [0, 328000, 22041621, 22369621, 11512810, 33554431],
  binary: [0, 4591758, 15324974],
};

const MAX_GLYPHS = 16;

const FRAG = \`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uGlyphPx;

float hash21 (vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main () {
  vec2 frag = vUv * uResolution;
  vec2 cell = floor(frag / uGlyphPx);
  vec4 pixel = texture(uContent, vUv);
  float lum = dot(pixel.rgb, vec3(0.299, 0.587, 0.114));
  float on = step(hash21(cell), lum);
  outColor = vec4(pixel.rgb * on, pixel.a);
}\`;

export function supportsHtmlInCanvas(): boolean {
  if (typeof document === "undefined") return false;
  const probe = document.createElement("canvas");
  const ctx = probe.getContext("2d");
  return Boolean(ctx && typeof ctx.drawElementImage === "function");
}`;

const MIXED_SAMPLE = `Hey, here's the clamp helper we talked about in standup.

Drop it next to the other math utilities:

\`\`\`ts
export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}
\`\`\`

Let me know if the parameter order feels backwards to you.`;

const MARKDOWN_SAMPLE = `# Shader review notes

Two things to fix before we ship the ascii lens:

- Tighten the default lens radius
- Soften the chromatic fringe at the edge

\`\`\`ts
const radius = 0.4;
\`\`\`

See the [product brief](https://example.com/brief) for the original intent.`;

function StateExample({ title, description, badge, children }) {
  return (
    <article className="streaming-code-playground-example">
      <header>
        <h2>
          {title}
          {badge && <span className="pasted-text-playground-badge">{badge}</span>}
        </h2>
        <p>{description}</p>
      </header>
      {children}
    </article>
  );
}

function UserMessage({ message }) {
  return (
    <fig-chat-message from="user">
      {message.content ? (
        <div className="chat-prose chat-prose-plain">{message.content}</div>
      ) : null}
      {(message.pastes || []).map((paste, index) => (
        <PastedText
          key={`${paste.language}:${index}`}
          text={paste.text}
          language={paste.language}
          label={paste.label}
          nested={paste.nested}
        />
      ))}
      <UserAvatar name={ANON_YOU_LABEL} tooltip={ANON_YOU_LABEL} />
    </fig-chat-message>
  );
}

export default function PastedTextPlayground() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const listRef = useRef(null);

  const best = analysis?.best || null;
  const canSend = Boolean(draft.trim());

  const send = useCallback(async () => {
    const typed = draft.trim();
    if (!typed) return;

    const split = await splitComposerPaste({ text: typed });
    if (split.analysis) setAnalysis(split.analysis);
    if (!split.content && split.pastes.length === 0) return;

    const pastes = split.pastes;
    const pasteLabel = pastes[0]?.title || pastes[0]?.label;
    setMessages((current) => [
      ...current,
      { role: "user", content: split.content, pastes },
      {
        role: "agent",
        content: pastes.length
          ? split.content
            ? `I'll use the ${pasteLabel || "pasted code"} as a reference along with your note.`
            : `I'll treat this ${pasteLabel || "pasted code"} as a reference.`
          : "Got it — no code was split out of that message.",
      },
    ]);
    setDraft("");
  }, [draft]);

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => {
    setDraft(MIXED_SAMPLE);
    analyzePaste({ text: MIXED_SAMPLE }).then(setAnalysis);
  }, []);

  return (
    <main className="shader-viewer streaming-code-playground pasted-text-playground">
      <div className="streaming-code-playground-heading">
        <div>
          <h1>Pasted text</h1>
          <p>
            Paste into the composer like chat. Code is pulled out as a
            PastedText attachment; remaining prose stays the user message.
          </p>
        </div>
        <hstack>
          <fig-button
            type="button"
            variant="secondary"
            onClick={() => setDraft(SAMPLE)}
          >
            TypeScript + GLSL
          </fig-button>
          <fig-button
            type="button"
            variant="secondary"
            onClick={() => setDraft(MIXED_SAMPLE)}
          >
            Prose + fence
          </fig-button>
          <fig-button
            type="button"
            variant="secondary"
            onClick={() => setDraft(MARKDOWN_SAMPLE)}
          >
            Markdown
          </fig-button>
        </hstack>
      </div>

      <section className="shader-viewer-chat pasted-text-playground-chat">
        <div className="code-chat">
          <div className="chat-messages" ref={listRef}>
            {messages.length === 0 && (
              <div className="chat-empty">
                <p>
                  Paste code into the composer, or load a sample, then send.
                  User prose stays in the bubble; extracted code lands in
                  PastedText, like an image attachment.
                </p>
              </div>
            )}
            {messages.map((message, index) =>
              message.role === "user" ? (
                <UserMessage key={index} message={message} />
              ) : (
                <fig-chat-message key={index} from="agent">
                  <div className="chat-prose">{message.content}</div>
                </fig-chat-message>
              )
            )}
          </div>

          <div className="chat-footer">
            <div className="chat-composer">
              <fig-ai-prompt>
                <fig-input-text
                  class="chat-input"
                  multiline=""
                  value={draft}
                  placeholder="Ask for changes..."
                  aria-label="Ask for changes"
                  onInput={(event) => setDraft(event.target.value)}
                  onKeyDown={onKeyDown}
                  dangerouslySetInnerHTML={{ __html: "" }}
                />
                <fig-footer>
                  <fig-tooltip class="chat-attach-button" text="Attach media">
                    <fig-button
                      type="button"
                      variant="ghost"
                      icon="true"
                      aria-label="Attach media"
                    >
                      <fig-icon name="add" />
                    </fig-button>
                  </fig-tooltip>
                  <hstack>
                    <fig-tooltip text="Model: GPT-5.2">
                      <fig-select
                        class="chat-model-select"
                        variant="ghost"
                        label="Model"
                        position="top left"
                        value="gpt-5.2"
                      >
                        <fig-select-options>
                          <fig-separator label="OpenAI" />
                          <fig-select-option value="gpt-5.2">
                            GPT-5.2
                          </fig-select-option>
                        </fig-select-options>
                      </fig-select>
                    </fig-tooltip>
                    <fig-tooltip text="Send">
                      <fig-button
                        type="button"
                        variant="primary"
                        icon="true"
                        aria-label="Send"
                        disabled={canSend ? undefined : ""}
                        onClick={send}
                      >
                        <SendIcon />
                      </fig-button>
                    </fig-tooltip>
                  </hstack>
                </fig-footer>
              </fig-ai-prompt>
            </div>
          </div>
        </div>
      </section>

      {analysis && (
        <section className="shader-viewer-chat streaming-code-playground-panel">
          <div className="code-chat">
            <div className="pasted-text-playground-section">
              <h2>Detection debug</h2>
              <dl className="pasted-text-playground-facts">
                <div>
                  <dt>Chosen title</dt>
                  <dd>{best?.title || "none"}</dd>
                </div>
                <div>
                  <dt>Detection source</dt>
                  <dd>{best?.detectionSource || "none"}</dd>
                </div>
                <div>
                  <dt>Language package</dt>
                  <dd>
                    {LANGUAGE_PACKAGES[best?.language] || "none (plain text)"}
                  </dd>
                </div>
                <div>
                  <dt>Code coverage</dt>
                  <dd>{Math.round((analysis.coverage || 0) * 100)}% of lines</dd>
                </div>
              </dl>
            </div>
            <div className="streaming-code-playground-grid">
              {analysis.candidates.map((candidate) => (
                <StateExample
                  key={candidate.id}
                  title={candidate.title}
                  badge={candidate.id === best?.id ? "Auto-picked" : null}
                  description={candidate.reason}
                >
                  <PastedText
                    text={candidate.text}
                    language={candidate.language}
                    label={candidate.label}
                    nested={candidate.nested}
                  />
                </StateExample>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
