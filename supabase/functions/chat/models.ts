export type Provider = "openai" | "anthropic" | "gemini" | "grok" | "cursor";

export const PROVIDERS: Provider[] = [
  "openai",
  "anthropic",
  "gemini",
  "grok",
  "cursor",
];

export function isProvider(value: string | undefined): value is Provider {
  return PROVIDERS.includes(value as Provider);
}

export type ModelOption = {
  provider: Provider;
  id: string;
  label: string;
};

/** Curated BYOK models. Keep in sync with app/src/lib/chatModels.js.
 * Cursor also accepts any well-formed id from GET /v1/models. */
export const MODELS: ModelOption[] = [
  // OpenAI
  { provider: "openai", id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { provider: "openai", id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },

  // Anthropic
  { provider: "anthropic", id: "claude-fable-5", label: "Claude Fable 5" },
  { provider: "anthropic", id: "claude-opus-5", label: "Claude Opus 5" },
  { provider: "anthropic", id: "claude-sonnet-5", label: "Claude Sonnet 5" },

  // Gemini
  { provider: "gemini", id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { provider: "gemini", id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { provider: "gemini", id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },

  // Grok (xAI)
  { provider: "grok", id: "grok-4.6", label: "Grok 4.6" },
  { provider: "grok", id: "grok-4.5", label: "Grok 4.5" },
  { provider: "grok", id: "grok-4.3", label: "Grok 4.3" },

  // Cursor Cloud Agents
  { provider: "cursor", id: "auto-smart", label: "Cursor Auto" },
  { provider: "cursor", id: "composer-2.5", label: "Composer 2.5" },
];

const CURSOR_MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export function isCursorModelId(value: string): boolean {
  return CURSOR_MODEL_ID.test(value);
}

export function isAllowedModel(provider: string, model: string): boolean {
  if (MODELS.some((entry) => entry.provider === provider && entry.id === model)) {
    return true;
  }
  // Cursor's /v1/models catalog is account-specific; accept any well-formed id
  // the picker can return from that API.
  return provider === "cursor" && isCursorModelId(model);
}
