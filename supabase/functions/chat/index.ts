import { isAllowedModel, type Provider } from "./models.ts";
import { buildSystemPrompt } from "./prompt.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Attachment = {
  kind?: "image" | "video";
  name?: string;
  mimeType?: string;
  dataBase64?: string;
};

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: Attachment[];
};

type RequestBody = {
  provider?: string;
  model?: string;
  messages?: ChatMessage[];
  source?: string;
  kind?: string;
  fileName?: string;
  features?: { isAnimated?: boolean; usesMouse?: boolean };
  skills?: string;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function sseEncode(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function sseStreamFromUpstream(
  upstream: Response,
  extractDelta: (json: Record<string, unknown>) => string | null,
): Response {
  if (!upstream.ok || !upstream.body) {
    throw new Error(`Upstream error ${upstream.status}`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return new Response(
    new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(new TextEncoder().encode(sseEncode({ type: "done" })));
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const json = JSON.parse(data) as Record<string, unknown>;
            if (json.type === "error") {
              const err = json.error as { message?: string } | undefined;
              controller.enqueue(
                new TextEncoder().encode(
                  sseEncode({
                    type: "error",
                    message: err?.message || "Provider stream error",
                  }),
                ),
              );
              continue;
            }
            const delta = extractDelta(json);
            if (delta) {
              controller.enqueue(
                new TextEncoder().encode(sseEncode({ type: "delta", text: delta })),
              );
            }
          } catch {
            // skip malformed chunks
          }
        }
      },
      cancel() {
        reader.cancel();
      },
    }),
    {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  );
}

function validAttachments(attachments: Attachment[] | undefined): Attachment[] {
  if (!Array.isArray(attachments)) return [];
  return attachments.filter(
    (a) =>
      a &&
      typeof a.dataBase64 === "string" &&
      a.dataBase64.length > 0 &&
      typeof a.mimeType === "string" &&
      a.mimeType.length > 0,
  );
}

function assertProviderAttachments(provider: Provider, attachments: Attachment[]) {
  for (const attachment of attachments) {
    const kind = attachment.kind === "video" ? "video" : "image";
    if (kind === "video" && provider !== "gemini") {
      throw new Error("Video attachments are only supported with Gemini.");
    }
    if (kind === "image" && !attachment.mimeType!.startsWith("image/")) {
      throw new Error("Invalid image MIME type.");
    }
    if (kind === "video" && !attachment.mimeType!.startsWith("video/")) {
      throw new Error("Invalid video MIME type.");
    }
  }
}

function toOpenAIMessages(system: string, messages: ChatMessage[]) {
  return [
    { role: "system", content: system },
    ...messages.map((m) => {
      const attachments = validAttachments(m.attachments).filter(
        (a) => (a.kind || "image") === "image",
      );
      if (m.role !== "user" || attachments.length === 0) {
        return { role: m.role, content: m.content };
      }
      return {
        role: "user",
        content: [
          { type: "text", text: m.content || "Please use this image as context." },
          ...attachments.map((a) => ({
            type: "image_url",
            image_url: {
              url: `data:${a.mimeType};base64,${a.dataBase64}`,
            },
          })),
        ],
      };
    }),
  ];
}

function toAnthropicMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    const attachments = validAttachments(m.attachments).filter(
      (a) => (a.kind || "image") === "image",
    );
    if (m.role !== "user" || attachments.length === 0) {
      return { role: m.role, content: m.content };
    }
    return {
      role: "user",
      content: [
        {
          type: "text",
          text: m.content || "Please use this image as context.",
        },
        ...attachments.map((a) => ({
          type: "image",
          source: {
            type: "base64",
            media_type: a.mimeType,
            data: a.dataBase64,
          },
        })),
      ],
    };
  });
}

function toGeminiContents(messages: ChatMessage[]) {
  return messages.map((m) => {
    const attachments = validAttachments(m.attachments);
    const parts: Array<Record<string, unknown>> = [];
    if (m.content?.trim()) {
      parts.push({ text: m.content });
    } else if (attachments.length) {
      parts.push({ text: "Please use this media as context for the shader." });
    }
    for (const a of attachments) {
      parts.push({
        inline_data: {
          mime_type: a.mimeType,
          data: a.dataBase64,
        },
      });
    }
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });
}

async function streamOpenAI(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMessage[],
): Promise<Response> {
  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: toOpenAIMessages(system, messages),
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    throw new Error(text || `OpenAI error ${upstream.status}`);
  }

  return sseStreamFromUpstream(upstream, (json) => {
    const choices = json.choices as Array<{ delta?: { content?: string } }> | undefined;
    const delta = choices?.[0]?.delta?.content;
    return typeof delta === "string" && delta ? delta : null;
  });
}

async function streamAnthropic(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMessage[],
): Promise<Response> {
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      stream: true,
      system,
      messages: toAnthropicMessages(messages),
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    throw new Error(text || `Anthropic error ${upstream.status}`);
  }

  return sseStreamFromUpstream(upstream, (json) => {
    if (
      json.type === "content_block_delta" &&
      (json.delta as { type?: string; text?: string } | undefined)?.type ===
        "text_delta"
    ) {
      const text = (json.delta as { text?: string }).text;
      return typeof text === "string" && text ? text : null;
    }
    return null;
  });
}

async function streamGemini(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMessage[],
): Promise<Response> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${
      encodeURIComponent(model)
    }:streamGenerateContent?alt=sse`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: toGeminiContents(messages),
      generationConfig: {
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    throw new Error(text || `Gemini error ${upstream.status}`);
  }

  return sseStreamFromUpstream(upstream, (json) => {
    const candidates = json.candidates as
      | Array<{ content?: { parts?: Array<{ text?: string }> } }>
      | undefined;
    const parts = candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    const text = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
    return text || null;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const apiKey = req.headers.get("x-user-api-key")?.trim();
  if (!apiKey) {
    return jsonResponse(401, {
      error: "Missing x-user-api-key. Add your provider API key in Settings.",
    });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const provider = body.provider as Provider;
  const model = body.model?.trim() ?? "";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const source = typeof body.source === "string" ? body.source : "";
  const kind = typeof body.kind === "string" ? body.kind : "effect";
  const fileName = typeof body.fileName === "string" ? body.fileName : "main.ts";

  if (provider !== "openai" && provider !== "anthropic" && provider !== "gemini") {
    return jsonResponse(400, {
      error: "provider must be openai, anthropic, or gemini",
    });
  }
  if (!isAllowedModel(provider, model)) {
    return jsonResponse(400, { error: `Model not allowed: ${provider}/${model}` });
  }
  if (!source.trim()) {
    return jsonResponse(400, { error: "source is required" });
  }
  if (messages.length === 0) {
    return jsonResponse(400, { error: "messages is required" });
  }

  const skills = typeof body.skills === "string" ? body.skills : "";

  const system = buildSystemPrompt({
    source,
    kind,
    fileName,
    features: body.features,
    skills,
  });

  const history: ChatMessage[] = [];
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const attachments = validAttachments(m.attachments);
    const content = typeof m.content === "string" ? m.content : "";
    if (!content.trim() && attachments.length === 0) continue;
    history.push({
      role: m.role,
      content,
      attachments: attachments.length ? attachments : undefined,
    });
  }

  if (history.length === 0) {
    return jsonResponse(400, { error: "messages is required" });
  }

  try {
    const allAttachments = history.flatMap((m) => m.attachments || []);
    assertProviderAttachments(provider, allAttachments);

    if (provider === "openai") {
      return await streamOpenAI(apiKey, model, system, history);
    }
    if (provider === "anthropic") {
      return await streamAnthropic(apiKey, model, system, history);
    }
    return await streamGemini(apiKey, model, system, history);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(502, { error: message });
  }
});
