import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_MODEL_GROUPS,
  CHAT_MODELS,
  chatModelValue,
  findChatModel,
  findSelectableChatModel,
  groupsForAvailableOpenAIModels,
  groupsForAvailableProviderModels,
  reconcileAvailableChatModel,
} from "./chatModels.js";

test("keeps only the shader-focused model shortlist", () => {
  assert.deepEqual(CHAT_MODELS.map((model) => model.id), [
    "gpt-6.2-sol",
    "gpt-6.2-astra",
    "gpt-6.1-terra",
    "gpt-6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6-astra",
    "claude-fable-5",
    "claude-opus-5",
    "claude-sonnet-5",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "grok-4.6",
    "grok-4.5",
    "grok-4.3",
  ]);
});

test("filters OpenAI models by availability in curated order", () => {
  const groups = groupsForAvailableOpenAIModels([
    { id: "gpt-5.6-terra" },
    { id: "not-in-the-catalog" },
    { id: "gpt-6-astra" },
    { id: "gpt-5.6-sol" },
    { id: "gpt-5.6-turbo" },
    { id: "gpt-6.2-astra" },
    { id: "gpt-6.2-sol" },
  ]);
  const openaiIds = groups
    .flatMap((group) => group.models)
    .filter((model) => model.provider === "openai")
    .map((model) => model.id);

  assert.deepEqual(openaiIds, [
    "gpt-6.2-sol", "gpt-6.2-astra", "gpt-5.6-turbo",
    "gpt-5.6-sol", "gpt-5.6-terra", "gpt-6-astra",
  ]);
  assert.ok(groups.some((group) => group.label === "Anthropic"));
  assert.ok(groups.some((group) => group.label === "Gemini"));
  assert.ok(groups.some((group) => group.label === "Grok"));
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
  assert.ok(models.some((model) => model.provider === "grok"));
});

test("reconciles an unavailable saved model to the first available option", () => {
  const groups = groupsForAvailableOpenAIModels(["gpt-5.6-terra"]);
  const next = reconcileAvailableChatModel(
    { provider: "openai", id: "gpt-4o" },
    groups,
    { openai: ["gpt-5.6-terra"] }
  );

  assert.equal(next.id, "gpt-5.6-terra");
});

test("ignores the retired provider catalog and falls back from a saved Cursor model", () => {
  const groups = groupsForAvailableProviderModels({
    cursor: [{ id: "composer-2.5", label: "Composer 2.5" }],
  });
  assert.deepEqual(groups, CHAT_MODEL_GROUPS);
  const formerModel = { provider: "cursor", id: "composer-2.5" };
  assert.deepEqual(findChatModel(formerModel.provider, formerModel.id), CHAT_MODELS[0]);
  assert.deepEqual(reconcileAvailableChatModel(formerModel, groups, {}), CHAT_MODELS[0]);
});

test("uses the provider to disambiguate matching model IDs", () => {
  const models = [
    { provider: "openai", id: "shared-model", label: "OpenAI model" },
    { provider: "grok", id: "shared-model", label: "Grok model" },
  ];
  assert.equal(findSelectableChatModel(models, "shared-model"), undefined);
  assert.equal(findSelectableChatModel(models, chatModelValue(models[1])), models[1]);
});
