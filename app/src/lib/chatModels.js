/** Allowlisted models — keep in sync with supabase/functions/chat/models.ts */

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
];

export const CHAT_MODELS = CHAT_MODEL_GROUPS.flatMap((group) => group.models);

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0];

export function groupsForAvailableProviderModels(availableModelsByProvider) {
  if (!availableModelsByProvider || typeof availableModelsByProvider !== "object") {
    return CHAT_MODEL_GROUPS;
  }

  const availableIdsByProvider = new Map(
    Object.entries(availableModelsByProvider)
      .filter(([, models]) => Array.isArray(models))
      .map(([provider, models]) => [
        provider,
        new Set(
          models
            .map((model) => (typeof model === "string" ? model : model?.id))
            .filter(Boolean)
        ),
      ])
  );

  return CHAT_MODEL_GROUPS.map((group) => ({
    ...group,
    models: group.models.filter(
      (model) =>
        !availableIdsByProvider.has(model.provider) ||
        availableIdsByProvider.get(model.provider).has(model.id)
    ),
  })).filter((group) => group.models.length > 0);
}

export function groupsForAvailableOpenAIModels(availableModels) {
  if (!Array.isArray(availableModels)) return CHAT_MODEL_GROUPS;
  return groupsForAvailableProviderModels({ openai: availableModels });
}

export function reconcileAvailableChatModel(currentModel, groups) {
  const models = groups.flatMap((group) => group.models);
  return (
    models.find(
      (model) =>
        model.provider === currentModel?.provider && model.id === currentModel?.id
    ) ||
    models[0] ||
    DEFAULT_CHAT_MODEL
  );
}

export function modelsForProvider(provider) {
  return CHAT_MODELS.filter((model) => model.provider === provider);
}

export function findChatModel(provider, id) {
  return (
    CHAT_MODELS.find((model) => model.provider === provider && model.id === id) ||
    modelsForProvider(provider)[0] ||
    DEFAULT_CHAT_MODEL
  );
}
