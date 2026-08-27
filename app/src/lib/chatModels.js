/** Curated shortlist — keep in sync with supabase/functions/chat/models.ts.
 * Cursor options are replaced by GET /v1/models when a Cursor key is present. */

export const CHAT_MODEL_GROUPS = [
  {
    label: "OpenAI",
    models: [
      { provider: "openai", id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
      { provider: "openai", id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    ],
  },
  {
    label: "Anthropic",
    models: [
      { provider: "anthropic", id: "claude-fable-5", label: "Claude Fable 5" },
      { provider: "anthropic", id: "claude-opus-5", label: "Claude Opus 5" },
      { provider: "anthropic", id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    ],
  },
  {
    label: "Gemini",
    models: [
      { provider: "gemini", id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
      { provider: "gemini", id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
      { provider: "gemini", id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
    ],
  },
  {
    label: "Grok",
    models: [
      { provider: "grok", id: "grok-4.6", label: "Grok 4.6" },
      { provider: "grok", id: "grok-4.5", label: "Grok 4.5" },
      { provider: "grok", id: "grok-4.3", label: "Grok 4.3" },
    ],
  },
  {
    label: "Cursor",
    models: [
      { provider: "cursor", id: "auto-smart", label: "Cursor Auto" },
      { provider: "cursor", id: "composer-2.5", label: "Composer 2.5" },
    ],
  },
];

export const CHAT_MODELS = CHAT_MODEL_GROUPS.flatMap((group) => group.models);

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0];

function modelId(entry) {
  return typeof entry === "string" ? entry : entry?.id;
}

const CURSOR_MODEL_SHORTLIST = [
  ["Auto (default)", "Auto"],
  ["Claude Haiku 4.5"],
  ["Claude Opus 5"],
  ["Claude Sonnet 5"],
  ["Codex 5.3"],
  ["Composer 2.5"],
  ["Cursor Grok 4.6"],
  ["Gemini 3.1 Pro"],
  ["Gemini 3.5 Flash"],
  ["GPT-5.4 Mini"],
  ["GPT-5.4 Nano"],
  ["GPT-5.5"],
  ["GPT-5.6 Luna"],
  ["GPT-5.6 Sol"],
  ["GPT-5.6 Terra"],
  ["Kimi K3"],
];

function cursorModelLabel(id, label) {
  if (typeof label === "string" && label.trim()) return label.trim();
  if (id === "auto" || id === "auto-smart") return "Auto";
  return id;
}

function matchesChatModel(model, provider, id) {
  if (!model || model.provider !== provider) return false;
  if (model.id === id) return true;
  return Array.isArray(model.aliases) && model.aliases.includes(id);
}

function uniqueAliases(values, id) {
  const seen = new Set();
  const aliases = [];
  for (const value of values) {
    if (!value || value === id || seen.has(value)) continue;
    seen.add(value);
    aliases.push(value);
  }
  return aliases;
}

function collapseCursorModels(models) {
  const byId = new Map(models.map((model) => [model.id, model]));
  const skip = new Set();

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
      smart.id
    );
    smart.aliases = aliases.length ? aliases : undefined;
  }

  const kept = models.filter((model) => !skip.has(model.id));
  const usedLabels = new Map();
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

function shortlistCursorModels(models) {
  const byLabel = new Map(
    models.map((model) => [model.label.toLowerCase(), model])
  );
  return CURSOR_MODEL_SHORTLIST.flatMap((labels) => {
    const match = labels
      .map((label) => byLabel.get(label.toLowerCase()))
      .find(Boolean);
    return match ? [match] : [];
  });
}

function discoveredCursorModels(available) {
  if (!Array.isArray(available) || available.length === 0) return [];
  const seen = new Set();
  const models = [];
  for (const entry of available) {
    const id = modelId(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const aliases = uniqueAliases(
      Array.isArray(entry?.aliases) ? entry.aliases : [],
      id
    );
    models.push({
      provider: "cursor",
      id,
      label: cursorModelLabel(id, typeof entry === "object" ? entry.label : undefined),
      ...(aliases.length ? { aliases } : {}),
    });
  }
  return shortlistCursorModels(collapseCursorModels(models));
}

export function groupsForAvailableProviderModels(availableModelsByProvider) {
  if (!availableModelsByProvider || typeof availableModelsByProvider !== "object") {
    return CHAT_MODEL_GROUPS;
  }

  const availableIdsByProvider = new Map(
    Object.entries(availableModelsByProvider)
      .filter(([, models]) => Array.isArray(models))
      .map(([provider, models]) => [
        provider,
        new Set(models.map(modelId).filter(Boolean)),
      ])
  );

  return CHAT_MODEL_GROUPS.map((group) => {
    const provider = group.models[0]?.provider;
    if (provider === "cursor") {
      const discovered = discoveredCursorModels(availableModelsByProvider.cursor);
      if (discovered.length) return { ...group, models: discovered };
      return group;
    }
    return {
      ...group,
      models: group.models.filter(
        (model) =>
          !availableIdsByProvider.has(model.provider) ||
          availableIdsByProvider.get(model.provider).has(model.id)
      ),
    };
  }).filter((group) => group.models.length > 0);
}

export function groupsForAvailableOpenAIModels(availableModels) {
  if (!Array.isArray(availableModels)) return CHAT_MODEL_GROUPS;
  return groupsForAvailableProviderModels({ openai: availableModels });
}

export function reconcileAvailableChatModel(
  currentModel,
  groups,
  availableModelsByProvider
) {
  const models = groups.flatMap((group) => group.models);
  const match = models.find((model) =>
    matchesChatModel(model, currentModel?.provider, currentModel?.id)
  );
  if (match) return match;
  const provider = currentModel?.provider;
  const discoveryPending =
    provider &&
    (!availableModelsByProvider ||
      !Object.prototype.hasOwnProperty.call(availableModelsByProvider, provider));
  if (discoveryPending && currentModel?.id) return currentModel;
  return models[0] || DEFAULT_CHAT_MODEL;
}

export function modelsForProvider(provider) {
  return CHAT_MODELS.filter((model) => model.provider === provider);
}

export function chatModelValue(model) {
  if (!model?.provider || !model?.id) return "";
  return `${model.provider}:${model.id}`;
}

export function findSelectableChatModel(models, value) {
  const raw = String(value || "");
  const colon = raw.indexOf(":");
  if (colon <= 0) {
    const matches = models.filter((model) => model.id === raw);
    return matches.length === 1 ? matches[0] : undefined;
  }
  const provider = raw.slice(0, colon);
  const id = raw.slice(colon + 1);
  return models.find((model) => model.provider === provider && model.id === id);
}

export function findChatModel(provider, id) {
  const known = CHAT_MODELS.find((model) =>
    matchesChatModel(model, provider, id)
  );
  if (known) return known;
  if (provider === "cursor" && typeof id === "string" && id.trim()) {
    return {
      provider: "cursor",
      id,
      label: cursorModelLabel(id),
    };
  }
  return modelsForProvider(provider)[0] || DEFAULT_CHAT_MODEL;
}
