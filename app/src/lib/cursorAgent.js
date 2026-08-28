const LEGACY_STORAGE_KEY = "shader-studio.cursorAgent.v1";
const STORAGE_KEY = "shader-studio.cursorAgents.v2";
const DEFAULT_BINDING_KEY = "__default__";

function isAgentId(value) {
  return typeof value === "string" && /^bc-[0-9a-f-]{8,}$/i.test(value);
}

function isRunId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeThreadId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sourceFingerprint(source) {
  if (typeof source !== "string") return undefined;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source.length}:${(hash >>> 0).toString(16)}`;
}

function modelMatchesStored(model, storedModelId) {
  if (!storedModelId || !model?.id) return false;
  if (model.id === storedModelId) return true;
  return Array.isArray(model.aliases) && model.aliases.includes(storedModelId);
}

function normalizeBinding(value) {
  if (
    !value ||
    !isAgentId(value.agentId) ||
    typeof value.modelId !== "string" ||
    !value.modelId.trim()
  ) {
    return null;
  }
  const binding = {
    agentId: value.agentId,
    modelId: value.modelId.trim(),
  };
  if (isRunId(value.runId)) binding.runId = value.runId.trim();
  const threadId = normalizeThreadId(value.threadId);
  if (threadId) binding.threadId = threadId;
  if (
    typeof value.sourceFingerprint === "string" &&
    value.sourceFingerprint
  ) {
    binding.sourceFingerprint = value.sourceFingerprint;
  }
  return binding;
}

function writeStore(store) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        lastBindingKey: store.lastBindingKey || null,
        bindings: store.bindings,
      }),
    );
    return true;
  } catch (error) {
    console.warn("Failed to persist Cursor agent bindings", error);
    return false;
  }
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const bindings = {};
      for (const [key, value] of Object.entries(parsed?.bindings || {})) {
        const binding = normalizeBinding(value);
        if (binding) bindings[key] = binding;
      }
      const lastBindingKey =
        typeof parsed?.lastBindingKey === "string" &&
        bindings[parsed.lastBindingKey]
          ? parsed.lastBindingKey
          : null;
      return { bindings, lastBindingKey };
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = normalizeBinding(JSON.parse(legacyRaw));
      if (legacy) {
        const key = legacy.threadId || DEFAULT_BINDING_KEY;
        const migrated = {
          bindings: { [key]: legacy },
          lastBindingKey: key,
        };
        if (writeStore(migrated)) {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
        return migrated;
      }
    }
  } catch {
    // Ignore malformed storage.
  }
  return { bindings: {}, lastBindingKey: null };
}

/**
 * Load the Cloud Agent bound to one shader thread. Omitting the thread returns
 * the most recently used binding for legacy callers.
 */
export function loadCursorAgent(threadId) {
  const store = readStore();
  const key = normalizeThreadId(threadId);
  if (key) return store.bindings[key] || null;
  if (store.lastBindingKey && store.bindings[store.lastBindingKey]) {
    return store.bindings[store.lastBindingKey];
  }
  return (
    store.bindings[DEFAULT_BINDING_KEY] ||
    Object.values(store.bindings)[0] ||
    null
  );
}

/**
 * @param {{
 *   agentId: string,
 *   modelId: string,
 *   runId?: string,
 *   threadId?: string,
 *   source?: string,
 *   sourceFingerprint?: string
 * }} next
 */
export function saveCursorAgent(next) {
  if (!isAgentId(next?.agentId) || typeof next?.modelId !== "string") return;
  const store = readStore();
  const normalizedThreadId = normalizeThreadId(next.threadId);
  const key = normalizedThreadId || DEFAULT_BINDING_KEY;
  const stored = store.bindings[key] || null;
  const sameAgent = stored?.agentId === next.agentId;
  const runId = isRunId(next.runId)
    ? next.runId.trim()
    : sameAgent
      ? stored.runId
      : undefined;
  const threadId =
    normalizedThreadId ||
    (sameAgent ? stored.threadId : undefined);
  const nextSourceFingerprint =
    sourceFingerprint(next.source) ||
    (typeof next.sourceFingerprint === "string" && next.sourceFingerprint
      ? next.sourceFingerprint
      : undefined);
  const storedSourceFingerprint = sameAgent
    ? stored.sourceFingerprint
    : undefined;
  store.bindings[key] = {
    agentId: next.agentId,
    modelId: next.modelId.trim(),
    ...(runId ? { runId } : {}),
    ...(threadId ? { threadId } : {}),
    ...(nextSourceFingerprint || storedSourceFingerprint
      ? {
          sourceFingerprint:
            nextSourceFingerprint || storedSourceFingerprint,
        }
      : {}),
  };
  store.lastBindingKey = key;
  writeStore(store);
}

export function clearCursorAgent() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function migrateCursorAgentThreadKey(sourceThreadId, targetThreadId) {
  const source = normalizeThreadId(sourceThreadId);
  const target = normalizeThreadId(targetThreadId);
  const store = readStore();
  const stored = source ? store.bindings[source] : null;
  if (!stored || !target) return loadCursorAgent(target) || loadCursorAgent();
  const migrated = { ...stored, threadId: target };
  store.bindings[target] = migrated;
  delete store.bindings[source];
  store.lastBindingKey = target;
  writeStore(store);
  return migrated;
}

export function copyCursorAgentThreadKey(sourceThreadId, targetThreadId) {
  const source = normalizeThreadId(sourceThreadId);
  const target = normalizeThreadId(targetThreadId);
  const store = readStore();
  const stored = source ? store.bindings[source] : null;
  if (!stored || !target) return null;
  const copied = { ...stored, threadId: target };
  store.bindings[target] = copied;
  store.lastBindingKey = target;
  writeStore(store);
  return copied;
}

/**
 * Rebind the current Cursor agent after its generated module is applied.
 * Manual edits or restores then stop matching this source fingerprint.
 */
export function bindCursorAgentToSource(model, { threadId, source } = {}) {
  if (model?.provider !== "cursor" || typeof source !== "string") return;
  const normalizedThreadId = normalizeThreadId(threadId);
  if (!normalizedThreadId) return;
  const stored = loadCursorAgent(normalizedThreadId);
  if (!stored || !modelMatchesStored(model, stored.modelId)) return;
  saveCursorAgent({
    ...stored,
    modelId: model.id,
    threadId: normalizedThreadId,
    source,
  });
}

/**
 * @param {{ provider?: string, id?: string, aliases?: string[] }} model
 * @param {{ threadId?: string, source?: string }} [context]
 */
export function cursorAgentIdForModel(model, context) {
  if (model?.provider !== "cursor" || !model.id) return undefined;
  const contextThreadId = normalizeThreadId(context?.threadId);
  const stored = loadCursorAgent(contextThreadId);
  if (!stored) return undefined;
  if (!modelMatchesStored(model, stored.modelId)) return undefined;
  if (context) {
    const fingerprint = sourceFingerprint(context.source);
    if (
      !contextThreadId ||
      !fingerprint ||
      stored.threadId !== contextThreadId ||
      stored.sourceFingerprint !== fingerprint
    ) {
      return undefined;
    }
  }
  return stored.agentId;
}
