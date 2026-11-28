import { OPENAI_CHAT_MODELS } from "../../../supabase/functions/chat/openaiModels.mjs";

/** Curated shortlist for other providers — keep in sync with supabase/functions/chat/models.ts. */

const openAIModels = OPENAI_CHAT_MODELS.map(({ id, label }) => ({ provider: "openai", id, label }));
const openAIModelsRequiringDiscovery = new Set(
  OPENAI_CHAT_MODELS.filter((model) => model.requiresDiscovery).map((model) => model.id)
);

export const CHAT_MODEL_GROUPS = [
  {
    label: "OpenAI",
    models: openAIModels.filter((model) => !openAIModelsRequiringDiscovery.has(model.id)),
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
];

export const CHAT_MODELS = CHAT_MODEL_GROUPS.flatMap((group) => group.models);

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0];

function modelId(entry) {
  return typeof entry === "string" ? entry : entry?.id;
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
    if (provider === "openai" && availableIdsByProvider.has(provider)) {
      const available = availableIdsByProvider.get(provider);
      return { ...group, models: openAIModels.filter((model) => available.has(model.id)) };
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
    model.provider === currentModel?.provider && model.id === currentModel?.id
  );
  if (match) return match;
  const provider = currentModel?.provider;
  const discoveryPending =
    modelsForProvider(provider).length > 0 &&
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
  const models = provider === "openai" ? openAIModels : CHAT_MODELS;
  const known = models.find((model) => model.provider === provider && model.id === id);
  if (known) return known;
  return modelsForProvider(provider)[0] || DEFAULT_CHAT_MODEL;
}
