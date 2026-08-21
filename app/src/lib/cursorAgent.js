const STORAGE_KEY = "shader-studio.cursorAgent.v1";

function isAgentId(value) {
  return typeof value === "string" && /^bc-[0-9a-f-]{8,}$/i.test(value);
}

/**
 * One Cloud Agent for the whole app, reused across shaders.
 * @returns {{ agentId: string, modelId: string } | null}
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
      return { agentId: parsed.agentId, modelId: parsed.modelId.trim() };
    }
  } catch {
    // Ignore malformed storage.
  }
  return null;
}

/** @param {{ agentId: string, modelId: string }} next */
export function saveCursorAgent(next) {
  if (!isAgentId(next?.agentId) || typeof next?.modelId !== "string") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      agentId: next.agentId,
      modelId: next.modelId.trim(),
    })
  );
}

export function clearCursorAgent() {
  localStorage.removeItem(STORAGE_KEY);
}

/** @param {{ provider?: string, id?: string }} model */
export function cursorAgentIdForModel(model) {
  if (model?.provider !== "cursor" || !model.id) return undefined;
  const stored = loadCursorAgent();
  if (stored?.modelId === model.id) return stored.agentId;
  return undefined;
}
