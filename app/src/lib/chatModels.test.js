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
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "claude-fable-5",
    "claude-opus-5",
    "claude-sonnet-5",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "grok-4.6",
    "grok-4.5",
    "grok-4.3",
    "auto-smart",
    "composer-2.5",
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
  assert.ok(groups.some((group) => group.label === "Grok"));
  assert.ok(groups.some((group) => group.label === "Cursor"));
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
  assert.ok(models.some((model) => model.provider === "cursor"));
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

test("replaces the Cursor shortlist with the account's /v1/models catalog", () => {
  const groups = groupsForAvailableProviderModels({
    cursor: [
      { id: "auto", label: "Auto" },
      { id: "auto-smart", label: "Auto" },
      {
        id: "composer-2",
        label: "Composer 2",
        aliases: ["composer-2.5", "composer"],
      },
      { id: "claude-4.6-sonnet-thinking", label: "Claude 4.6 Sonnet (Thinking)" },
    ],
  });
  const cursorModels = groups.find((group) => group.label === "Cursor").models;
  const cursorIds = cursorModels.map((model) => model.id);
  const autoLabels = cursorModels
    .filter((model) => model.label === "Auto" || model.label.startsWith("Auto "))
    .map((model) => model.label);

  assert.deepEqual(cursorIds, [
    "auto-smart",
    "claude-4.6-sonnet-thinking",
    "composer-2",
  ]);
  assert.deepEqual(autoLabels, ["Auto"]);
  assert.ok(groups.some((group) => group.label === "OpenAI"));
});

test("keeps an undiscovered Cursor selection until the catalog loads", () => {
  const next = reconcileAvailableChatModel(
    { provider: "cursor", id: "claude-4.6-sonnet-thinking", label: "Claude 4.6 Sonnet (Thinking)" },
    CHAT_MODEL_GROUPS,
    { openai: ["gpt-5.6-sol"] }
  );
  assert.equal(next.id, "claude-4.6-sonnet-thinking");
});

test("maps a saved Cursor alias onto the canonical catalog model", () => {
  const groups = groupsForAvailableProviderModels({
    cursor: [
      {
        id: "composer-2",
        label: "Composer 2",
        aliases: ["composer-2.5"],
      },
    ],
  });
  const next = reconcileAvailableChatModel(
    { provider: "cursor", id: "composer-2.5" },
    groups,
    { cursor: [{ id: "composer-2", aliases: ["composer-2.5"] }] }
  );
  assert.equal(next.id, "composer-2");
  assert.equal(next.label, "Composer 2");
});

test("preserves an unknown saved Cursor model id until discovery", () => {
  const saved = findChatModel("cursor", "gpt-5.4-thinking");
  assert.equal(saved.provider, "cursor");
  assert.equal(saved.id, "gpt-5.4-thinking");
});

test("selects Cursor Grok without colliding with the Grok API model", () => {
  const models = [
    { provider: "grok", id: "grok-4.6", label: "Grok 4.6" },
    { provider: "cursor", id: "grok-4.6", label: "Cursor Grok 4.6" },
  ];
  const selected = findSelectableChatModel(
    models,
    chatModelValue({ provider: "cursor", id: "grok-4.6" })
  );
  assert.equal(selected.provider, "cursor");
  assert.equal(selected.label, "Cursor Grok 4.6");
  assert.notEqual(chatModelValue(models[0]), chatModelValue(models[1]));
});
