export type Provider = "openai" | "anthropic" | "gemini";

export type ModelOption = {
  provider: Provider;
  id: string;
  label: string;
};

/** Allowlisted models for BYOK chat. Keep in sync with app/src/lib/chatModels.js */
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
];

export function isAllowedModel(provider: string, model: string): boolean {
  return MODELS.some((entry) => entry.provider === provider && entry.id === model);
}
