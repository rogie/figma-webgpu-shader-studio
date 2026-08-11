import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_MODEL_GROUPS,
  CHAT_MODELS,
  groupsForAvailableOpenAIModels,
  groupsForAvailableProviderModels,
  reconcileAvailableChatModel,
} from "./chatModels.js";

test("keeps only the shader-focused model shortlist", () => {
  assert.deepEqual(CHAT_MODELS.map((model) => model.id), [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "claude-fable-5",
    "claude-opus-5",
    "claude-sonnet-5",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
  ]);
});

test("filters OpenAI models by availability in curated order", () => {
  const groups = groupsForAvailableOpenAIModels([
    { id: "gpt-5.6-terra" },
    { id: "not-in-the-catalog" },
    { id: "gpt-5.6-sol" },
  ]);
  const openaiIds = groups
    .flatMap((group) => group.models)
    .filter((model) => model.provider === "openai")
    .map((model) => model.id);

  assert.deepEqual(openaiIds, ["gpt-5.6-sol", "gpt-5.6-terra"]);
  assert.ok(groups.some((group) => group.label === "Anthropic"));
  assert.ok(groups.some((group) => group.label === "Gemini"));
});

test("falls back to the curated groups when discovery is unavailable", () => {
  assert.equal(groupsForAvailableProviderModels(null), CHAT_MODEL_GROUPS);
});

test("filters Anthropic and Gemini without affecting undiscovered providers", () => {
  const groups = groupsForAvailableProviderModels({
    anthropic: ["claude-sonnet-5"],
    gemini: [{ id: "gemini-3.5-flash" }],
  });
  const models = groups.flatMap((group) => group.models);

  assert.deepEqual(
    models.filter((model) => model.provider === "anthropic").map((model) => model.id),
    ["claude-sonnet-5"]
  );
  assert.deepEqual(
    models.filter((model) => model.provider === "gemini").map((model) => model.id),
    ["gemini-3.5-flash"]
  );
  assert.ok(models.some((model) => model.provider === "openai"));
});

test("reconciles an unavailable saved model to the first available option", () => {
  const groups = groupsForAvailableOpenAIModels(["gpt-5.6-terra"]);
  const next = reconcileAvailableChatModel(
    { provider: "openai", id: "gpt-4o" },
    groups
  );

  assert.equal(next.id, "gpt-5.6-terra");
});
