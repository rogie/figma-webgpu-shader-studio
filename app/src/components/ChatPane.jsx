import { useEffect, useMemo, useRef, useState } from "react";
import {
  extractModuleSource,
  splitAssistantContent,
  validateModuleSource,
} from "../lib/chatApply.js";
import {
  attachmentForApi,
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
import { isSupabaseConfigured } from "../lib/supabase.js";
import { streamChat } from "../services/chat.js";

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

function toApiMessages(messages, pendingAttachment) {
  return messages.map((message, index) => {
    const isLast = index === messages.length - 1;
    const api = {
      role: message.role,
      content: message.content,
    };
    if (
      isLast &&
      message.role === "user" &&
      pendingAttachment?.dataBase64
    ) {
      api.attachments = [attachmentForApi(pendingAttachment)];
    } else if (message.attachment?.name) {
      // Persisted history keeps metadata only; remind the model in prose.
      api.content = message.content?.trim()
        ? message.content
        : `Attached ${message.attachment.kind || "image"}: ${message.attachment.name}`;
    }
    return api;
  });
}

export default function ChatPane({
  source,
  kind,
  fileName,
  shaderKey,
  features,
  onApplySource,
  onOpenSettings,
  onNotice,
}) {
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
  const videoInputRef = useRef(null);
  const pendingApiAttachmentRef = useRef(null);

  const threadId = messageKey(shaderKey);
  const messages = threads[threadId] || [];
  const apiKey = useMemo(
    () => getProviderKey(model.provider),
    [model.provider, keyVersion]
  );
  const hasKey = Boolean(apiKey);
  const videoSupported = providerSupportsChatVideo(model.provider);
  const canSend = Boolean(draft.trim() || attachment) && !streaming;

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
    const onInput = (event) => {
      const target = event.target?.closest?.("fig-dropdown") || event.target;
      const value = target?.value ?? event.detail ?? event.target?.value;
      const next = CHAT_MODELS.find((entry) => entry.id === value);
      if (next) setModel(next);
    };
    control.addEventListener("input", onInput);
    control.addEventListener("change", onInput);
    return () => {
      control.removeEventListener("input", onInput);
      control.removeEventListener("change", onInput);
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
    if (streaming) stop();
    setThreads((prev) => {
      const next = { ...prev };
      delete next[threadId];
      return next;
    });
    setAttachment(null);
    setError("");
  };

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

  const onImageChosen = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    pickAttachment(file, "image");
  };

  const onVideoChosen = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    pickAttachment(file, "video");
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
    try {
      for await (const event of streamChat({
        provider: model.provider,
        model: model.id,
        apiKey,
        messages: history,
        source,
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
              };
            }
            return next;
          });
        } else if (event.type === "error") {
          setError(event.message || "Chat failed.");
          break;
        }
      }

      updateThread((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = {
            role: "assistant",
            content: assembled,
            pending: false,
          };
        }
        return next;
      });

      const moduleSource = extractModuleSource(assembled);
      if (moduleSource) {
        const check = validateModuleSource(moduleSource);
        if (!check.ok) {
          onNotice?.(check.reason);
        } else {
          undoStackRef.current.push(source);
          if (undoStackRef.current.length > MAX_UNDO) {
            undoStackRef.current.shift();
          }
          setUndoCount(undoStackRef.current.length);
          onApplySource(moduleSource);
          onNotice?.("Code updated from chat.");
        }
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError(err.message || String(err));
      }
      updateThread((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && last.pending) {
          next[next.length - 1] = {
            role: "assistant",
            content: assembled || "(interrupted)",
            pending: false,
          };
        }
        return next;
      });
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

  const modelDropdown = (
    <fig-dropdown
      ref={modelControlRef}
      label="Model"
      experimental="modern"
      value={model.id}
      disabled={streaming ? "" : undefined}
    >
      {CHAT_MODEL_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.models.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </optgroup>
      ))}
    </fig-dropdown>
  );

  return (
    <div className="code-chat">
      {(undoCount > 0 || streaming || messages.length > 0) && (
        <div className="chat-toolbar">
          {undoCount > 0 && (
            <fig-button
              type="button"
              variant="ghost"
              size="small"
              onClick={undoLastApply}
            >
              Undo apply
            </fig-button>
          )}
          {messages.length > 0 && !streaming && (
            <fig-button
              type="button"
              variant="ghost"
              size="small"
              onClick={clearCurrentChat}
            >
              Clear chat
            </fig-button>
          )}
          {streaming && (
            <fig-button type="button" variant="ghost" size="small" onClick={stop}>
              Stop
            </fig-button>
          )}
        </div>
      )}

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
              <div key={index} className="chat-bubble chat-bubble-user">
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
              </div>
            );
          }
          const { prose, source: code } = splitAssistantContent(message.content);
          return (
            <div
              key={index}
              className={`chat-bubble chat-bubble-assistant${message.pending ? " is-pending" : ""}`}
            >
              {prose && <div className="chat-prose">{prose}</div>}
              {code && (
                <div className="chat-code-note">Updated module applied to editor.</div>
              )}
              {message.pending && !message.content && (
                <div className="chat-prose">Thinking…</div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="chat-error">{error}</p>}

      <div className="chat-composer">
        {hasKey ? (
          <>
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
            <textarea
              className="chat-input"
              rows={3}
              value={draft}
              placeholder={`Ask about ${fileName}…`}
              disabled={streaming}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </>
        ) : null}
        <div className="chat-composer-actions">
          {modelDropdown}
          {!hasKey ? (
            <fig-button
              type="button"
              variant="secondary"
              onClick={onOpenSettings}
            >
              Add API key
            </fig-button>
          ) : (
            <div className="chat-composer-send">
              <fig-menu position="top right">
                <fig-tooltip text="Attach media" delay="0">
                  <fig-button
                    fig-menu-trigger=""
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label="Attach media"
                    disabled={streaming ? "" : undefined}
                  >
                    <fig-icon name="add" />
                  </fig-button>
                </fig-tooltip>
                <fig-menu-item
                  value="image"
                  onClick={() => imageInputRef.current?.click()}
                >
                  Image
                </fig-menu-item>
                <fig-menu-item
                  value="video"
                  disabled={!videoSupported}
                  onClick={() => {
                    if (!videoSupported) {
                      setError("Video attachments are only supported with Gemini.");
                      return;
                    }
                    videoInputRef.current?.click();
                  }}
                >
                  {videoSupported ? "Video" : "Video (Gemini only)"}
                </fig-menu-item>
              </fig-menu>
              <fig-button
                type="button"
                variant="primary"
                disabled={!canSend}
                onClick={send}
              >
                {streaming ? "Sending…" : "Send"}
              </fig-button>
            </div>
          )}
        </div>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onImageChosen}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={onVideoChosen}
        />
      </div>
    </div>
  );
}
