const STORAGE_KEY = "shader-studio.cursorAgent.v1";

function isAgentId(value) {
  return typeof value === "string" && /^bc-[0-9a-f-]{8,}$/i.test(value);
}

function isRunId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function modelMatchesStored(model, storedModelId) {
  if (!storedModelId || !model?.id) return false;
  if (model.id === storedModelId) return true;
  return Array.isArray(model.aliases) && model.aliases.includes(storedModelId);
}

/**
 * One Cloud Agent for the whole app, reused across shaders.
 * @returns {{ agentId: string, modelId: string, runId?: string } | null}
 */
export function loadCursorAgent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      isAgentId(parsed.agentId) &&
      typeof parsed.modelId === "string" &&
      parsed.modelId.trim()
    ) {
      const stored = {
        agentId: parsed.agentId,
        modelId: parsed.modelId.trim(),
      };
      if (isRunId(parsed.runId)) stored.runId = parsed.runId.trim();
      return stored;
    }
  } catch {
    // Ignore malformed storage.
  }
  return null;
}

/** @param {{ agentId: string, modelId: string, runId?: string }} next */
export function saveCursorAgent(next) {
  if (!isAgentId(next?.agentId) || typeof next?.modelId !== "string") return;
  const stored = loadCursorAgent();
  const runId = isRunId(next.runId)
    ? next.runId.trim()
    : stored?.agentId === next.agentId
      ? stored.runId
      : undefined;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      agentId: next.agentId,
      modelId: next.modelId.trim(),
      ...(runId ? { runId } : {}),
    })
  );
}

export function clearCursorAgent() {
  localStorage.removeItem(STORAGE_KEY);
}

/** @param {{ provider?: string, id?: string, aliases?: string[] }} model */
export function cursorAgentIdForModel(model) {
  if (model?.provider !== "cursor" || !model.id) return undefined;
  const stored = loadCursorAgent();
  if (!stored) return undefined;
  if (modelMatchesStored(model, stored.modelId)) return stored.agentId;
  return undefined;
}
