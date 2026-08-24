import { useEffect, useRef, useState } from "react";
import "../chat.css";

/**
 * Catalog of every toast surface in Shader Studio.
 * Keep this in sync with App.jsx / ChatPane notice call sites.
 *
 * `icon` and `dismiss` map to the native FigUI3 8.6.0 toast attributes, which
 * render a prepended full-size fig-icon and a separator + ghost close button.
 */
const TOAST_STATES = [
  {
    id: "notice-dark",
    title: "Notice · dark",
    description: "Default transient notice (copy, share, draft).",
    theme: "dark",
    live: "polite",
    duration: "3200",
    className: "notice-toast",
    examples: [
      "Code copied to clipboard",
      "Share link copied",
      "Embed code copied",
      "Private draft created",
      "Unsaved copy created",
      "Duplicate this shader to make changes.",
      "Save the shader before sharing",
      "Make the shader public before sharing",
      "Reverted last chat edit.",
      "Video attachments are only supported with Gemini. Cleared videos.",
      "Syntax error detected. Repairing code…",
      "Syntax error fixed automatically.",
    ],
    body: (message) => <span>{message}</span>,
  },
  {
    id: "notice-brand",
    title: "Notice · brand",
    description: "Positive / in-progress brand notices from chat apply.",
    theme: "brand",
    live: "polite",
    duration: "5000",
    className: "notice-toast",
    examples: [
      "Code updated from chat.",
      "Agent is still working on My Shader. Changes will only apply while that shader is open.",
    ],
    body: (message) => <span>{message}</span>,
  },
  {
    id: "notice-danger-confirm",
    title: "Notice · confirmation",
    description: "Destructive-action confirmation that auto-dismisses.",
    theme: "dark",
    live: "polite",
    duration: "3200",
    className: "notice-toast",
    examples: ["Shader deleted"],
    body: (message) => <span>{message}</span>,
  },
  {
    id: "notice-danger",
    title: "Notice · danger",
    description:
      "Sticky error notice. Uses the native dismiss attribute (separator + close).",
    theme: "danger",
    live: "assertive",
    duration: "0",
    className: "notice-toast",
    dismiss: true,
    examples: [
      "Publish failed",
      "Could not duplicate shader",
      "Could not copy code",
      "Automatic repair failed: Unexpected token",
      "Add your API key in Settings before chatting.",
    ],
    body: (message) => <span>{message}</span>,
  },
  {
    id: "notice-danger-warning-icon",
    title: "Notice · danger + warning icon",
    description:
      "8.6.0 option: same error toast with the new warning icon. Not adopted in the app yet.",
    theme: "danger",
    live: "assertive",
    duration: "0",
    className: "notice-toast",
    icon: "warning",
    dismiss: true,
    examples: [
      "Publish failed",
      "Automatic repair failed: Unexpected token",
      "Could not copy code",
    ],
    body: (message) => <span>{message}</span>,
  },
  {
    id: "video-exporting",
    title: "Video export · progress",
    description: "Sticky dark toast while a video encode is running.",
    theme: "dark",
    live: "polite",
    duration: "0",
    className: "video-export-toast",
    examples: ["Exporting video… 42%"],
    body: () => (
      <>
        <fig-spinner aria-label="Exporting video" />
        <span>Exporting video… 42%</span>
      </>
    ),
  },
  {
    id: "video-exported",
    title: "Video export · done",
    description: "Brand success toast shown after export completes.",
    theme: "brand",
    live: "polite",
    duration: "3200",
    className: "video-exported-toast",
    examples: ["Video exported"],
    body: () => <span>Video exported</span>,
  },
  {
    id: "publish-publishing",
    title: "Publish · in progress",
    description: "Sticky brand toast while publishing to community.",
    theme: "brand",
    live: "polite",
    duration: "0",
    className: "publish-toast",
    examples: ["Publishing…"],
    body: () => (
      <>
        <fig-spinner aria-label="Publishing" />
        <span>Publishing…</span>
      </>
    ),
  },
  {
    id: "publish-done",
    title: "Publish · done",
    description: "Brand toast with a community link after publish.",
    theme: "brand",
    live: "polite",
    duration: "4500",
    className: "publish-toast",
    examples: [
      "Published shader effect",
      "Published shader fill",
      "Published composition",
    ],
    body: (message) => <span className="publish-toast-body">{message}</span>,
  },
];

function StateExample({ title, description, children }) {
  return (
    <article className="streaming-code-playground-example toast-playground-example">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </article>
  );
}

function ToastPreview({ state, message, onFire }) {
  const toastRef = useRef(null);

  useEffect(() => {
    const toast = toastRef.current;
    if (!toast) return;
    // Keep the inline preview open without auto-dismiss.
    toast.setAttribute("duration", "0");
    toast.showToast?.();
  }, [state.id, message]);

  return (
    <div className="toast-playground-stage">
      <dialog
        is="fig-toast"
        ref={toastRef}
        class={`toast-playground-preview ${state.className || ""}`}
        theme={state.theme}
        live={state.live}
        duration="0"
        icon={state.icon}
        dismiss={state.dismiss ? "" : undefined}
      >
        {state.body(message)}
      </dialog>
      <div className="toast-playground-meta">
        <code>
          theme="{state.theme}"
          {state.icon ? ` · icon="${state.icon}"` : ""}
          {state.dismiss ? " · dismiss" : ""} · duration=
          {state.duration === "0" ? "0 (sticky)" : state.duration}
        </code>
        <fig-button type="button" variant="secondary" size="small" onClick={onFire}>
          Fire live
        </fig-button>
      </div>
    </div>
  );
}

export default function ToastPlayground() {
  const liveToastRef = useRef(null);
  const [liveState, setLiveState] = useState(null);
  const [exampleIndex, setExampleIndex] = useState(() =>
    Object.fromEntries(TOAST_STATES.map((state) => [state.id, 0]))
  );

  useEffect(() => {
    const toast = liveToastRef.current;
    if (!toast || !liveState) return;
    toast.showToast?.();
  }, [liveState]);

  const fire = (state, message) => {
    setLiveState({ ...state, message });
  };

  const cycleExample = (stateId, count) => {
    setExampleIndex((current) => ({
      ...current,
      [stateId]: ((current[stateId] || 0) + 1) % count,
    }));
  };

  return (
    <main className="shader-viewer streaming-code-playground toast-playground">
      <div className="streaming-code-playground-heading">
        <div>
          <h1>Toasts</h1>
          <p>
            Every toast surface used in Shader Studio. Inline previews stay
            open for design; Fire live shows the real bottom-of-viewport toast.
          </p>
        </div>
      </div>

      <section className="shader-viewer-chat streaming-code-playground-panel">
        <div className="code-chat">
          <div className="streaming-code-playground-grid toast-playground-grid">
            {TOAST_STATES.map((state) => {
              const index = exampleIndex[state.id] || 0;
              const message = state.examples[index] || state.examples[0];
              return (
                <StateExample
                  key={state.id}
                  title={state.title}
                  description={state.description}
                >
                  <ToastPreview
                    state={state}
                    message={message}
                    onFire={() => fire(state, message)}
                  />
                  {state.examples.length > 1 && (
                    <div className="toast-playground-examples">
                      <p className="toast-playground-example-label">
                        Copy ({index + 1}/{state.examples.length})
                      </p>
                      <p className="toast-playground-example-copy">{message}</p>
                      <fig-button
                        type="button"
                        variant="ghost"
                        size="small"
                        onClick={() =>
                          cycleExample(state.id, state.examples.length)
                        }
                      >
                        Next copy
                      </fig-button>
                    </div>
                  )}
                </StateExample>
              );
            })}
          </div>
        </div>
      </section>

      <dialog
        is="fig-toast"
        ref={liveToastRef}
        class={liveState?.className || "notice-toast"}
        theme={liveState?.theme || "dark"}
        live={liveState?.live || "polite"}
        duration={liveState?.duration || "3200"}
        offset="24"
        icon={liveState?.icon}
        dismiss={liveState?.dismiss ? "" : undefined}
        onClose={() => setLiveState(null)}
      >
        {liveState ? liveState.body(liveState.message) : null}
      </dialog>
    </main>
  );
}
