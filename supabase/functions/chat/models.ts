export type Provider = "openai" | "anthropic" | "gemini";

export type ModelOption = {
  provider: Provider;
  id: string;
  label: string;
};

/** Allowlisted models for BYOK chat. Keep in sync with app/src/lib/chatModels.js */
export const MODELS: ModelOption[] = [
  // OpenAI
  { provider: "openai", id: "gpt-4.1", label: "GPT-4.1" },
  { provider: "openai", id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { provider: "openai", id: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  { provider: "openai", id: "gpt-4o", label: "GPT-4o" },
  { provider: "openai", id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { provider: "openai", id: "o3", label: "o3" },
  { provider: "openai", id: "o4-mini", label: "o4-mini" },

  // Anthropic
  { provider: "anthropic", id: "claude-fable-5", label: "Claude Fable 5" },
  { provider: "anthropic", id: "claude-opus-5", label: "Claude Opus 5" },
  { provider: "anthropic", id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { provider: "anthropic", id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { provider: "anthropic", id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { provider: "anthropic", id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { provider: "anthropic", id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { provider: "anthropic", id: "claude-opus-4-5", label: "Claude Opus 4.5" },

  // Gemini (3.x — 2.5 Flash is blocked for many new API keys)
  { provider: "gemini", id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { provider: "gemini", id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { provider: "gemini", id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
  { provider: "gemini", id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { provider: "gemini", id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { provider: "gemini", id: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
];

export function isAllowedModel(provider: string, model: string): boolean {
  return MODELS.some((entry) => entry.provider === provider && entry.id === model);
}
