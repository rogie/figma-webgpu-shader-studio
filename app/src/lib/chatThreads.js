const STORAGE_KEY = "shader-studio.chatThreads.v1";
const MAX_MESSAGES_PER_THREAD = 80;

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
  const attachment = sanitizeAttachment(message.attachment);
  if (attachment) out.attachment = attachment;
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

/** @returns {Record<string, Array<{role: string, content: string, attachment?: object}>>} */
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
