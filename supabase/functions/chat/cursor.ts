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

const CURSOR_API = "https://api.cursor.com/v1";
const HEARTBEAT_MS = 10_000;
const CURSOR_WORKSPACE_RULES = [
  "Workspace rules:",
  "- This is an empty cloud workspace with no useful project files.",
  "- Do not use shell or filesystem tools.",
  "- You may work on different shaders across turns. Always treat the Current module source in this prompt as the only shader that exists. Ignore previous modules.",
  "- When updating the module, follow the system prompt's tagged <summary> and <description> contract, then return one complete typescript fenced code block.",
].join("\n");

export function isCursorAgentId(value: unknown): value is string {
  return typeof value === "string" && /^bc-[0-9a-f-]{8,}$/i.test(value);
}

export function cursorModelLabel(id: string, displayName?: string): string {
  const named = displayName?.trim();
  if (named) return named;
  if (id === "auto" || id === "auto-smart") return "Auto";
  return id;
}

export type CursorModelOption = {
  provider: "cursor";
  id: string;
  label: string;
  aliases?: string[];
};

function uniqueAliases(values: string[], id: string): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const value of values) {
    if (!value || value === id || seen.has(value)) continue;
    seen.add(value);
    aliases.push(value);
  }
  return aliases;
}

/** Drop alias rows and merge auto / auto-smart so the picker has one Auto. */
export function collapseCursorModelOptions(
  models: CursorModelOption[],
): CursorModelOption[] {
  const byId = new Map(models.map((model) => [model.id, model]));
  const skip = new Set<string>();

  for (const model of models) {
    for (const alias of model.aliases || []) {
      if (alias !== model.id && byId.has(alias)) skip.add(alias);
    }
  }

  const auto = byId.get("auto");
  const smart = byId.get("auto-smart");
  if (auto && smart) {
    skip.add("auto");
    const aliases = uniqueAliases(
      [...(smart.aliases || []), "auto", ...(auto.aliases || [])],
      smart.id,
    );
    smart.aliases = aliases.length ? aliases : undefined;
  }

  const kept = models.filter((model) => !skip.has(model.id));
  const usedLabels = new Map<string, string>();
  for (const model of kept) {
    const key = model.label.toLowerCase();
    const firstId = usedLabels.get(key);
    if (!firstId) {
      usedLabels.set(key, model.id);
      continue;
    }
    if (firstId !== model.id) model.label = `${model.label} (${model.id})`;
  }
  return kept.sort((a, b) => {
    const byLabel = a.label.localeCompare(b.label, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    return byLabel || a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

/** Map GET /v1/models into picker options. Canonical ids only; aliases stay on the option. */
export function parseCursorModels(payload: unknown): CursorModelOption[] {
  const record = payload && typeof payload === "object"
    ? payload as { items?: unknown; data?: unknown }
    : {};
  const raw = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.data)
      ? record.data
      : [];
  const seen = new Set<string>();
  const models: CursorModelOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as {
      id?: unknown;
      displayName?: unknown;
      name?: unknown;
      aliases?: unknown;
    };
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const displayName =
      typeof item.displayName === "string"
        ? item.displayName
        : typeof item.name === "string"
          ? item.name
          : "";
    const aliases = uniqueAliases(
      Array.isArray(item.aliases)
        ? item.aliases.filter((alias): alias is string => typeof alias === "string")
        : [],
      id,
    );
    models.push({
      provider: "cursor",
      id,
      label: cursorModelLabel(id, displayName),
      ...(aliases.length ? { aliases } : {}),
    });
  }
  return collapseCursorModelOptions(models);
}

export function explainCursorError(status: number, bodyText: string): string {
  let code = "";
  let message = bodyText.trim();
  try {
    const json = JSON.parse(bodyText) as {
      error?: { code?: string; message?: string } | string;
      code?: string;
      message?: string;
    };
    if (typeof json.error === "string") message = json.error;
    else if (json.error && typeof json.error === "object") {
      code = json.error.code || "";
      message = json.error.message || message;
    }
    if (typeof json.code === "string") code = code || json.code;
    if (typeof json.message === "string") message = json.message;
  } catch {
    // Keep the raw body.
  }

  if (code === "repository_required") {
    return "This Cursor API key cannot create no-repo agents. Use a user key from cursor.com/dashboard/api.";
  }
  if (code === "feature_unavailable" || code === "plan_required") {
    return "Cloud agents are not available on this Cursor plan.";
  }
  if (code === "usage_limit_exceeded") {
    return "Cursor usage limit exceeded. Check your Cursor plan at cursor.com/dashboard, or switch provider.";
  }
  if (code === "agent_busy") {
    return "Cursor agent is busy. Wait for the current reply to finish.";
  }
  if (status === 401 || status === 403) {
    return "Cursor API key is invalid. Update it in Settings.";
  }
  return message || `Cursor error ${status}`;
}

export function isCursorAgentMissing(status: number, bodyText: string): boolean {
  if (status === 404 || status === 410) return true;
  return /archived|not_found|agent_not_found|deleted/i.test(bodyText);
}

export function runResultText(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  const record = payload as { run?: unknown; result?: unknown };
  const result = record.result ??
    (record.run && typeof record.run === "object"
      ? (record.run as { result?: unknown }).result
      : undefined);
  if (typeof result === "string") return result;
  if (result && typeof result === "object" &&
    typeof (result as { text?: unknown }).text === "string"
  ) {
    return (result as { text: string }).text;
  }
  return "";
}

export function extractAgentAndRun(
  payload: unknown,
  fallbackAgentId?: string,
): { agentId: string; runId: string } {
  const record = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  const agent = record.agent && typeof record.agent === "object"
    ? record.agent as Record<string, unknown>
    : record;
  const run = record.run && typeof record.run === "object"
    ? record.run as Record<string, unknown>
    : null;
  const agentId =
    (typeof agent.id === "string" && agent.id) ||
    fallbackAgentId ||
    (typeof run?.agentId === "string" ? run.agentId : "");
  const runId =
    (run && typeof run.id === "string" && run.id) ||
    (typeof agent.latestRunId === "string" && agent.latestRunId) ||
    (typeof record.latestRunId === "string" && record.latestRunId) ||
    "";
  if (!isCursorAgentId(agentId) || !runId) {
    throw new Error("Cursor did not return an agent and run id.");
  }
  return { agentId, runId };
}

export function buildCursorPromptText(
  system: string,
  messages: ChatMessage[],
): string {
  const history = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const label = message.role === "assistant" ? "Assistant" : "User";
      const content = String(message.content || "").trim() || "(empty)";
      return `${label}:\n${content}`;
    })
    .join("\n\n");
  return [system.trim(), CURSOR_WORKSPACE_RULES, "Current Shader Studio thread:", history]
    .filter(Boolean)
    .join("\n\n");
}

export function cursorPromptImages(messages: ChatMessage[]) {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  return (lastUser?.attachments || [])
    .filter((attachment) =>
      attachment &&
      attachment.kind !== "video" &&
      typeof attachment.dataBase64 === "string" &&
      attachment.dataBase64 &&
      typeof attachment.mimeType === "string" &&
      attachment.mimeType.startsWith("image/")
    )
    .slice(0, 5)
    .map((attachment) => ({
      data: attachment.dataBase64,
      mimeType: attachment.mimeType,
    }));
}

export type CursorMappedEvent =
  | { type: "delta"; text: string }
  | { type: "status"; phase: "thinking" | "responding" | "starting" }
  | { type: "error"; message: string }
  | { type: "result"; text: string }
  | { type: "keepalive" }
  | { type: "done" };

export function mapCursorStreamEvent(
  eventName: string,
  payload: Record<string, unknown> | null,
): CursorMappedEvent | null {
  const name = eventName || "message";
  if (name === "assistant") {
    const text = typeof payload?.text === "string" ? payload.text : "";
    return text ? { type: "delta", text } : null;
  }
  if (name === "thinking" || name === "tool_call" || name === "heartbeat") {
    return { type: "status", phase: "thinking" };
  }
  if (name === "status") {
    const status = typeof payload?.status === "string" ? payload.status : "";
    if (
      status === "FINISHED" ||
      status === "ERROR" ||
      status === "CANCELLED" ||
      status === "EXPIRED"
    ) {
      return { type: "keepalive" };
    }
    return { type: "status", phase: "thinking" };
  }
  if (name === "result") {
    const text = typeof payload?.text === "string" ? payload.text : "";
    return text ? { type: "result", text } : { type: "keepalive" };
  }
  if (name === "error") {
    const message =
      (typeof payload?.message === "string" && payload.message) ||
      (typeof payload?.code === "string" && payload.code) ||
      "Cursor stream error";
    return { type: "error", message };
  }
  if (name === "done") return { type: "done" };
  if (name === "interaction_update") {
    const updateType = payload?.type;
    if (updateType === "tool-call-started" || updateType === "step-started") {
      return { type: "status", phase: "thinking" };
    }
    return { type: "keepalive" };
  }
  return { type: "keepalive" };
}

export function consumeCursorSse(
  buffer: string,
  chunk: string,
  flush = false,
): { rest: string; events: Array<{ event: string; data: string }> } {
  const parts = (buffer + chunk).split("\n\n");
  const rest = flush ? "" : (parts.pop() ?? "");
  const events: Array<{ event: string; data: string }> = [];
  for (const block of parts) {
    if (!block.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) {
      if (event === "heartbeat" || event === "done") {
        events.push({ event, data: "{}" });
      }
      continue;
    }
    events.push({ event, data: dataLines.join("\n") });
  }
  return { rest, events };
}

function sseEncode(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function promptBody(system: string, messages: ChatMessage[]) {
  const images = cursorPromptImages(messages);
  const prompt: Record<string, unknown> = {
    text: buildCursorPromptText(system, messages),
  };
  if (images.length) prompt.images = images;
  return prompt;
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return explainCursorError(response.status, text);
}

async function createAgent(
  apiKey: string,
  model: string,
  mode: "agent" | "plan",
  system: string,
  messages: ChatMessage[],
): Promise<{ agentId: string; runId: string }> {
  const response = await fetch(`${CURSOR_API}/agents`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      name: "Shader Studio",
      model: { id: model },
      mode,
      prompt: promptBody(system, messages),
    }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return extractAgentAndRun(await response.json());
}

async function createRun(
  apiKey: string,
  agentId: string,
  mode: "agent" | "plan",
  system: string,
  messages: ChatMessage[],
): Promise<{ agentId: string; runId: string }> {
  const response = await fetch(`${CURSOR_API}/agents/${agentId}/runs`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      mode,
      prompt: promptBody(system, messages),
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    const error = new Error(explainCursorError(response.status, bodyText));
    (error as Error & { missing?: boolean }).missing =
      isCursorAgentMissing(response.status, bodyText);
    throw error;
  }
  let payload: unknown = {};
  try {
    payload = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    throw new Error("Cursor follow-up returned invalid JSON.");
  }
  return extractAgentAndRun(payload, agentId);
}

async function fetchRunResult(
  apiKey: string,
  agentId: string,
  runId: string,
): Promise<string> {
  const response = await fetch(
    `${CURSOR_API}/agents/${agentId}/runs/${runId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!response.ok) return "";
  try {
    return runResultText(await response.json());
  } catch {
    return "";
  }
}

export function streamCursorChat(options: {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  mode: "agent" | "plan";
  agentId?: string;
  corsHeaders: Record<string, string>;
  signal?: AbortSignal;
}): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        const emit = (payload: unknown) => {
          controller.enqueue(encoder.encode(sseEncode(payload)));
        };
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        const stopHeartbeat = () => {
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = undefined;
        };
        const startHeartbeat = (phase: "starting" | "thinking") => {
          stopHeartbeat();
          emit({ type: "status", phase });
          heartbeat = setInterval(() => {
            try {
              emit({ type: "status", phase });
            } catch {
              stopHeartbeat();
            }
          }, HEARTBEAT_MS);
        };

        void (async () => {
          try {
            startHeartbeat("starting");
            let agentId = options.agentId;
            let runId = "";
            if (agentId && isCursorAgentId(agentId)) {
              try {
                const followUp = await createRun(
                  options.apiKey,
                  agentId,
                  options.mode,
                  options.system,
                  options.messages,
                );
                agentId = followUp.agentId;
                runId = followUp.runId;
              } catch (error) {
                const missing = Boolean(
                  (error as Error & { missing?: boolean }).missing,
                );
                if (!missing) throw error;
                const created = await createAgent(
                  options.apiKey,
                  options.model,
                  options.mode,
                  options.system,
                  options.messages,
                );
                agentId = created.agentId;
                runId = created.runId;
              }
            } else {
              const created = await createAgent(
                options.apiKey,
                options.model,
                options.mode,
                options.system,
                options.messages,
              );
              agentId = created.agentId;
              runId = created.runId;
            }

            emit({ type: "cursor-agent", agentId });
            startHeartbeat("thinking");

            const stream = await fetch(
              `${CURSOR_API}/agents/${agentId}/runs/${runId}/stream`,
              {
                headers: {
                  Authorization: `Bearer ${options.apiKey}`,
                  Accept: "text/event-stream",
                },
                signal: options.signal,
              },
            );
            if (!stream.ok || !stream.body) {
              if (stream.status === 410) {
                const fallback = await fetchRunResult(
                  options.apiKey,
                  agentId,
                  runId,
                );
                if (fallback) emit({ type: "delta", text: fallback });
                emit({ type: "done", agentId });
                controller.close();
                return;
              }
              throw new Error(await readError(stream));
            }

            stopHeartbeat();
            const reader = stream.body.getReader();
            let buffer = "";
            let accumulated = "";
            let pendingResult = "";
            let sawError = false;

            while (true) {
              if (options.signal?.aborted) {
                await reader.cancel();
                break;
              }
              const { done, value } = await reader.read();
              const { rest, events } = consumeCursorSse(
                buffer,
                done ? decoder.decode() : decoder.decode(value, { stream: true }),
                done,
              );
              buffer = rest;
              for (const event of events) {
                let payload: Record<string, unknown> | null = null;
                if (event.data) {
                  try {
                    payload = JSON.parse(event.data) as Record<string, unknown>;
                  } catch {
                    payload = null;
                  }
                }
                const mapped = mapCursorStreamEvent(event.event, payload);
                if (!mapped) continue;
                if (mapped.type === "delta") {
                  accumulated += mapped.text;
                  emit({ type: "delta", text: mapped.text });
                } else if (mapped.type === "status") {
                  emit({ type: "status", phase: mapped.phase });
                } else if (mapped.type === "result") {
                  pendingResult = mapped.text;
                } else if (mapped.type === "error") {
                  sawError = true;
                  emit({ type: "error", message: mapped.message });
                }
              }
              if (done) break;
            }

            if (!sawError && !accumulated.trim()) {
              const fallback = pendingResult ||
                await fetchRunResult(options.apiKey, agentId, runId);
              if (fallback) emit({ type: "delta", text: fallback });
            }
            if (!sawError) emit({ type: "done", agentId });
            controller.close();
          } catch (error) {
            if (options.signal?.aborted) {
              controller.close();
              return;
            }
            const message = error instanceof Error
              ? error.message
              : "Cursor stream disconnected";
            try {
              emit({ type: "error", message });
            } catch {
              // Client already gone.
            }
            controller.close();
          } finally {
            stopHeartbeat();
          }
        })();
      },
      cancel() {
        // The fetch uses the request signal from Shader Studio.
      },
    }),
    {
      headers: {
        ...options.corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    },
  );
}
