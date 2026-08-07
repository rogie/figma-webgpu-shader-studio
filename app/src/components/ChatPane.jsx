import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  extractModuleSource,
  formatChatError,
  splitAssistantContent,
  validateModuleSource,
} from "../lib/chatApply.js";
import {
  attachmentMeta,
  fileToChatAttachment,
  providerSupportsChatVideo,
} from "../lib/chatAttachments.js";
import {
  CHAT_MODEL_GROUPS,
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  findChatModel,
} from "../lib/chatModels.js";
import { getChatSkillContext } from "../lib/chatSkills.js";
import {
  loadChatThreads,
  saveChatThreads,
} from "../lib/chatThreads.js";
import {
  getProviderKey,
  subscribeProviderKeys,
} from "../lib/providerKeys.js";
import { toApiMessages } from "../lib/chatPayload.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { streamChat } from "../services/chat.js";
import SendIcon from "./SendIcon.jsx";
import StopIcon from "./StopIcon.jsx";
import UndoIcon from "./UndoIcon.jsx";
import "../chat.css";

const MODEL_STORAGE_KEY = "shader-studio.chatModel";
const MAX_UNDO = 12;

function loadSavedModel() {
  try {
    const raw = localStorage.getItem(MODEL_STORAGE_KEY);
    if (!raw) return DEFAULT_CHAT_MODEL;
    const parsed = JSON.parse(raw);
    return findChatModel(parsed.provider, parsed.id);
  } catch {
    return DEFAULT_CHAT_MODEL;
  }
}

function messageKey(shaderKey) {
  return shaderKey || "default";
}

function providerLabel(provider) {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "gemini") return "Gemini";
  return provider;
}

function isEmptyAssistant(message) {
  return (
    message?.role === "assistant" &&
    !message.pending &&
    !String(message.content || "").trim()
  );
}

function pruneEmptyAssistants(thread) {
  return thread.filter((message) => !isEmptyAssistant(message));
}

const ChatPane = forwardRef(function ChatPane(
  {
    source,
    kind,
    fileName,
    shaderKey,
    features,
    user,
    onApplySource,
    onOpenSettings,
    onNotice,
    onCanClearChange,
  },
  ref
) {
  const [model, setModel] = useState(loadSavedModel);
  const [draft, setDraft] = useState("");
  const [threads, setThreads] = useState(loadChatThreads);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [keyVersion, setKeyVersion] = useState(0);
  const [undoCount, setUndoCount] = useState(0);
  const [attachment, setAttachment] = useState(null);
  const abortRef = useRef(null);
  const listRef = useRef(null);
  const undoStackRef = useRef([]);
  const modelControlRef = useRef(null);
  const imageInputRef = useRef(null);
  const pendingApiAttachmentRef = useRef(null);

  const threadId = messageKey(shaderKey);
  const messages = pruneEmptyAssistants(threads[threadId] || []);
  const apiKey = useMemo(
    () => getProviderKey(model.provider),
    [model.provider, keyVersion]
  );
  const hasKey = Boolean(apiKey);
  const videoSupported = providerSupportsChatVideo(model.provider);
  const canSend = Boolean(draft.trim() || attachment) && !streaming;
  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    "User";
  const userAvatarUrl =
    user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  let undoMessageIndex = -1;
  if (undoCount > 0) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant" && message.applied) {
        undoMessageIndex = index;
        break;
      }
    }
  }

  useEffect(() => subscribeProviderKeys(() => setKeyVersion((n) => n + 1)), []);

  useEffect(() => {
    localStorage.setItem(
      MODEL_STORAGE_KEY,
      JSON.stringify({ provider: model.provider, id: model.id })
    );
  }, [model]);

  useEffect(() => {
    saveChatThreads(threads);
  }, [threads]);

  useEffect(() => {
    setThreads((prev) => {
      const current = prev[threadId];
      if (!current?.some(isEmptyAssistant)) return prev;
      return { ...prev, [threadId]: pruneEmptyAssistants(current) };
    });
  }, [threadId]);

  useEffect(() => {
    onCanClearChange?.(messages.length > 0);
  }, [messages.length, onCanClearChange]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming, attachment]);

  useEffect(() => {
    if (attachment?.kind === "video" && !providerSupportsChatVideo(model.provider)) {
      setAttachment(null);
      onNotice?.("Video attachments are only supported with Gemini. Cleared attachment.");
    }
  }, [model.provider, attachment, onNotice]);

  useEffect(() => {
    const control = modelControlRef.current;
    if (!control) return;
    const onChange = (event) => {
      const detail = event.detail;
      const value =
        detail && typeof detail === "object" && "value" in detail
          ? detail.value
          : (detail ?? event.target?.value);
      const next = CHAT_MODELS.find((entry) => entry.id === String(value || ""));
      if (next) {
        setModel(next);
        setError("");
      }
    };
    control.addEventListener("change", onChange);
    return () => {
      control.removeEventListener("change", onChange);
    };
  }, []);

  const updateThread = (updater) => {
    setThreads((prev) => {
      const current = prev[threadId] || [];
      return { ...prev, [threadId]: updater(current) };
    });
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  };

  const undoLastApply = () => {
    const previous = undoStackRef.current.pop();
    if (previous == null) return;
    setUndoCount(undoStackRef.current.length);
    onApplySource(previous);
    onNotice?.("Reverted last chat edit.");
  };

  const clearCurrentChat = () => {
    if (messages.length === 0) return;
    if (streaming) stop();
    setThreads((prev) => {
      const next = { ...prev };
      delete next[threadId];
      return next;
    });
    setAttachment(null);
    setError("");
  };

  useImperativeHandle(
    ref,
    () => ({
      clearChat: clearCurrentChat,
    }),
    [threadId, streaming]
  );

  const pickAttachment = async (file, kind) => {
    if (!file) return;
    try {
      if (kind === "video" && !providerSupportsChatVideo(model.provider)) {
        setError("Video attachments are only supported with Gemini.");
        return;
      }
      const next = await fileToChatAttachment(file, kind);
      setAttachment(next);
      setError("");
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  const onAttachmentChosen = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    pickAttachment(file, file?.type.startsWith("video/") ? "video" : "image");
  };

  const send = async () => {
    const text = draft.trim();
    if ((!text && !attachment) || streaming) return;

    if (!isSupabaseConfigured) {
      setError("Supabase is not configured for the chat proxy.");
      return;
    }
    if (!hasKey) {
      setError("Add your API key in Settings before chatting.");
      return;
    }
    if (attachment?.kind === "video" && !providerSupportsChatVideo(model.provider)) {
      setError("Video attachments are only supported with Gemini.");
      return;
    }

    setError("");
    setDraft("");
    const currentAttachment = attachment;
    pendingApiAttachmentRef.current = currentAttachment;
    setAttachment(null);

    const userMessage = {
      role: "user",
      content:
        text ||
        (currentAttachment
          ? `Attached ${currentAttachment.kind}: ${currentAttachment.name}`
          : ""),
      attachment: attachmentMeta(currentAttachment),
      attachmentPreview: currentAttachment?.previewUrl || null,
    };
    const assistantMessage = { role: "assistant", content: "", pending: true };

    updateThread((current) => [...current, userMessage, assistantMessage]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const history = toApiMessages(
      [...messages, userMessage],
      currentAttachment
    );

    let assembled = "";
    let sawError = false;
    let lastApplied = null;
    let didPushUndo = false;
    const baselineSource = source;

    const finishAssistant = (content, { applied = false } = {}) => {
      updateThread((current) => {
        const next = pruneEmptyAssistants([...current]);
        const last = next[next.length - 1];
        if (last?.role !== "assistant") return next;
        if (!String(content || "").trim()) {
          next.pop();
          return next;
        }
        next[next.length - 1] = {
          role: "assistant",
          content,
          pending: false,
          applied: Boolean(applied || last.applied),
        };
        return next;
      });
    };

    const markAssistantApplied = () => {
      updateThread((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role !== "assistant") return next;
        next[next.length - 1] = { ...last, applied: true };
        return next;
      });
    };

    const tryApplyModule = (text, { allowIncomplete = false } = {}) => {
      const moduleSource = extractModuleSource(text, { allowIncomplete });
      if (!moduleSource || moduleSource === lastApplied) return false;
      if (moduleSource === baselineSource && !didPushUndo) return false;
      const check = validateModuleSource(moduleSource);
      if (!check.ok) return false;
      if (!didPushUndo) {
        undoStackRef.current.push(baselineSource);
        if (undoStackRef.current.length > MAX_UNDO) {
          undoStackRef.current.shift();
        }
        setUndoCount(undoStackRef.current.length);
        didPushUndo = true;
      }
      lastApplied = moduleSource;
      onApplySource(moduleSource);
      markAssistantApplied();
      return true;
    };

    try {
      for await (const event of streamChat({
        provider: model.provider,
        model: model.id,
        apiKey,
        messages: history,
        source: baselineSource,
        kind,
        fileName,
        features,
        skills: getChatSkillContext(),
        signal: controller.signal,
      })) {
        if (event.type === "delta") {
          assembled += event.text;
          const snapshot = assembled;
          updateThread((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                role: "assistant",
                content: snapshot,
                pending: true,
                applied: Boolean(last.applied),
              };
            }
            return next;
          });
          tryApplyModule(snapshot, { allowIncomplete: false });
        } else if (event.type === "error") {
          sawError = true;
          setError(event.message || "Chat failed.");
          break;
        }
      }

      const applied =
        tryApplyModule(assembled, { allowIncomplete: true }) || didPushUndo;

      if (sawError || !assembled.trim()) {
        finishAssistant(assembled.trim() ? assembled : "", { applied });
        if (!sawError && !controller.signal.aborted) {
          setError(
            `${model.label} returned an empty reply. Try again or choose another model.`
          );
        }
      } else {
        finishAssistant(assembled, { applied });
        if (applied) {
          onNotice?.("Code updated from chat.");
        } else {
          const candidate = extractModuleSource(assembled, {
            allowIncomplete: true,
          });
          if (candidate) {
            const check = validateModuleSource(candidate);
            if (!check.ok) onNotice?.(check.reason);
          }
        }
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError(err.message || String(err));
      }
      const applied =
        tryApplyModule(assembled, { allowIncomplete: true }) || didPushUndo;
      finishAssistant(assembled, { applied });
      if (applied) onNotice?.("Code updated from chat.");
    } finally {
      abortRef.current = null;
      pendingApiAttachmentRef.current = null;
      setStreaming(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const modelSelect = (
    <fig-select
      ref={modelControlRef}
      class="chat-model-select"
      label="Model"
      position="top left"
      value={model.id}
      disabled={streaming ? "" : undefined}
    >
      <fig-select-options>
        {CHAT_MODEL_GROUPS.map((group) => (
          <Fragment key={group.label}>
            <fig-separator label={group.label} />
            {group.models.map((entry) => (
              <fig-select-option key={entry.id} value={entry.id}>
                {entry.label}
              </fig-select-option>
            ))}
          </Fragment>
        ))}
      </fig-select-options>
    </fig-select>
  );

  return (
    <div className="code-chat">
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>
              Iterate on <code>{fileName}</code>. Chat includes the current
              module source and Figma shader authoring skills. History for this
              shader is saved on this device.
            </p>
            {!hasKey && (
              <p>
                Add a {providerLabel(model.provider)} API key in{" "}
                <button type="button" className="chat-link" onClick={onOpenSettings}>
                  Settings
                </button>{" "}
                to start.
              </p>
            )}
            {!isSupabaseConfigured && (
              <p className="chat-error">
                Chat proxy needs Supabase env vars configured.
              </p>
            )}
          </div>
        )}
        {messages.map((message, index) => {
          if (message.role === "user") {
            return (
              <fig-chat-message key={index} from="user">
                {message.attachmentPreview && message.attachment?.kind === "image" && (
                  <img
                    className="chat-attachment-preview"
                    src={message.attachmentPreview}
                    alt={message.attachment.name || "Attachment"}
                  />
                )}
                {message.attachment && !message.attachmentPreview && (
                  <div className="chat-attachment-chip">
                    {message.attachment.kind === "video" ? "Video" : "Image"}:{" "}
                    {message.attachment.name}
                  </div>
                )}
                {message.attachment?.kind === "video" && message.attachmentPreview && (
                  <video
                    className="chat-attachment-preview"
                    src={message.attachmentPreview}
                    controls
                    muted
                  />
                )}
                {message.content && <div className="chat-prose">{message.content}</div>}
                {user && (
                  <fig-avatar
                    name={userName}
                    src={userAvatarUrl || undefined}
                  />
                )}
              </fig-chat-message>
            );
          }
          const { prose, source: code } = splitAssistantContent(message.content);
          return (
            <fig-chat-message
              key={index}
              from="agent"
            >
              {prose && <div className="chat-prose">{prose}</div>}
              {(message.applied || (code && message.pending)) && (
                <div className="chat-code-note">
                  {message.applied ? (
                    <span>Updated module applied to editor.</span>
                  ) : (
                    <fig-shimmer aria-label="Writing module">
                      <span>Writing module…</span>
                    </fig-shimmer>
                  )}
                  {index === undoMessageIndex && message.applied && (
                    <fig-tooltip text="Undo apply">
                      <fig-button
                        type="button"
                        variant="ghost"
                        icon="true"
                        size="small"
                        aria-label="Undo apply"
                        onClick={undoLastApply}
                      >
                        <UndoIcon />
                      </fig-button>
                    </fig-tooltip>
                  )}
                </div>
              )}
              {message.pending && !message.content && (
                <fig-shimmer aria-label="Thinking">
                  <div className="chat-prose">Thinking…</div>
                </fig-shimmer>
              )}
            </fig-chat-message>
          );
        })}
      </div>

      <div className="chat-footer">
        {error && (
          <p className="chat-error" title={error}>
            {formatChatError(error)}
          </p>
        )}
        <div className="chat-composer">
          {attachment && (
            <div className="chat-pending-attachment">
              {attachment.kind === "image" ? (
                <img src={attachment.previewUrl} alt={attachment.name} />
              ) : (
                <video src={attachment.previewUrl} muted />
              )}
              <span>{attachment.name}</span>
              <fig-button
                type="button"
                variant="ghost"
                icon="true"
                size="small"
                aria-label="Remove attachment"
                onClick={() => setAttachment(null)}
              >
                <fig-icon name="x" />
              </fig-button>
            </div>
          )}
          {hasKey && (
            <fig-ai-prompt>
              <fig-input-text
                class="chat-input"
                multiline=""
                value={draft}
                placeholder="Ask for changes..."
                aria-label="Ask for changes"
                disabled={streaming ? "" : undefined}
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
                    disabled={streaming ? "" : undefined}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <fig-icon name="add" />
                  </fig-button>
                </fig-tooltip>
                <hstack>
                  <fig-tooltip text={`Model: ${model.label}`}>
                    {modelSelect}
                  </fig-tooltip>
                  {streaming ? (
                    <fig-tooltip text="Stop">
                      <fig-button
                        type="button"
                        variant="ghost"
                        icon="true"
                        aria-label="Stop"
                        onClick={stop}
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
                        disabled={!canSend}
                        onClick={send}
                      >
                        <SendIcon />
                      </fig-button>
                    </fig-tooltip>
                  )}
                </hstack>
              </fig-footer>
            </fig-ai-prompt>
          )}
          {!hasKey && (
            <div className="chat-composer-actions">
              {modelSelect}
              <fig-button
                type="button"
                variant="secondary"
                onClick={onOpenSettings}
              >
                Add API key
              </fig-button>
            </div>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept={videoSupported ? "image/*,video/*" : "image/*"}
            hidden
            onChange={onAttachmentChosen}
          />
        </div>
      </div>
    </div>
  );
});

export default ChatPane;
