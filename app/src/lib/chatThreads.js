const STORAGE_KEY = "shader-studio.chatThreads.v1";
const MAX_MESSAGES_PER_THREAD = 80;

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

/** @returns {Record<string, Array<{role: string, content: string, attachments?: object[]}>>} */
export function loadChatThreads() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return sanitizeThreads(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** @param {Record<string, Array<object>>} threads */
export function saveChatThreads(threads) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(sanitizeThreads(threads))
    );
  } catch (error) {
    console.warn("Failed to persist chat threads", error);
  }
}

export function clearChatThread(threadId) {
  const threads = loadChatThreads();
  delete threads[threadId];
  saveChatThreads(threads);
  return threads;
}
