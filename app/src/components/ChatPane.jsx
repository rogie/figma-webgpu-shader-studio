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
const MAX_AUTO_HEAL_ATTEMPTS = 2;

function assistantPhaseLabel(message) {
  switch (message?.phase) {
    case "thinking":
      return "Thinking…";
    case "responding":
      return "Responding…";
    case "writing":
      return "Writing module…";
    case "validating":
      return "Validating module…";
    case "repairing":
      return "Fixing syntax…";
    case "applying":
      return "Applying changes…";
    default:
      return "Waiting for provider…";
  }
}

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
    hidden = false,
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
  const [attachments, setAttachments] = useState([]);
  const abortRef = useRef(null);
  const listRef = useRef(null);
  const undoStackRef = useRef([]);
  const modelControlRef = useRef(null);
  const imageInputRef = useRef(null);
  const pendingAttachmentsRef = useRef(null);

  const threadId = messageKey(shaderKey);
  const messages = pruneEmptyAssistants(threads[threadId] || []);
  const apiKey = useMemo(
    () => getProviderKey(model.provider),
    [model.provider, keyVersion]
  );
  const hasKey = Boolean(apiKey);
  const videoSupported = providerSupportsChatVideo(model.provider);
  const canSend =
    hasKey && Boolean(draft.trim() || attachments.length) && !streaming;
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
  }, [messages, streaming, attachments]);

  useEffect(() => {
    if (providerSupportsChatVideo(model.provider)) return;
    if (!attachments.some((attachment) => attachment.kind === "video")) return;
    setAttachments((current) =>
      current.filter((attachment) => attachment.kind !== "video")
    );
    onNotice?.("Video attachments are only supported with Gemini. Cleared videos.");
  }, [model.provider, attachments, onNotice]);

  useEffect(() => {
    const attachmentList = pendingAttachmentsRef.current;
    if (!attachmentList) return;
    const removeAttachment = (event) => {
      const index = Number(event.detail?.value);
      if (!Number.isInteger(index)) return;
      setAttachments((current) =>
        current.filter((_, currentIndex) => currentIndex !== index)
      );
    };
    attachmentList.addEventListener("remove", removeAttachment);
    return () => attachmentList.removeEventListener("remove", removeAttachment);
  }, [attachments.length]);

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
  }, [hasKey]);

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
    setAttachments([]);
    setError("");
  };

  useImperativeHandle(
    ref,
    () => ({
      clearChat: clearCurrentChat,
    }),
    [threadId, streaming]
  );

  const addAttachments = async (files) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;
    const nextAttachments = [];
    for (const file of selectedFiles) {
      const kind = file.type.startsWith("video/") ? "video" : "image";
      try {
        if (kind === "video" && !providerSupportsChatVideo(model.provider)) {
          throw new Error("Video attachments are only supported with Gemini.");
        }
        nextAttachments.push(await fileToChatAttachment(file, kind));
      } catch (err) {
        setError(err.message || String(err));
        return;
      }
    }
    setAttachments((current) => [...current, ...nextAttachments]);
    setError("");
  };

  const onAttachmentChosen = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    addAttachments(files);
  };

  const onPromptPaste = (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    const file =
      imageItem?.getAsFile() ||
      Array.from(event.clipboardData?.files || []).find((item) =>
        item.type.startsWith("image/")
      );
    if (!file) return;
    event.preventDefault();
    addAttachments([file]);
  };

  const send = async () => {
    const text = draft.trim();
    if ((!text && attachments.length === 0) || streaming) return;

    if (!isSupabaseConfigured) {
      setError("Supabase is not configured for the chat proxy.");
      return;
    }
    if (!hasKey) {
      setError("Add your API key in Settings before chatting.");
      return;
    }
    if (
      attachments.some((attachment) => attachment.kind === "video") &&
      !providerSupportsChatVideo(model.provider)
    ) {
      setError("Video attachments are only supported with Gemini.");
      return;
    }

    setError("");
    setDraft("");
    const currentAttachments = attachments;
    setAttachments([]);

    const userMessage = {
      role: "user",
      content:
        text ||
        (currentAttachments.length
          ? `Attached: ${currentAttachments
              .map((attachment) => attachment.name)
              .join(", ")}`
          : ""),
      attachments: currentAttachments.map(attachmentMeta),
      attachmentPreviews: currentAttachments.map(
        (attachment) => attachment.previewUrl || null
      ),
    };
    const assistantMessage = {
      role: "assistant",
      content: "",
      pending: true,
      phase: "waiting",
    };

    updateThread((current) => [...current, userMessage, assistantMessage]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const history = toApiMessages(
      [...messages, userMessage],
      currentAttachments
    );

    let assembled = "";
    let sawError = false;
    let lastApplied = null;
    let didPushUndo = false;
    const baselineSource = source;

    const updateLastAssistant = (patch) => {
      updateThread((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role !== "assistant") return next;
        next[next.length - 1] = { ...last, ...patch };
        return next;
      });
    };

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
      updateLastAssistant({ phase: "applying" });
      onApplySource(moduleSource);
      markAssistantApplied();
      return true;
    };

    const autoHealSyntaxError = async (initialSource, initialReason) => {
      let brokenSource = initialSource;
      let reason = initialReason;
      let repairHistory = [
        ...history,
        { role: "assistant", content: assembled },
      ];

      for (let attempt = 1; attempt <= MAX_AUTO_HEAL_ATTEMPTS; attempt += 1) {
        if (controller.signal.aborted) return false;
        const repairPrompt = [
          `Auto-repair attempt ${attempt}/${MAX_AUTO_HEAL_ATTEMPTS}.`,
          "The module you just wrote failed syntax validation:",
          reason,
          "Fix the error and return the complete corrected module in one code fence.",
          "Do not omit unchanged code.",
        ].join("\n\n");
        const repairUserMessage = {
          role: "user",
          content: repairPrompt,
          autoRepair: true,
        };
        updateThread((current) => [
          ...current,
          repairUserMessage,
          {
            role: "assistant",
            content: "",
            pending: true,
            autoRepair: true,
            phase: "repairing",
          },
        ]);

        let repairedText = "";
        for await (const event of streamChat({
          provider: model.provider,
          model: model.id,
          apiKey,
          messages: [...repairHistory, { role: "user", content: repairPrompt }],
          source: brokenSource,
          kind,
          fileName,
          features,
          skills: getChatSkillContext(),
          signal: controller.signal,
        })) {
          if (event.type === "error") {
            throw new Error(event.message || "Automatic repair failed.");
          }
          if (event.type === "status") {
            updateLastAssistant({ phase: "repairing" });
            continue;
          }
          if (event.type === "done") {
            updateLastAssistant({ phase: "validating" });
            continue;
          }
          if (event.type !== "delta") continue;
          repairedText += event.text;
          const snapshot = repairedText;
          updateThread((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                content: snapshot,
                pending: true,
                phase: "repairing",
              };
            }
            return next;
          });
        }

        const candidate = extractModuleSource(repairedText, {
          allowIncomplete: true,
        });
        const check = candidate
          ? validateModuleSource(candidate)
          : { ok: false, reason: "Repair did not return a code module." };
        const applied =
          check.ok &&
          tryApplyModule(repairedText, { allowIncomplete: true });
        finishAssistant(repairedText, { applied });
        if (applied) return true;

        brokenSource = candidate || brokenSource;
        reason = check.reason;
        repairHistory = [
          ...repairHistory,
          { role: "user", content: repairPrompt },
          { role: "assistant", content: repairedText },
        ];
      }
      return false;
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
          const writingModule = Boolean(
            extractModuleSource(snapshot, { allowIncomplete: true })
          );
          updateThread((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                content: snapshot,
                pending: true,
                applied: Boolean(last.applied),
                phase: writingModule ? "writing" : "responding",
              };
            }
            return next;
          });
          tryApplyModule(snapshot, { allowIncomplete: false });
        } else if (event.type === "status") {
          updateLastAssistant({ phase: event.phase });
        } else if (event.type === "done") {
          updateLastAssistant({ phase: "validating" });
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
            if (!check.ok && check.autoHealable) {
              onNotice?.("Syntax error detected. Repairing code…");
              const healed = await autoHealSyntaxError(candidate, check.reason);
              if (healed) {
                onNotice?.("Syntax error fixed automatically.");
              } else {
                onNotice?.(
                  `Automatic repair failed: ${check.reason}`,
                  { error: true }
                );
              }
            } else if (!check.ok) {
              onNotice?.(check.reason, { error: true });
            }
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
    <div className="code-chat" hidden={hidden}>
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>
              Iterate on <code>{fileName}</code>. Chat includes the current
              module source and Figma shader authoring skills. History for this
              shader is saved on this device.
            </p>
            {!isSupabaseConfigured && (
              <p className="chat-error">
                Chat proxy needs Supabase env vars configured.
              </p>
            )}
          </div>
        )}
        {messages.map((message, index) => {
          if (message.role === "user") {
            const messageAttachments =
              message.attachments ||
              (message.attachment ? [message.attachment] : []);
            const attachmentPreviews =
              message.attachmentPreviews ||
              (message.attachmentPreview ? [message.attachmentPreview] : []);
            return (
              <fig-chat-message key={index} from="user">
                {messageAttachments.map((messageAttachment, attachmentIndex) => {
                  const preview = attachmentPreviews[attachmentIndex];
                  if (preview && messageAttachment.kind === "image") {
                    return (
                      <img
                        key={attachmentIndex}
                        className="chat-attachment-preview"
                        src={preview}
                        alt={messageAttachment.name || "Attachment"}
                      />
                    );
                  }
                  if (preview && messageAttachment.kind === "video") {
                    return (
                      <video
                        key={attachmentIndex}
                        className="chat-attachment-preview"
                        src={preview}
                        controls
                        muted
                      />
                    );
                  }
                  return (
                    <div key={attachmentIndex} className="chat-attachment-chip">
                      {messageAttachment.kind === "video" ? "Video" : "Image"}:{" "}
                      {messageAttachment.name}
                    </div>
                  );
                })}
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
          const { prose } = splitAssistantContent(message.content);
          return (
            <fig-chat-message
              key={index}
              from="agent"
            >
              {prose && <div className="chat-prose">{prose}</div>}
              {(message.applied || message.pending) && (
                <div className="chat-code-note">
                  {message.applied ? (
                    <span>Updated module applied to editor.</span>
                  ) : (
                    <fig-shimmer aria-label={assistantPhaseLabel(message)}>
                      <span>{assistantPhaseLabel(message)}</span>
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
          <fig-ai-prompt>
            {attachments.length > 0 && (
              <fig-attachments ref={pendingAttachmentsRef}>
                {attachments.map((attachment, index) => (
                  <fig-attachment
                    key={`${attachment.name}:${attachment.size}:${index}`}
                    src={
                      attachment.kind === "image"
                        ? attachment.previewUrl
                        : undefined
                    }
                    name={attachment.name}
                    value={String(index)}
                    disabled={streaming ? "" : undefined}
                    dangerouslySetInnerHTML={{ __html: "" }}
                  />
                ))}
              </fig-attachments>
            )}
            <fig-input-text
              class="chat-input"
              multiline=""
              value={draft}
              placeholder="Ask for changes..."
              aria-label="Ask for changes"
              disabled={streaming || !hasKey ? "" : undefined}
              onInput={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPromptPaste}
              dangerouslySetInnerHTML={{ __html: "" }}
            />
            <fig-footer>
              <fig-tooltip class="chat-attach-button" text="Attach media">
                <fig-button
                  type="button"
                  variant="ghost"
                  icon="true"
                  aria-label="Attach media"
                  disabled={streaming || !hasKey ? "" : undefined}
                  onClick={() => imageInputRef.current?.click()}
                >
                  <fig-icon name="add" />
                </fig-button>
              </fig-tooltip>
              <hstack>
                {hasKey ? (
                  <fig-tooltip text={`Model: ${model.label}`}>
                    {modelSelect}
                  </fig-tooltip>
                ) : (
                  <fig-button
                    type="button"
                    variant="secondary"
                    onClick={onOpenSettings}
                  >
                    Add API key
                  </fig-button>
                )}
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
          <input
            ref={imageInputRef}
            type="file"
            accept={videoSupported ? "image/*,video/*" : "image/*"}
            multiple
            hidden
            onChange={onAttachmentChosen}
          />
        </div>
      </div>
    </div>
  );
});

export default ChatPane;
