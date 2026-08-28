/** Reattach extracted pastes so the model still sees the code. */
export function userContentForApi(message) {
  const pastes = Array.isArray(message?.pastes) ? message.pastes : [];
  const fences = pastes
    .filter((paste) => typeof paste?.text === "string" && paste.text.trim())
    .map((paste) => {
      const lang = paste.language && paste.language !== "text" ? paste.language : "";
      return `\`\`\`${lang}\n${paste.text}\n\`\`\``;
    });
  const body = String(message?.content || "").trim();
  if (fences.length && body) return `${body}\n\n${fences.join("\n\n")}`;
  if (fences.length) return fences.join("\n\n");
  return message?.content;
}

const COMPLETE_ASSISTANT_MODULE_RE =
  /```(?:typescript|ts|tsx|javascript|js|jsx)?[ \t]*\n[\s\S]*?```/gi;
const OPEN_ASSISTANT_MODULE_RE =
  /```(?:typescript|ts|tsx|javascript|js|jsx)?[ \t]*\n[\s\S]*$/gi;
const OMITTED_MODULE_NOTE =
  "[Earlier generated module omitted. The Current module source supplied with this request is authoritative.]";

/**
 * Keep prior discussion while removing stale generated modules. The complete
 * live source is supplied separately on every request.
 */
export function assistantContentForApi(message) {
  const content = String(message?.content || "");
  COMPLETE_ASSISTANT_MODULE_RE.lastIndex = 0;
  OPEN_ASSISTANT_MODULE_RE.lastIndex = 0;
  const withoutCompleteModules = content.replace(
    COMPLETE_ASSISTANT_MODULE_RE,
    ""
  );
  const withoutModules = withoutCompleteModules.replace(
    OPEN_ASSISTANT_MODULE_RE,
    ""
  );
  if (withoutModules === content) return message?.content;
  const prose = withoutModules.replace(/\n{3,}/g, "\n\n").trim();
  return prose ? `${prose}\n\n${OMITTED_MODULE_NOTE}` : OMITTED_MODULE_NOTE;
}

/**
 * Build provider-neutral history, attaching base64 media only to the current
 * user message. Persisted history intentionally contains metadata only.
 */
export function toApiMessages(messages, pendingAttachments = []) {
  const currentAttachments = (
    Array.isArray(pendingAttachments)
      ? pendingAttachments
      : [pendingAttachments]
  ).filter((attachment) => attachment?.dataBase64);

  return messages
    .filter((message) => {
      if (message.role !== "assistant") return true;
      return Boolean(String(message.content || "").trim());
    })
    .map((message, index, list) => {
      const isLast = index === list.length - 1;
      const api = {
        role: message.role,
        content:
          message.role === "user"
            ? userContentForApi(message)
            : assistantContentForApi(message),
      };
      if (
        isLast &&
        message.role === "user" &&
        currentAttachments.length > 0
      ) {
        api.attachments = currentAttachments.map((attachment) => ({
          kind: attachment.kind,
          name: attachment.name,
          mimeType: attachment.mimeType,
          dataBase64: attachment.dataBase64,
        }));
      } else {
        const persistedAttachments =
          message.attachments ||
          (message.attachment ? [message.attachment] : []);
        if (persistedAttachments.length === 0) return api;
        api.content = String(api.content || "").trim()
          ? api.content
          : `Attached: ${persistedAttachments
              .map((attachment) => attachment.name)
              .join(", ")}`;
      }
      return api;
    });
}

export function buildChatRequest({
  provider,
  model,
  messages,
  source,
  kind,
  fileName,
  features,
  skills,
  mode = "agent",
  cursorAgentId,
}) {
  const request = {
    provider,
    model,
    messages,
    source,
    kind,
    fileName,
    features,
    skills,
    mode: mode === "plan" ? "plan" : "agent",
  };
  if (typeof cursorAgentId === "string" && cursorAgentId) {
    request.cursorAgentId = cursorAgentId;
  }
  return request;
}

export function chatStreamCompletionEvent(provider, { sawDone, sawError } = {}) {
  if (sawDone || sawError) return null;
  if (provider === "cursor") {
    return {
      type: "error",
      message: "Cursor stream ended before the agent finished. Try again.",
    };
  }
  return { type: "done" };
}

export function createChatSseParser() {
  let buffer = "";

  return {
    push(text, { flush = false } = {}) {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = flush ? "" : (lines.pop() ?? "");
      const events = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;
        try {
          const event = JSON.parse(data);
          if (event.type === "delta" && typeof event.text === "string") {
            events.push({ type: "delta", text: event.text });
          } else if (
            event.type === "status" &&
            (event.phase === "thinking" ||
              event.phase === "responding" ||
              event.phase === "starting")
          ) {
            events.push({ type: "status", phase: event.phase });
          } else if (
            event.type === "cursor-agent" &&
            typeof event.agentId === "string" &&
            event.agentId
          ) {
            const next = { type: "cursor-agent", agentId: event.agentId };
            if (typeof event.runId === "string" && event.runId) {
              next.runId = event.runId;
            }
            events.push(next);
          } else if (event.type === "done") {
            const done = { type: "done" };
            if (typeof event.agentId === "string" && event.agentId) {
              done.agentId = event.agentId;
            }
            if (typeof event.runId === "string" && event.runId) {
              done.runId = event.runId;
            }
            events.push(done);
          } else if (event.type === "error") {
            events.push({
              type: "error",
              message: event.message || "Chat stream error",
            });
          }
        } catch {
          // Ignore malformed SSE data.
        }
      }

      return events;
    },
  };
}
