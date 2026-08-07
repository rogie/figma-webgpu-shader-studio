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
  extractDelta: (
    json: Record<string, unknown>,
  ) => string | null | { text?: string | null; error?: string | null },
): Response {
  if (!upstream.ok || !upstream.body) {
    throw new Error(`Upstream error ${upstream.status}`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const encoder = new TextEncoder();

  const emitData = (
    data: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    if (!data || data === "[DONE]") return;
    try {
      const json = JSON.parse(data) as Record<string, unknown>;
      if (json.type === "error") {
        const err = json.error as { message?: string } | undefined;
        controller.enqueue(
          encoder.encode(
            sseEncode({
              type: "error",
              message: err?.message || "Provider stream error",
            }),
          ),
        );
        return;
      }
      const providerError = json.error as { message?: string } | undefined;
      if (
        providerError &&
        typeof providerError === "object" &&
        providerError.message
      ) {
        controller.enqueue(
          encoder.encode(
            sseEncode({
              type: "error",
              message: providerError.message,
            }),
          ),
        );
        return;
      }
      const extracted = extractDelta(json);
      const text =
        typeof extracted === "string" ? extracted : extracted?.text;
      const error =
        typeof extracted === "object" && extracted ? extracted.error : null;
      if (error) {
        controller.enqueue(
          encoder.encode(sseEncode({ type: "error", message: error })),
        );
      }
      if (text) {
        controller.enqueue(
          encoder.encode(sseEncode({ type: "delta", text })),
        );
      }
    } catch {
      // Skip malformed provider chunks.
    }
  };

  const emitLines = (
    input: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
    flush = false,
  ) => {
    buffer += input;
    const lines = buffer.split("\n");
    buffer = flush ? "" : (lines.pop() ?? "");
    if (flush && lines.at(-1) === "") lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      emitData(trimmed.slice(5).trim(), controller);
    }
    if (flush && buffer.trim().startsWith("data:")) {
      emitData(buffer.trim().slice(5).trim(), controller);
      buffer = "";
    }
  };

  let cancelled = false;
  return new Response(
    new ReadableStream({
      start(controller) {
        void (async () => {
          try {
            while (!cancelled) {
              const { done, value } = await reader.read();
              if (done) {
                emitLines(decoder.decode(), controller, true);
                controller.enqueue(encoder.encode(sseEncode({ type: "done" })));
                controller.close();
                return;
              }
              emitLines(decoder.decode(value, { stream: true }), controller);
            }
          } catch (error) {
            if (cancelled) return;
            const message =
              error instanceof Error
                ? error.message
                : "Provider stream disconnected";
            controller.enqueue(
              encoder.encode(
                sseEncode({
                  type: "error",
                  message,
                }),
              ),
            );
            controller.close();
          }
        })();
      },
      cancel() {
        cancelled = true;
        return reader.cancel();
      },
    }),
    {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
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
        inlineData: {
          mimeType: a.mimeType,
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
    const choices = json.choices as
      | Array<{
          delta?: { content?: string };
          finish_reason?: string | null;
        }>
      | undefined;
    const choice = choices?.[0];
    if (choice?.finish_reason === "length") {
      return {
        error: "The response reached the model output limit. Ask it to continue.",
      };
    }
    const delta = choice?.delta?.content;
    return typeof delta === "string" && delta ? delta : null;
  });
}

async function streamAnthropic(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMessage[],
): Promise<Response> {
  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: 32768,
    stream: true,
    system,
    messages: toAnthropicMessages(messages),
  };
  if (
    /^claude-(?:fable|opus|sonnet)-5/.test(model) ||
    model === "claude-opus-4-8" ||
    model === "claude-sonnet-4-6"
  ) {
    requestBody.output_config = { effort: "low" };
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
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
    if (
      json.type === "message_delta" &&
      (json.delta as { stop_reason?: string } | undefined)?.stop_reason ===
        "max_tokens"
    ) {
      return {
        error: "The response reached the model output limit. Ask it to continue.",
      };
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

  // Keep enough output room for a full module, but cap hidden reasoning so the
  // first visible token does not take minutes to arrive.
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: 65536,
  };
  if (/gemini-(2\.5|3)/.test(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: 2048 };
  }

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: toGeminiContents(messages),
      generationConfig,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    throw new Error(text || `Gemini error ${upstream.status}`);
  }

  return sseStreamFromUpstream(upstream, (json) => {
    const promptFeedback = json.promptFeedback as
      | { blockReason?: string; blockReasonMessage?: string }
      | undefined;
    if (promptFeedback?.blockReason) {
      return {
        error:
          promptFeedback.blockReasonMessage ||
          `Gemini blocked the request (${promptFeedback.blockReason}).`,
      };
    }
    const candidates = json.candidates as
      | Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
        finishReason?: string;
        finishMessage?: string;
      }>
      | undefined;
    const candidate = candidates?.[0];
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
      if (candidate?.finishReason) {
        return {
          error:
            candidate.finishMessage ||
            `Gemini returned no text (${candidate.finishReason}).`,
        };
      }
      return null;
    }
    const text = parts
      .filter((part) => !part?.thought)
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
    if (text) {
      return {
        text,
        error:
          candidate?.finishReason === "MAX_TOKENS"
            ? "The response reached the model output limit. Ask it to continue."
            : null,
      };
    }
    if (candidate?.finishReason) {
      return {
        error:
          candidate.finishMessage ||
          `Gemini returned reasoning but no visible text (${candidate.finishReason}).`,
      };
    }
    return null;
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
