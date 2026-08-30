import {
  Fragment,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildAppliedModuleCheckpoint,
  chatApplyTargetStatus,
  extractAutoApplyModuleSource,
  extractModuleSource,
  formatChatError,
  isPlanMode,
  splitAssistantContent,
  validateModuleSource,
} from "../lib/chatApply.js";
import { ANON_YOU_LABEL } from "../lib/shaderLibrary.js";
import {
  attachmentMeta,
  fileToChatAttachment,
  providerSupportsChatVideo,
} from "../lib/chatAttachments.js";
import {
  DEFAULT_CHAT_MODEL,
  chatModelValue,
  findChatModel,
  findSelectableChatModel,
  groupsForAvailableProviderModels,
  reconcileAvailableChatModel,
} from "../lib/chatModels.js";
import {
  CHAT_THREAD_TRANSFER_EVENT,
  loadChatThreads,
  mergeChatThreadMessages,
  saveChatThreads,
} from "../lib/chatThreads.js";
import {
  isPlanDocument,
  loadLocalPlan,
  planDocumentSubject,
  removeLocalPlan,
  saveLocalPlan,
} from "../lib/chatPlans.js";
import {
  getProviderKey,
  subscribeProviderKeys,
} from "../lib/providerKeys.js";
import {
  bindCursorAgentToSource,
  cursorAgentIdForModel,
  saveCursorAgent,
} from "../lib/cursorAgent.js";
import { toApiMessages } from "../lib/chatPayload.js";
import { splitComposerPaste } from "../lib/pastedText.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import {
  listAvailableProviderModels,
  streamChat,
} from "../services/chat.js";
import {
  downloadShaderPlan,
  uploadShaderPlan,
} from "../services/shaders.js";
import { measurePerf, perfNow } from "../runtime/perf.js";
import SendIcon from "./SendIcon.jsx";
import StopIcon from "./StopIcon.jsx";
import UndoIcon from "./UndoIcon.jsx";
import PastedText from "./PastedText.jsx";
import UserAvatar from "./UserAvatar.jsx";
import MarkdownProse from "./MarkdownProse.jsx";
import PlanIcon from "./PlanIcon.jsx";
import PlanMarkdownBlock from "./PlanMarkdownBlock.jsx";
import PlanReadyAction from "./PlanReadyAction.jsx";
import StreamingCodeBlock from "./StreamingCodeBlock.jsx";
import { useOverflowFade } from "../hooks/useOverflowFade.js";
import "../chat.css";

const MODEL_STORAGE_KEY = "shader-studio.chatModel";
const MODE_STORAGE_KEY = "shader-studio.chatMode";
const MAX_UNDO = 12;
const MAX_AUTO_HEAL_ATTEMPTS = 2;
const TOOLTIP_DELAY_MS = 500;

function assistantPhaseLabel(message) {
  switch (message?.phase) {
    case "starting":
      return "Starting Cursor agent…";
    case "thinking":
      return "Thinking…";
    case "responding":
      return "Responding…";
    case "planning":
      return "Writing plan…";
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

function loadSavedMode() {
  return localStorage.getItem(MODE_STORAGE_KEY) === "plan"
    ? "plan"
    : "agent";
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

function rememberCursorAgent(event, model, { threadId, source } = {}) {
  if (model?.provider !== "cursor") return;
  if (typeof event?.agentId === "string" && event.agentId) {
    saveCursorAgent({
      agentId: event.agentId,
      modelId: model.id,
      runId: event.runId,
      threadId,
      source,
    });
  }
}

function pruneEmptyAssistants(thread) {
  return thread.filter((message) => !isEmptyAssistant(message));
}

function chatActivityLabel(messages) {
  const latest = messages[messages.length - 1];
  if (!latest) return "New chat activity";
  if (latest.role !== "assistant") return "New message";
  if (latest.pending) {
    if (latest.phase === "starting") return "Starting Cursor agent…";
    if (latest.mode === "plan" || latest.phase === "planning") {
      return "Writing plan…";
    }
    if (latest.phase === "writing") return "Writing main.ts…";
    if (latest.phase === "applying") return "Applying main.ts…";
    if (latest.phase === "repairing") return "Repairing main.ts…";
    return "AI is responding…";
  }
  if (latest.applied) return "Applied main.ts";
  return "New AI response";
}

function useStableEvent(handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  return useCallback((...args) => handlerRef.current(...args), []);
}

const ChatComposer = memo(function ChatComposer({
  canSend,
  draft,
  hasKey,
  imageInputRef,
  mode,
  model,
  modelControlRef,
  modelGroups,
  onAttachmentChosen,
  onPromptPaste,
  onSend,
  onStop,
  setDraft,
  setMode,
  streaming,
  videoSupported,
}) {
  const actionButtonRef = useRef(null);
  const actionTooltipTimerRef = useRef(0);
  const [showActionTooltip, setShowActionTooltip] = useState(false);
  const hideActionTooltip = useCallback(() => {
    window.clearTimeout(actionTooltipTimerRef.current);
    actionTooltipTimerRef.current = 0;
    setShowActionTooltip(false);
  }, []);
  const showActionTooltipDelayed = useCallback(() => {
    if (!streaming) return;
    window.clearTimeout(actionTooltipTimerRef.current);
    actionTooltipTimerRef.current = window.setTimeout(() => {
      actionTooltipTimerRef.current = 0;
      setShowActionTooltip(true);
    }, TOOLTIP_DELAY_MS);
  }, [streaming]);

  useEffect(() => {
    if (!streaming) {
      hideActionTooltip();
      return;
    }
    if (actionButtonRef.current?.matches(":hover, :focus")) {
      showActionTooltipDelayed();
    }
  }, [hideActionTooltip, showActionTooltipDelayed, streaming]);

  useEffect(
    () => () => window.clearTimeout(actionTooltipTimerRef.current),
    [],
  );

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <>
      <fig-ai-prompt>
        <fig-input-text
          class="chat-input"
          multiline=""
          autoresize=""
          value={draft}
          placeholder={
            mode === "plan"
              ? "Describe what you want to plan…"
              : "Ask for changes..."
          }
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
            <fig-tooltip text="Plan mode">
              <fig-button
                type="toggle"
                variant="ghost"
                icon="true"
                selected={mode === "plan"}
                aria-label={
                  mode === "plan" ? "Disable plan mode" : "Enable plan mode"
                }
                disabled={streaming ? "" : undefined}
                onClick={() =>
                  setMode((current) =>
                    current === "plan" ? "agent" : "plan"
                  )
                }
              >
                <PlanIcon />
              </fig-button>
            </fig-tooltip>
            <fig-tooltip text={`Model: ${model.label}`}>
              <fig-select
                ref={modelControlRef}
                class="chat-model-select"
                variant="ghost"
                label="Model"
                position="top left"
                value={chatModelValue(model)}
                disabled={streaming ? "" : undefined}
              >
                <fig-select-options>
                  {modelGroups.map((group) => (
                    <Fragment key={group.label}>
                      <fig-separator label={group.label} />
                      {group.models.map((entry) => (
                        <fig-select-option
                          key={chatModelValue(entry)}
                          value={chatModelValue(entry)}
                        >
                          {entry.label}
                        </fig-select-option>
                      ))}
                    </Fragment>
                  ))}
                </fig-select-options>
              </fig-select>
            </fig-tooltip>
            <fig-tooltip
              text={streaming ? "Stop" : "Send"}
              show={streaming && showActionTooltip ? "" : undefined}
            >
              <fig-button
                ref={actionButtonRef}
                type="button"
                variant={streaming ? "ghost" : "primary"}
                icon="true"
                aria-label={streaming ? "Stop" : "Send"}
                disabled={!streaming && !canSend ? "" : undefined}
                onClick={streaming ? onStop : onSend}
                onPointerEnter={showActionTooltipDelayed}
                onPointerLeave={hideActionTooltip}
                onFocus={showActionTooltipDelayed}
                onBlur={hideActionTooltip}
              >
                {streaming ? <StopIcon /> : <SendIcon />}
              </fig-button>
            </fig-tooltip>
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
    </>
  );
});

const ChatPane = forwardRef(function ChatPane(
  {
    sourceRef,
    kind,
    fileName,
    shaderKey,
    planOwnerId,
    planShaderId,
    featuresRef,
    user,
    onApplySource,
    onAppliedCheckpoint,
    onOpenSettings,
    onNotice,
    onCanClearChange,
    hidden = false,
  },
  ref
) {
  const [model, setModel] = useState(loadSavedModel);
  const [mode, setMode] = useState(loadSavedMode);
  const [draft, setDraft] = useState("");
  const [threads, setThreads] = useState(loadChatThreads);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [keyVersion, setKeyVersion] = useState(0);
  const [availableProviderModels, setAvailableProviderModels] = useState({});
  const [undoCount, setUndoCount] = useState(0);
  const [attachments, setAttachments] = useState([]);
  const [zoomedAttachment, setZoomedAttachment] = useState(null);
  const [latestActivity, setLatestActivity] = useState("");
  const abortRef = useRef(null);
  const listRef = useRef(null);
  const listFadeRef = useOverflowFade(listRef);
  const followingLatestRef = useRef(true);
  const undoStackRef = useRef([]);
  const modelControlRef = useRef(null);
  const imageInputRef = useRef(null);
  const pendingAttachmentsRef = useRef(null);
  const attachmentZoomRef = useRef(null);
  const activeRequestRef = useRef(null);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const threadId = messageKey(shaderKey);
  const activeThreadIdRef = useRef(threadId);
  activeThreadIdRef.current = threadId;
  const messages = useMemo(
    () => pruneEmptyAssistants(threads[threadId] || []),
    [threads, threadId]
  );

  useEffect(() => {
    const transferThread = (event) => {
      const {
        sourceThreadId,
        targetThreadId,
        removeSource,
        targetMessages = [],
      } = event.detail || {};
      if (!sourceThreadId || !targetThreadId) return;
      setThreads((current) => {
        const sourceMessages = current[sourceThreadId] || [];
        const next = {
          ...current,
          [targetThreadId]: mergeChatThreadMessages(
            sourceMessages,
            current[targetThreadId] || targetMessages
          ),
        };
        if (removeSource) delete next[sourceThreadId];
        return next;
      });
    };
    window.addEventListener(CHAT_THREAD_TRANSFER_EVENT, transferThread);
    return () =>
      window.removeEventListener(CHAT_THREAD_TRANSFER_EVENT, transferThread);
  }, []);
  const openaiApiKey = useMemo(
    () => getProviderKey("openai"),
    [keyVersion]
  );
  const anthropicApiKey = useMemo(
    () => getProviderKey("anthropic"),
    [keyVersion]
  );
  const geminiApiKey = useMemo(
    () => getProviderKey("gemini"),
    [keyVersion]
  );
  const grokApiKey = useMemo(
    () => getProviderKey("grok"),
    [keyVersion]
  );
  const cursorApiKey = useMemo(
    () => getProviderKey("cursor"),
    [keyVersion]
  );
  const modelGroups = useMemo(
    () => groupsForAvailableProviderModels(availableProviderModels),
    [availableProviderModels]
  );
  const selectableModels = useMemo(
    () => modelGroups.flatMap((group) => group.models),
    [modelGroups]
  );
  const apiKey = useMemo(
    () => getProviderKey(model.provider),
    [model.provider, keyVersion]
  );
  const hasKey = Boolean(apiKey);
  const videoSupported = providerSupportsChatVideo(model.provider);
  const canSend =
    hasKey && Boolean(draft.trim() || attachments.length) && !streaming;
  const planningActivity = Boolean(
    streaming &&
      messages.at(-1)?.role === "assistant" &&
      messages.at(-1)?.pending &&
      messages.at(-1)?.mode === "plan"
  );
  const contextActivity =
    latestActivity || (planningActivity ? "Writing plan…" : "");
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

  // The newest generated module that never made it into the editor, either
  // because another shader was open or the source moved while the agent ran.
  let pendingApply = null;
  if (!streaming) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (
        message.role !== "assistant" ||
        message.pending ||
        isPlanMode(message.mode)
      ) {
        continue;
      }
      const { source, incomplete } = splitAssistantContent(message.content);
      if (!source) continue;
      if (!incomplete && !message.applied && source !== sourceRef.current) {
        pendingApply = { message, source };
      }
      break;
    }
  }
  let pendingPlan = null;
  if (!streaming) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (
        message.role !== "assistant" ||
        !isPlanMode(message.mode) ||
        !isPlanDocument(message.content)
      ) {
        continue;
      }
      if (!message.planApplied && !message.planDismissed) pendingPlan = message;
      break;
    }
  }

  useEffect(() => subscribeProviderKeys(() => setKeyVersion((n) => n + 1)), []);

  useEffect(() => {
    setAvailableProviderModels({});
    const controller = new AbortController();
    const providerKeys = [
      ["openai", openaiApiKey],
      ["anthropic", anthropicApiKey],
      ["gemini", geminiApiKey],
      ["grok", grokApiKey],
      ["cursor", cursorApiKey],
    ];
    for (const [provider, providerKey] of providerKeys) {
      if (!providerKey) continue;
      listAvailableProviderModels(provider, providerKey, {
        signal: controller.signal,
      })
        .then((models) => {
          setAvailableProviderModels((current) => ({
            ...current,
            [provider]: models,
          }));
        })
        .catch(() => {
          // Keep the curated fallback when provider discovery is unavailable.
        });
    }
    return () => controller.abort();
  }, [openaiApiKey, anthropicApiKey, geminiApiKey, grokApiKey, cursorApiKey]);

  useEffect(() => {
    if (Object.keys(availableProviderModels).length === 0) return;
    const next = reconcileAvailableChatModel(
      model,
      modelGroups,
      availableProviderModels
    );
    if (next.provider !== model.provider || next.id !== model.id) {
      setModel(next);
      setError("");
    }
  }, [availableProviderModels, model, modelGroups]);

  useEffect(() => {
    localStorage.setItem(
      MODEL_STORAGE_KEY,
      JSON.stringify({ provider: model.provider, id: model.id })
    );
  }, [model]);

  useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    const hydratePlan = async () => {
      let markdown = loadLocalPlan(threadId);
      if (planOwnerId && planShaderId) {
        try {
          const cloudPlan = await downloadShaderPlan(planOwnerId, planShaderId);
          if (cloudPlan.trim()) {
            markdown = cloudPlan;
            removeLocalPlan(threadId);
          }
        } catch {
          // A shader may not have a plan.md yet; retain any local fallback.
        }
      }
      if (cancelled || !isPlanDocument(markdown)) return;
      setThreads((prev) => {
        const current = prev[threadId] || [];
        if (current.some((message) => message.pending)) return prev;
        if (
          current.some(
            (message) =>
              message.role === "assistant" &&
              message.mode === "plan" &&
              message.content === markdown
          )
        ) {
          return prev;
        }
        return {
          ...prev,
          [threadId]: [
            ...current,
            {
              role: "assistant",
              mode: "plan",
              planId: crypto.randomUUID(),
              content: markdown,
            },
          ],
        };
      });
    };
    hydratePlan();
    return () => {
      cancelled = true;
    };
  }, [planOwnerId, planShaderId, threadId]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveChatThreads(threads), 400);
    return () => window.clearTimeout(timer);
  }, [threads]);

  useEffect(
    () => () => {
      saveChatThreads(threadsRef.current);
    },
    []
  );

  useEffect(() => {
    setThreads((prev) => {
      const current = prev[threadId];
      if (!current?.some(isEmptyAssistant)) return prev;
      return { ...prev, [threadId]: pruneEmptyAssistants(current) };
    });
    followingLatestRef.current = true;
    setLatestActivity("");
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [threadId]);

  useEffect(() => {
    const request = activeRequestRef.current;
    if (
      !request ||
      request.threadId === threadId ||
      request.notifiedAway
    ) {
      return;
    }
    request.notifiedAway = true;
    onNotice?.(
      request.mode === "plan"
        ? `Agent is still writing a plan for ${request.fileName}.`
        : `Agent is still working on ${request.fileName}. Changes will only apply while that shader is open.`,
      { brand: true }
    );
  }, [threadId, onNotice]);

  useEffect(() => {
    onCanClearChange?.(messages.length > 0);
  }, [messages.length, onCanClearChange]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const onScroll = () => {
      const distanceFromBottom =
        list.scrollHeight - list.scrollTop - list.clientHeight;
      const isFollowing = distanceFromBottom <= 24;
      followingLatestRef.current = isFollowing;
      if (isFollowing) setLatestActivity("");
    };
    list.addEventListener("scroll", onScroll, { passive: true });
    return () => list.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (followingLatestRef.current) {
      list.scrollTop = list.scrollHeight;
      setLatestActivity("");
    } else {
      setLatestActivity(chatActivityLabel(messages));
    }
  }, [messages]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const zoomMessageAttachment = (event) => {
      if (event.target.closest(".fig-attachment-remove")) return;
      const tile = event.target.closest("fig-chat-message fig-attachment");
      if (!tile) return;
      const previewUrl =
        tile.getAttribute("src") || tile.getAttribute("data-preview");
      if (!previewUrl) return;
      setZoomedAttachment({
        name: tile.getAttribute("name") || "Attachment",
        kind: tile.getAttribute("data-kind") === "video" ? "video" : "image",
        previewUrl,
        source: "message",
      });
    };
    list.addEventListener("click", zoomMessageAttachment);
    return () => list.removeEventListener("click", zoomMessageAttachment);
  }, []);

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
    const attachmentList = pendingAttachmentsRef.current;
    if (!attachmentList) return;
    const zoomAttachment = (event) => {
      if (event.target.closest(".fig-attachment-remove")) return;
      const tile = event.target.closest("fig-attachment");
      if (!tile) return;
      const attachment = attachments[Number(tile.getAttribute("value"))];
      if (attachment?.previewUrl) setZoomedAttachment(attachment);
    };
    attachmentList.addEventListener("click", zoomAttachment);
    return () => attachmentList.removeEventListener("click", zoomAttachment);
  }, [attachments]);

  useEffect(() => {
    const dialog = attachmentZoomRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [zoomedAttachment]);

  useEffect(() => {
    if (!zoomedAttachment) return;
    if (zoomedAttachment.source === "message") return;
    if (attachments.includes(zoomedAttachment)) return;
    setZoomedAttachment(null);
  }, [attachments, zoomedAttachment]);

  useEffect(() => {
    const control = modelControlRef.current;
    if (!control) return;
    const onChange = (event) => {
      const detail = event.detail;
      const value =
        detail && typeof detail === "object" && "value" in detail
          ? detail.value
          : (detail ?? event.target?.value);
      const next = findSelectableChatModel(selectableModels, value);
      if (next) {
        setModel(next);
        setError("");
      }
    };
    control.addEventListener("change", onChange);
    return () => {
      control.removeEventListener("change", onChange);
    };
  }, [selectableModels]);

  const updateThread = (updater) => {
    setThreads((prev) => {
      const current = prev[threadId] || [];
      return { ...prev, [threadId]: updater(current) };
    });
  };

  const markPlanApplied = (planId) => {
    if (!planId) return;
    updateThread((current) =>
      current.map((entry) =>
        entry.planId === planId ? { ...entry, planApplied: true } : entry
      )
    );
  };

  const persistCompletedPlan = async (markdown) => {
    if (!isPlanDocument(markdown)) return;
    saveLocalPlan(threadId, markdown);
    if (!planOwnerId || !planShaderId) return;
    try {
      await uploadShaderPlan({
        ownerId: planOwnerId,
        shaderId: planShaderId,
        markdown,
      });
      removeLocalPlan(threadId);
    } catch (planError) {
      console.warn("Failed to upload plan.md", planError);
      onNotice?.("Plan saved on this device; cloud sync failed.", {
        error: true,
      });
    }
  };

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const undoLastApply = () => {
    const previous = undoStackRef.current.pop();
    if (previous == null) return;
    setUndoCount(undoStackRef.current.length);
    onApplySource(previous);
    onNotice?.("Reverted last chat edit.");
  };

  const applyPendingUpdate = () => {
    if (!pendingApply) return;
    const check = validateModuleSource(pendingApply.source);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    undoStackRef.current.push(sourceRef.current);
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift();
    }
    setUndoCount(undoStackRef.current.length);
    onApplySource(pendingApply.source);
    const { prose, summary, description } = splitAssistantContent(
      pendingApply.message.content
    );
    onAppliedCheckpoint?.({
      source: pendingApply.source,
      summary: summary || prose,
      description,
    });
    markPlanApplied(pendingApply.message.buildPlanId);
    updateThread((current) =>
      current.map((entry) =>
        entry === pendingApply.message ? { ...entry, applied: true } : entry
      )
    );
    onNotice?.("Applied the generated main.ts.");
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

  const send = async (options = {}) => {
    const textOverride =
      typeof options.textOverride === "string" ? options.textOverride : null;
    const requestTextOverride =
      typeof options.requestTextOverride === "string"
        ? options.requestTextOverride
        : null;
    const modeOverride =
      options.modeOverride === "plan" || options.modeOverride === "agent"
        ? options.modeOverride
        : null;
    const requestPlanId =
      typeof options.planId === "string" ? options.planId : null;
    const requestAttachments =
      options.ignoreAttachments === true ? [] : attachments;
    const text = String(textOverride ?? draft).trim();
    if ((!text && requestAttachments.length === 0) || streaming) return;
    const requestMode = modeOverride ?? mode;

    if (!isSupabaseConfigured) {
      setError("Supabase is not configured for the chat proxy.");
      return;
    }
    if (!hasKey) {
      setError("Add your API key in Settings before chatting.");
      return;
    }
    if (
      requestAttachments.some((attachment) => attachment.kind === "video") &&
      !providerSupportsChatVideo(model.provider)
    ) {
      setError("Video attachments are only supported with Gemini.");
      return;
    }

    let skills;
    try {
      skills = (await import("../lib/chatSkills.js")).getChatSkillContext(
        requestMode
      );
    } catch (skillError) {
      setError(skillError.message || "Unable to load shader authoring guidance.");
      return;
    }

    setError("");
    if (textOverride == null) setDraft("");
    const currentAttachments = requestAttachments;
    if (options.ignoreAttachments !== true) setAttachments([]);

    const split = text
      ? await splitComposerPaste({ text })
      : { content: "", pastes: [] };
    const pastes = split.pastes || [];
    const content =
      pastes.length > 0
        ? split.content
        : text ||
          (currentAttachments.length
            ? `Attached: ${currentAttachments
                .map((attachment) => attachment.name)
                .join(", ")}`
            : "");

    const userMessage = {
      role: "user",
      mode: requestMode,
      content,
      ...(pastes.length ? { pastes } : {}),
      attachments: currentAttachments.map(attachmentMeta),
      attachmentPreviews: currentAttachments.map(
        (attachment) => attachment.previewUrl || null
      ),
    };
    const assistantMessage = {
      role: "assistant",
      mode: requestMode,
      planId: requestMode === "plan" ? crypto.randomUUID() : undefined,
      buildPlanId: requestPlanId || undefined,
      content: "",
      pending: true,
      phase: requestMode === "plan" ? "planning" : "waiting",
    };

    updateThread((current) => [...current, userMessage, assistantMessage]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const historyUserMessage = requestTextOverride
      ? { ...userMessage, content: requestTextOverride }
      : userMessage;
    const history = toApiMessages(
      [...messages, historyUserMessage],
      currentAttachments
    );

    let assembled = "";
    let sawError = false;
    let sawDone = false;
    let lastApplied = null;
    let didPushUndo = false;
    const baselineSource = sourceRef.current;
    const requestThreadId = threadId;
    const requestFileName = fileName;
    activeRequestRef.current = {
      threadId: requestThreadId,
      fileName: requestFileName,
      mode: requestMode,
      notifiedAway: false,
    };
    const features = featuresRef.current;
    let lastStreamUiAt = 0;
    let blockedApplyReason = null;

    const notifyBlockedApply = () => {
      if (!blockedApplyReason) return;
      const message =
        blockedApplyReason === "different-shader"
          ? `Agent finished changes for ${requestFileName}. They were not applied because another shader is open. Reopen ${requestFileName} to review the generated main.ts.`
          : `Agent finished changes for ${requestFileName}, but its source changed while the agent was working. Review the generated main.ts before applying it.`;
      onNotice?.(message, { brand: true });
      blockedApplyReason = null;
    };

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
          mode: requestMode,
          planId: last.planId,
          buildPlanId: last.buildPlanId,
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

    const checkpointAppliedResponse = (text, appliedSource) => {
      const checkpoint = buildAppliedModuleCheckpoint(text, appliedSource);
      if (checkpoint) onAppliedCheckpoint?.(checkpoint);
    };

    const tryApplyModule = (moduleSource) => {
      if (!moduleSource || moduleSource === lastApplied) return null;
      if (moduleSource === baselineSource && !didPushUndo) return null;
      const validationStartedAt = perfNow();
      const check = validateModuleSource(moduleSource);
      measurePerf("chat.validateModule", validationStartedAt);
      if (!check.ok) return null;
      const targetStatus = chatApplyTargetStatus({
        requestShaderKey: requestThreadId,
        activeShaderKey: activeThreadIdRef.current,
        baselineSource,
        currentSource: sourceRef.current,
      });
      if (targetStatus !== "current") {
        blockedApplyReason = targetStatus;
        lastApplied = moduleSource;
        return null;
      }
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
      bindCursorAgentToSource(model, {
        threadId: requestThreadId,
        source: moduleSource,
      });
      markAssistantApplied();
      markPlanApplied(requestPlanId);
      return moduleSource;
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
            buildPlanId: requestPlanId || undefined,
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
          skills,
          cursorAgentId: cursorAgentIdForModel(model, {
            threadId: requestThreadId,
            source: brokenSource,
          }),
          signal: controller.signal,
        })) {
          rememberCursorAgent(event, model, {
            threadId: requestThreadId,
            source: brokenSource,
          });
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
          const now = performance.now();
          if (now - lastStreamUiAt < 50) continue;
          lastStreamUiAt = now;
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
        const appliedSource = check.ok ? tryApplyModule(candidate) : null;
        const applied = Boolean(appliedSource);
        finishAssistant(repairedText, { applied });
        if (appliedSource) {
          checkpointAppliedResponse(repairedText, appliedSource);
          return "applied";
        }
        if (blockedApplyReason) {
          notifyBlockedApply();
          return "deferred";
        }

        brokenSource = candidate || brokenSource;
        reason = check.reason;
        repairHistory = [
          ...repairHistory,
          { role: "user", content: repairPrompt },
          { role: "assistant", content: repairedText },
        ];
      }
      return null;
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
        skills,
        mode: requestMode,
        cursorAgentId: cursorAgentIdForModel(model, {
          threadId: requestThreadId,
          source: baselineSource,
        }),
        signal: controller.signal,
      })) {
        rememberCursorAgent(event, model, {
          threadId: requestThreadId,
          source: baselineSource,
        });
        if (event.type === "delta") {
          assembled += event.text;
          const snapshot = assembled;
          const now = performance.now();
          const writingModule =
            requestMode === "agent" &&
            Boolean(extractModuleSource(snapshot, { allowIncomplete: true }));
          if (now - lastStreamUiAt >= 50) {
            lastStreamUiAt = now;
            updateThread((current) => {
              const next = [...current];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: snapshot,
                  pending: true,
                  applied: Boolean(last.applied),
                  phase:
                    requestMode === "plan"
                      ? "planning"
                      : writingModule
                        ? "writing"
                        : "responding",
                };
              }
              return next;
            });
          }
        } else if (event.type === "status") {
          updateLastAssistant({
            phase:
              event.phase === "starting"
                ? "starting"
                : requestMode === "plan"
                  ? "planning"
                  : event.phase,
          });
        } else if (event.type === "done") {
          sawDone = true;
          updateLastAssistant({
            phase: requestMode === "plan" ? "planning" : "validating",
          });
        } else if (event.type === "error") {
          sawError = true;
          setError(event.message || "Chat failed.");
          break;
        }
      }

      const responseComplete =
        sawDone && !sawError && !controller.signal.aborted;
      if (isPlanMode(requestMode)) {
        finishAssistant(assembled.trim() ? assembled : "");
        if (responseComplete && isPlanDocument(assembled)) {
          await persistCompletedPlan(assembled);
        } else if (!sawError && !controller.signal.aborted && !assembled.trim()) {
          setError(
            `${model.label} returned an empty reply. Try again or choose another model.`
          );
        }
      } else {
        const candidate = extractAutoApplyModuleSource(assembled, {
          streamCompleted: responseComplete,
          aborted: controller.signal.aborted,
        });
        const appliedSource = candidate ? tryApplyModule(candidate) : null;
        const applied = Boolean(appliedSource);

        if (sawError || !assembled.trim()) {
          finishAssistant(assembled.trim() ? assembled : "", { applied });
          if (!sawError && !controller.signal.aborted) {
            setError(
              `${model.label} returned an empty reply. Try again or choose another model.`
            );
          }
        } else {
          finishAssistant(assembled, { applied });
        }

        if (appliedSource) {
          checkpointAppliedResponse(assembled, appliedSource);
          onNotice?.("Code updated from chat.");
        } else if (blockedApplyReason) {
          notifyBlockedApply();
        } else if (
          candidate &&
          !sawError &&
          !controller.signal.aborted
        ) {
          const check = validateModuleSource(candidate);
          if (!check.ok && check.autoHealable) {
            onNotice?.("Syntax error detected. Repairing code…");
            const healed = await autoHealSyntaxError(candidate, check.reason);
            if (healed === "applied") {
              onNotice?.("Syntax error fixed automatically.");
            } else if (healed !== "deferred") {
              onNotice?.(`Automatic repair failed: ${check.reason}`, {
                error: true,
              });
            }
          } else if (!check.ok) {
            onNotice?.(check.reason, { error: true });
          }
        }
      }
    } catch (err) {
      const aborted = err?.name === "AbortError" || controller.signal.aborted;
      let appliedSource = null;
      if (!aborted) {
        const candidate = extractAutoApplyModuleSource(assembled);
        appliedSource = candidate ? tryApplyModule(candidate) : null;
      }
      if (!aborted) {
        setError(err.message || String(err));
      }
      finishAssistant(assembled, { applied: Boolean(appliedSource) });
      if (appliedSource) {
        checkpointAppliedResponse(assembled, appliedSource);
        onNotice?.("Code updated from chat.");
      } else if (blockedApplyReason) {
        notifyBlockedApply();
      }
    } finally {
      abortRef.current = null;
      if (activeRequestRef.current?.threadId === requestThreadId) {
        activeRequestRef.current = null;
      }
      setStreaming(false);
    }
  };

  const buildPendingPlan = () => {
    if (!pendingPlan || streaming || !hasKey) return;
    const planId = pendingPlan.planId || crypto.randomUUID();
    if (!pendingPlan.planId) {
      updateThread((current) =>
        current.map((entry) =>
          entry === pendingPlan ? { ...entry, planId } : entry
        )
      );
    }
    setMode("agent");
    send({
      textOverride: "Build the current plan.md.",
      requestTextOverride: `Implement the following plan in the current ${fileName} module. Follow the plan completely and return the complete updated module using the required response format.

<plan>
${pendingPlan.content}
</plan>`,
      modeOverride: "agent",
      planId,
      ignoreAttachments: true,
    });
  };

  const dismissPendingPlan = () => {
    if (!pendingPlan) return;
    updateThread((current) =>
      current.map((entry) =>
        entry === pendingPlan ? { ...entry, planDismissed: true } : entry
      )
    );
  };

  const jumpToLatest = () => {
    followingLatestRef.current = true;
    setLatestActivity("");
    requestAnimationFrame(() => {
      const list = listRef.current;
      if (list) {
        list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      }
    });
  };

  const handleSend = useStableEvent(send);
  const handlePromptPaste = useStableEvent(onPromptPaste);
  const handleAttachmentChosen = useStableEvent(onAttachmentChosen);

  return (
    <div className="code-chat" hidden={hidden}>
      <div className="chat-messages" ref={listFadeRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>
              Iterate on this shader. Chat includes the current module source
              and Figma shader authoring skills. History for this shader is
              saved on this device.
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
                {message.content && (
                  <div className="chat-prose chat-prose-plain">
                    {message.content}
                  </div>
                )}
                {(message.pastes || []).map((paste, pasteIndex) => (
                  <PastedText
                    key={`${paste.language}:${pasteIndex}`}
                    text={paste.text}
                    language={paste.language}
                    label={paste.label}
                    nested={paste.nested}
                  />
                ))}
                {messageAttachments.length > 0 && (
                  <fig-attachments aria-label="Message attachments">
                    {messageAttachments.map((messageAttachment, attachmentIndex) => {
                      const preview = attachmentPreviews[attachmentIndex];
                      return (
                        <fig-attachment
                          key={`${messageAttachment.name}:${attachmentIndex}`}
                          src={
                            messageAttachment.kind === "image" && preview
                              ? preview
                              : undefined
                          }
                          name={messageAttachment.name || "Attachment"}
                          value={String(attachmentIndex)}
                          removable="false"
                          data-kind={messageAttachment.kind}
                          data-preview={preview || undefined}
                          dangerouslySetInnerHTML={{ __html: "" }}
                        />
                      );
                    })}
                  </fig-attachments>
                )}
                <UserAvatar
                  name={user ? userName : ANON_YOU_LABEL}
                  tooltip={user ? userName : ANON_YOU_LABEL}
                  src={userAvatarUrl}
                  isYou
                />
              </fig-chat-message>
            );
          }
          if (
            isPlanMode(message.mode) &&
            isPlanDocument(message.content, {
              allowIncomplete: Boolean(message.pending),
            })
          ) {
            const subject = planDocumentSubject(message.content);
            return (
              <fig-chat-message key={index} from="agent">
                <PlanMarkdownBlock
                  source={message.content}
                  pending={Boolean(message.pending)}
                  applied={Boolean(message.planApplied)}
                />
                {!message.pending && !message.planApplied && (
                  <div className="chat-prose">
                    {subject
                      ? `The plan for ${subject} is complete.`
                      : "The plan is complete."}{" "}
                    Review it and hit Build plan when you’re ready, or tell me
                    what you’d like changed.
                  </div>
                )}
              </fig-chat-message>
            );
          }
          if (isPlanMode(message.mode)) {
            return (
              <fig-chat-message key={index} from="agent">
                {message.content ? (
                  <MarkdownProse className="chat-prose">
                    {message.content}
                  </MarkdownProse>
                ) : (
                  message.pending && (
                    <fig-shimmer aria-label={assistantPhaseLabel(message)}>
                      <span>{assistantPhaseLabel(message)}</span>
                    </fig-shimmer>
                  )
                )}
              </fig-chat-message>
            );
          }
          const { prose, source, incomplete } = splitAssistantContent(
            message.content
          );
          const applied = Boolean(
            !incomplete &&
            (message.applied ||
              (!message.pending && source && source === sourceRef.current))
          );
          return (
            <fig-chat-message
              key={index}
              from="agent"
            >
              {prose && (
                <MarkdownProse className="chat-prose">{prose}</MarkdownProse>
              )}
              <StreamingCodeBlock
                source={source}
                pending={Boolean(message.pending)}
                applied={applied}
                incomplete={incomplete}
              />
              {(applied || (message.pending && !source)) && (
                <div className="chat-code-note">
                  {applied ? (
                    <span>Updated module applied to editor.</span>
                  ) : (
                    <fig-shimmer aria-label={assistantPhaseLabel(message)}>
                      <span>{assistantPhaseLabel(message)}</span>
                    </fig-shimmer>
                  )}
                  {index === undoMessageIndex && applied && (
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
            {formatChatError(error, { provider: model.provider })}
          </p>
        )}
        <div className="chat-composer">
          {(attachments.length > 0 ||
            !hasKey ||
            pendingApply ||
            pendingPlan ||
            contextActivity) && (
            <fig-ai-context key="context" aria-label="Prompt context">
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
              {!hasKey && (
                <hstack className="chat-context-action">
                  <span>Connect provider</span>
                  <fig-button
                    type="button"
                    variant="secondary"
                    onClick={onOpenSettings}
                  >
                    Add API key
                  </fig-button>
                </hstack>
              )}
              {pendingApply && (
                <hstack className="chat-context-action">
                  <span>Generated main.ts wasn't applied</span>
                  <fig-button
                    type="button"
                    variant="secondary"
                    onClick={applyPendingUpdate}
                  >
                    Apply
                  </fig-button>
                </hstack>
              )}
              {pendingPlan && !pendingApply && (
                <PlanReadyAction
                  buildDisabled={!hasKey}
                  onBuild={buildPendingPlan}
                  onDismiss={dismissPendingPlan}
                />
              )}
              {contextActivity && (
                <div className="chat-latest-activity" aria-live="polite">
                  <fig-shimmer>
                    <span>{contextActivity}</span>
                  </fig-shimmer>
                  {latestActivity && (
                    <fig-button
                      type="button"
                      variant="secondary"
                      size="small"
                      onClick={jumpToLatest}
                    >
                      View latest
                    </fig-button>
                  )}
                </div>
              )}
            </fig-ai-context>
          )}
          <ChatComposer
            key="composer"
            canSend={canSend}
            draft={draft}
            hasKey={hasKey}
            imageInputRef={imageInputRef}
            mode={mode}
            model={model}
            modelControlRef={modelControlRef}
            modelGroups={modelGroups}
            onAttachmentChosen={handleAttachmentChosen}
            onPromptPaste={handlePromptPaste}
            onSend={handleSend}
            onStop={stop}
            setDraft={setDraft}
            setMode={setMode}
            streaming={streaming}
            videoSupported={videoSupported}
          />
          {zoomedAttachment && (
            <dialog
              ref={attachmentZoomRef}
              className="chat-attachment-zoom"
              aria-label={zoomedAttachment.name || "Attachment"}
              onClose={() => setZoomedAttachment(null)}
              onClick={(event) => {
                // Clicks land on the dialog itself only outside the media.
                if (event.target === event.currentTarget) {
                  attachmentZoomRef.current?.close();
                }
              }}
            >
              {zoomedAttachment.kind === "video" ? (
                <video
                  className="chat-attachment-zoom-media"
                  src={zoomedAttachment.previewUrl}
                  controls
                />
              ) : (
                <img
                  className="chat-attachment-zoom-media"
                  src={zoomedAttachment.previewUrl}
                  alt={zoomedAttachment.name || "Attachment"}
                />
              )}
            </dialog>
          )}
        </div>
      </div>
    </div>
  );
});

export default memo(ChatPane);
