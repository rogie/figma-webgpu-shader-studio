/**
 * Build provider-neutral history, attaching base64 media only to the current
 * user message. Persisted history intentionally contains metadata only.
 */
export function toApiMessages(messages, pendingAttachment) {
  return messages
    .filter((message) => {
      if (message.role !== "assistant") return true;
      return Boolean(String(message.content || "").trim());
    })
    .map((message, index, list) => {
      const isLast = index === list.length - 1;
      const api = {
        role: message.role,
        content: message.content,
      };
      if (
        isLast &&
        message.role === "user" &&
        pendingAttachment?.dataBase64
      ) {
        api.attachments = [
          {
            kind: pendingAttachment.kind,
            name: pendingAttachment.name,
            mimeType: pendingAttachment.mimeType,
            dataBase64: pendingAttachment.dataBase64,
          },
        ];
      } else if (message.attachment?.name) {
        api.content = message.content?.trim()
          ? message.content
          : `Attached ${message.attachment.kind || "image"}: ${message.attachment.name}`;
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
}) {
  return {
    provider,
    model,
    messages,
    source,
    kind,
    fileName,
    features,
    skills,
  };
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
          } else if (event.type === "done") {
            events.push({ type: "done" });
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
