const REASONING_EFFORTS = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
const OPTIONAL_REASONING_EFFORTS = Object.freeze(["none", ...REASONING_EFFORTS]);
const NO_EFFORTS = Object.freeze([]);

export const OPENAI_CHAT_MODELS = [
  { id: "gpt-6.2-sol", label: "GPT-6.2 Sol", efforts: REASONING_EFFORTS },
  { id: "gpt-6.2-astra", label: "GPT-6.2 Astra", efforts: REASONING_EFFORTS },
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra", efforts: OPTIONAL_REASONING_EFFORTS },
  { id: "gpt-6-luna", label: "GPT-6 Luna", efforts: OPTIONAL_REASONING_EFFORTS },
  { id: "gpt-5.6-turbo", label: "GPT-5.6 Turbo", requiresDiscovery: true },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", efforts: OPTIONAL_REASONING_EFFORTS },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", efforts: OPTIONAL_REASONING_EFFORTS },
  { id: "gpt-6-astra", label: "GPT-6 Astra", efforts: REASONING_EFFORTS },
];

export function openAIReasoningEfforts(modelId) {
  return OPENAI_CHAT_MODELS.find((model) => model.id === modelId)?.efforts ?? NO_EFFORTS;
}

/** @param {string} modelId @param {unknown} effort */
export function resolveOpenAIReasoningEffort(modelId, effort) {
  return typeof effort === "string" && openAIReasoningEfforts(modelId).includes(effort)
    ? effort
    : undefined;
}
