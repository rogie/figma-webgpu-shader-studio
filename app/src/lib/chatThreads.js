const STORAGE_KEY = "shader-studio.chatThreads.v1";
const MAX_MESSAGES_PER_THREAD = 80;
export const CHAT_THREAD_TRANSFER_EVENT = "shader-studio:chat-thread-transfer";

function sanitizePaste(paste) {
  if (!paste || typeof paste !== "object") return null;
  if (typeof paste.text !== "string" || !paste.text.trim()) return null;
  const language = typeof paste.language === "string" ? paste.language : "text";
  const out = { text: paste.text, language };
  if (typeof paste.label === "string" && paste.label) out.label = paste.label;
  if (typeof paste.title === "string" && paste.title) out.title = paste.title;
  if (Array.isArray(paste.nested)) {
    const nested = paste.nested.filter((id) => typeof id === "string" && id);
    if (nested.length) out.nested = nested;
  }
  return out;
}

function sanitizeAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") return undefined;
  const kind = attachment.kind === "video" ? "video" : "image";
  const name = typeof attachment.name === "string" ? attachment.name : kind;
  const mimeType =
    typeof attachment.mimeType === "string" ? attachment.mimeType : "";
  return { kind, name, mimeType };
}

function sanitizeMessage(message) {
  if (!message || typeof message !== "object") return null;
  if (message.role !== "user" && message.role !== "assistant") return null;
  if (typeof message.content !== "string") return null;
  const out = {
    role: message.role,
    content: message.content,
  };
  if (message.mode === "plan") out.mode = "plan";
  if (typeof message.planId === "string") out.planId = message.planId;
  if (typeof message.buildPlanId === "string") {
    out.buildPlanId = message.buildPlanId;
  }
  if (message.planApplied === true) out.planApplied = true;
  if (message.planDismissed === true) out.planDismissed = true;
  if (message.role === "assistant" && message.applied === true) {
    out.applied = true;
  }
  const attachments = (
    Array.isArray(message.attachments)
      ? message.attachments
      : message.attachment
        ? [message.attachment]
        : []
  )
    .map(sanitizeAttachment)
    .filter(Boolean);
  if (attachments.length) out.attachments = attachments;
  const pastes = (Array.isArray(message.pastes) ? message.pastes : [])
    .map(sanitizePaste)
    .filter(Boolean);
  if (pastes.length) out.pastes = pastes;
  return out;
}

function sanitizeThreads(threads) {
  if (!threads || typeof threads !== "object") return {};
  const out = {};
  for (const [threadId, messages] of Object.entries(threads)) {
    if (!Array.isArray(messages)) continue;
    const cleaned = messages
      .map(sanitizeMessage)
      .filter(Boolean)
      .slice(-MAX_MESSAGES_PER_THREAD);
    if (cleaned.length) out[threadId] = cleaned;
  }
  return out;
}

function sanitizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map(sanitizeMessage)
    .filter(Boolean);
}

function messageFingerprint(message) {
  return JSON.stringify(message);
}

/**
 * Returns the shortest merged sequence that preserves each thread's ordering.
 * Exact overlap is shared, while repeated messages already present in either
 * thread retain their original multiplicity.
 */
export function mergeChatThreadMessages(sourceMessages, targetMessages) {
  const source = sanitizeMessages(sourceMessages);
  const target = sanitizeMessages(targetMessages);
  const sourceKeys = source.map(messageFingerprint);
  const targetKeys = target.map(messageFingerprint);
  const overlap = Array.from({ length: source.length + 1 }, () =>
    Array(target.length + 1).fill(0),
  );

  for (let sourceIndex = source.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
    for (let targetIndex = target.length - 1; targetIndex >= 0; targetIndex -= 1) {
      overlap[sourceIndex][targetIndex] =
        sourceKeys[sourceIndex] === targetKeys[targetIndex]
          ? overlap[sourceIndex + 1][targetIndex + 1] + 1
          : Math.max(
              overlap[sourceIndex + 1][targetIndex],
              overlap[sourceIndex][targetIndex + 1],
            );
    }
  }

  const merged = [];
  let sourceIndex = 0;
  let targetIndex = 0;
  while (sourceIndex < source.length && targetIndex < target.length) {
    if (sourceKeys[sourceIndex] === targetKeys[targetIndex]) {
      merged.push(source[sourceIndex]);
      sourceIndex += 1;
      targetIndex += 1;
    } else if (
      overlap[sourceIndex + 1][targetIndex] >=
      overlap[sourceIndex][targetIndex + 1]
    ) {
      merged.push(source[sourceIndex]);
      sourceIndex += 1;
    } else {
      merged.push(target[targetIndex]);
      targetIndex += 1;
    }
  }
  return [
    ...merged,
    ...source.slice(sourceIndex),
    ...target.slice(targetIndex),
  ];
}

/** @returns {Record<string, Array<{role: string, content: string, attachments?: object[]}>>} */
export function loadChatThreads(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    return sanitizeThreads(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** @param {Record<string, Array<object>>} threads */
export function saveChatThreads(
  threads,
  storage = globalThis.localStorage,
) {
  const sanitized = sanitizeThreads(threads);
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch (error) {
    console.warn("Failed to persist chat threads", error);
  }
  return sanitized;
}

export function migrateChatThreadKey(
  sourceThreadId,
  targetThreadId,
  storage = globalThis.localStorage,
) {
  const threads = loadChatThreads(storage);
  if (
    !/^preset:draft:.+/.test(sourceThreadId) ||
    !/^cloud:.+/.test(targetThreadId)
  ) {
    return threads;
  }
  if (!threads[sourceThreadId]) {
    notifyChatThreadTransfer(sourceThreadId, targetThreadId, true, threads);
    return threads;
  }
  const next = {
    ...threads,
    [targetThreadId]: mergeChatThreadMessages(
      threads[sourceThreadId],
      threads[targetThreadId],
    ),
  };
  delete next[sourceThreadId];
  const saved = saveChatThreads(next, storage);
  notifyChatThreadTransfer(sourceThreadId, targetThreadId, true, saved);
  return saved;
}

export function copyChatThreadKey(
  sourceThreadId,
  targetThreadId,
  storage = globalThis.localStorage,
) {
  const threads = loadChatThreads(storage);
  if (
    !sourceThreadId ||
    !targetThreadId ||
    sourceThreadId === targetThreadId
  ) {
    return threads;
  }
  if (!threads[sourceThreadId]) {
    notifyChatThreadTransfer(sourceThreadId, targetThreadId, false, threads);
    return threads;
  }
  const saved = saveChatThreads(
    {
      ...threads,
      [targetThreadId]: mergeChatThreadMessages(
        threads[sourceThreadId],
        threads[targetThreadId],
      ),
    },
    storage,
  );
  notifyChatThreadTransfer(sourceThreadId, targetThreadId, false, saved);
  return saved;
}

function notifyChatThreadTransfer(
  sourceThreadId,
  targetThreadId,
  removeSource,
  threads,
) {
  if (
    typeof globalThis.dispatchEvent !== "function" ||
    typeof globalThis.CustomEvent !== "function"
  ) {
    return;
  }
  globalThis.dispatchEvent(
    new CustomEvent(CHAT_THREAD_TRANSFER_EVENT, {
      detail: {
        sourceThreadId,
        targetThreadId,
        removeSource,
        targetMessages: threads[targetThreadId] || [],
      },
    }),
  );
}

export function clearChatThread(
  threadId,
  storage = globalThis.localStorage,
) {
  const threads = loadChatThreads(storage);
  delete threads[threadId];
  saveChatThreads(threads, storage);
  return threads;
}
