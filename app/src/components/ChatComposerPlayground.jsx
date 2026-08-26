import { useState } from "react";
import defaultInput from "../assets/default-input.png";
import "../chat.css";
import PlanReadyAction from "./PlanReadyAction.jsx";
import SendIcon from "./SendIcon.jsx";
import StopIcon from "./StopIcon.jsx";

const MOCK_ATTACHMENTS = [
  { name: "reference.png", src: defaultInput },
  { name: "motion-reference.mp4" },
  { name: "alternate-angle.png", src: defaultInput },
];

/**
 * Mirrors FigUI3 /propskit/lab "AI composer" patterns from 8.5.0.
 *
 * Lab layout:
 *   [optional fig-ai-context]  ← attachments, status shimmer, or action-needed
 *   <fig-ai-prompt>            ← input + footer only
 *
 * @param {boolean} [props.context]
 *   When true, move attachments / status / action-needed into a sibling
 *   `fig-ai-context` above `fig-ai-prompt` (FigUI3 8.5.0 lab pattern).
 * @param {string} [props.status]
 *   Status copy rendered as `fig-shimmer` inside `fig-ai-context` (lab "Status").
 * @param {boolean} [props.pendingApply]
 *   A generated module the agent could not apply, offered with an Apply button.
 * @param {boolean} [props.pendingPlan]
 *   A completed plan offered with Build and Dismiss actions.
 */
function Composer({
  draft = "",
  attachments = [],
  working = false,
  missingKey = false,
  error = "",
  latestActivity = "",
  status = "",
  pendingApply = false,
  pendingPlan = false,
  onDismissPlan,
  context = false,
}) {
  const canSend =
    !working && !missingKey && Boolean(draft.trim() || attachments.length);

  const attachmentRow = attachments.length ? (
    <fig-attachments aria-label="Prompt attachments">
      {attachments.map((attachment, index) => (
        <fig-attachment
          key={`${attachment.name}:${index}`}
          src={attachment.src}
          name={attachment.name}
          value={String(index)}
          disabled={working ? "" : undefined}
          dangerouslySetInnerHTML={{ __html: "" }}
        />
      ))}
    </fig-attachments>
  ) : null;

  // App-specific "scrolled away from latest" row: shimmer status + View latest.
  const activityRow = latestActivity ? (
    <div className="chat-latest-activity">
      <fig-shimmer>
        <span>{latestActivity}</span>
      </fig-shimmer>
      <fig-button type="button" variant="secondary" size="small">
        View latest
      </fig-button>
    </div>
  ) : null;

  // Lab "Status" example: fig-shimmer inside fig-ai-context.
  const statusRow = status ? (
    <fig-shimmer>
      <span>{status}</span>
    </fig-shimmer>
  ) : null;

  // Lab "Action needed" example: hstack with copy + secondary button. The label
  // fills the row so the button trails, matching the activity row.
  const actionNeededRow =
    context && missingKey ? (
      <hstack className="chat-context-action">
        <span>Connect provider</span>
        <fig-button type="button" variant="secondary">
          Add API keys
        </fig-button>
      </hstack>
    ) : null;

  // Deferred apply: the agent finished while another shader was open, so the
  // module waits behind an Apply button instead of landing silently.
  const pendingApplyRow =
    context && pendingApply ? (
      <hstack className="chat-context-action">
        <span>Generated main.ts wasn't applied</span>
        <fig-button type="button" variant="secondary">
          Apply
        </fig-button>
      </hstack>
    ) : null;

  const pendingPlanRow =
    context && pendingPlan ? (
      <PlanReadyAction onBuild={() => {}} onDismiss={onDismissPlan} />
    ) : null;

  const contextChildren = [
    attachmentRow,
    statusRow,
    actionNeededRow,
    pendingApplyRow,
    pendingPlanRow,
    // App-specific "View latest" chip — not in FigUI3 lab, but useful to compare.
    context ? activityRow : null,
  ].filter(Boolean);

  const useContext = context && contextChildren.length > 0;

  return (
    <div className="chat-footer">
      {error && <p className="chat-error">{error}</p>}
      <div className="chat-composer">
        {useContext && (
          <fig-ai-context aria-label="Prompt context">
            {contextChildren}
          </fig-ai-context>
        )}
        <fig-ai-prompt>
          {!useContext && activityRow}
          {!useContext && attachmentRow}
          <fig-input-text
            class="chat-input"
            multiline=""
            value={draft}
            placeholder="Ask for changes..."
            aria-label="Ask for changes"
            disabled={working || missingKey ? "" : undefined}
            dangerouslySetInnerHTML={{ __html: "" }}
          />
          <fig-footer>
            <fig-tooltip class="chat-attach-button" text="Attach media">
              <fig-button
                type="button"
                variant="ghost"
                icon="true"
                aria-label="Attach media"
                disabled={working || missingKey ? "" : undefined}
              >
                <fig-icon name="add" />
              </fig-button>
            </fig-tooltip>
            <hstack>
              {!context && missingKey ? (
                <fig-button type="button" variant="secondary">
                  Add API key
                </fig-button>
              ) : (
                <fig-tooltip text="Model: GPT-5.2">
                  <fig-select
                    class="chat-model-select"
                    variant="ghost"
                    label="Model"
                    position="top left"
                    value="gpt-5.2"
                    disabled={working ? "" : undefined}
                  >
                    <fig-select-options>
                      <fig-separator label="OpenAI" />
                      <fig-select-option value="gpt-5.2">GPT-5.2</fig-select-option>
                    </fig-select-options>
                  </fig-select>
                </fig-tooltip>
              )}
              {working ? (
                <fig-tooltip text="Stop">
                  <fig-button
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label="Stop"
                  >
                    <StopIcon />
                  </fig-button>
                </fig-tooltip>
              ) : (
                <fig-tooltip text="Send">
                  <fig-button
                    type="button"
                    variant="primary"
                    icon="true"
                    aria-label="Send"
                    disabled={canSend ? undefined : ""}
                  >
                    <SendIcon />
                  </fig-button>
                </fig-tooltip>
              )}
            </hstack>
          </fig-footer>
        </fig-ai-prompt>
      </div>
    </div>
  );
}

function StateExample({ title, description, children }) {
  return (
    <article className="streaming-code-playground-example chat-composer-playground-example">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="chat-composer-playground-stage">{children}</div>
    </article>
  );
}

function PendingPlanExample() {
  const [visible, setVisible] = useState(true);
  return (
    <Composer
      pendingPlan={visible}
      onDismissPlan={() => setVisible(false)}
      context
    />
  );
}

export default function ChatComposerPlayground() {
  return (
    <main className="shader-viewer streaming-code-playground chat-composer-playground">
      <div className="streaming-code-playground-heading">
        <div>
          <h1>Chat composer</h1>
          <p>
            Current app states (attachments and activity still live inside
            fig-ai-prompt).
          </p>
        </div>
      </div>

      <section className="shader-viewer-chat streaming-code-playground-panel">
        <div className="code-chat">
          <div className="streaming-code-playground-grid chat-composer-playground-grid">
            <StateExample title="Empty" description="Ready for a new prompt.">
              <Composer />
            </StateExample>

            <StateExample title="Draft" description="Text entered and ready to send.">
              <Composer draft="Make the grain softer in the highlights." />
            </StateExample>

            <StateExample title="One attachment" description="A single image reference.">
              <Composer
                draft="Match the texture in this reference."
                attachments={MOCK_ATTACHMENTS.slice(0, 1)}
              />
            </StateExample>

            <StateExample
              title="Multiple attachments"
              description="Mixed media and wrapping attachment rows."
            >
              <Composer
                draft="Use these references for the motion and texture."
                attachments={MOCK_ATTACHMENTS}
              />
            </StateExample>

            <StateExample title="Working" description="Prompt locked while the agent runs.">
              <Composer
                draft="Add a temporal trail with a two-second decay."
                attachments={MOCK_ATTACHMENTS.slice(0, 1)}
                working
              />
            </StateExample>

            <StateExample title="API key required" description="Provider setup is unavailable.">
              <Composer draft="Make the effect more subtle." missingKey />
            </StateExample>

            <StateExample title="Error" description="A provider or request error is shown.">
              <Composer
                draft="Try the request again."
                error="The model request failed. Check your API key and try again."
              />
            </StateExample>

            <StateExample
              title="New activity"
              description="The message list is scrolled away from the latest response."
            >
              <Composer latestActivity="Agent is writing code" />
            </StateExample>
          </div>
        </div>
      </section>

      <div className="streaming-code-playground-heading">
        <div>
          <h1>fig-ai-context (FigUI3 8.5.0 lab)</h1>
          <p>
            Official /propskit/lab AI composer patterns: attachments, status, and
            action-needed rows sit in a sibling fig-ai-context above
            fig-ai-prompt. The prompt itself only holds the textarea and footer.
          </p>
        </div>
      </div>

      <section className="shader-viewer-chat streaming-code-playground-panel">
        <div className="code-chat">
          <div className="streaming-code-playground-grid chat-composer-playground-grid">
            <StateExample
              title="Attachments"
              description="Lab: fig-attachments inside fig-ai-context, sibling above the prompt."
            >
              <Composer
                draft="Match the texture in this reference."
                attachments={MOCK_ATTACHMENTS.slice(0, 2)}
                context
              />
            </StateExample>

            <StateExample
              title="Multiple attachments"
              description="Wrapping attachment rows in the open context tray."
            >
              <Composer
                draft="Use these references for the motion and texture."
                attachments={MOCK_ATTACHMENTS}
                context
              />
            </StateExample>

            <StateExample
              title="Status"
              description='Lab: fig-shimmer status copy inside fig-ai-context ("Reviewing your selection…").'
            >
              <Composer
                draft="Ask for changes..."
                status="Reviewing your selection…"
                context
              />
            </StateExample>

            <StateExample
              title="Action needed"
              description="Lab: hstack with Connect provider + Add API keys in the context tray; model select stays in the footer."
            >
              <Composer draft="Make the effect more subtle." missingKey context />
            </StateExample>

            <StateExample
              title="Attachments + status"
              description="Lab stacking: attachments and shimmer share the context column gap."
            >
              <Composer
                draft="Use these references for the motion and texture."
                attachments={MOCK_ATTACHMENTS.slice(0, 2)}
                status="Indexing references…"
                context
              />
            </StateExample>

            <StateExample
              title="Working + attachments"
              description="Context tray stays visible; prompt and attachments disable while the agent runs."
            >
              <Composer
                draft="Add a temporal trail with a two-second decay."
                attachments={MOCK_ATTACHMENTS.slice(0, 1)}
                context
                working
              />
            </StateExample>

            <StateExample
              title="In prompt (current)"
              description="Current app layout for comparison: attachments still inside fig-ai-prompt."
            >
              <Composer
                draft="Match the texture in this reference."
                attachments={MOCK_ATTACHMENTS.slice(0, 1)}
              />
            </StateExample>

            <StateExample
              title="Activity chip in context"
              description="App-specific status shimmer + View latest in the tray."
            >
              <Composer latestActivity="Agent is writing code" context />
            </StateExample>

            <StateExample
              title="Deferred apply"
              description="The agent finished while another shader was open, so the module waits behind an Apply button."
            >
              <Composer pendingApply context />
            </StateExample>

            <StateExample
              title="Plan ready"
              description="A completed plan can be built or dismissed without deleting it from chat history."
            >
              <PendingPlanExample />
            </StateExample>
          </div>
        </div>
      </section>
    </main>
  );
}
