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
    "auto-smart",
    "composer-2.5",
  ]);
});

test("filters OpenAI models by availability in curated order", () => {
  const groups = groupsForAvailableOpenAIModels([
    { id: "gpt-5.6-terra" },
    { id: "not-in-the-catalog" },
    { id: "gpt-6-astra" },
    { id: "gpt-5.6-sol" },
  ]);
  const openaiIds = groups
    .flatMap((group) => group.models)
    .filter((model) => model.provider === "openai")
    .map((model) => model.id);

  assert.deepEqual(openaiIds, ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-6-astra"]);
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

test("keeps the newest model in each Cursor family", () => {
  const groups = groupsForAvailableProviderModels({
    cursor: [
      { id: "auto", label: "Auto" },
      { id: "auto-default", label: "Auto (default)" },
      { id: "claude-4.5-haiku", label: "Claude Haiku 4.5" },
      { id: "claude-4.8-opus", label: "Claude Opus 4.8" },
      { id: "claude-5-opus", label: "Claude Opus 5" },
      { id: "claude-5-sonnet", label: "Claude Sonnet 5" },
      { id: "codex-5.3", label: "Codex 5.3" },
      {
        id: "composer-2",
        label: "Composer 2.5",
        aliases: ["composer-2.5", "composer"],
      },
      { id: "grok-4.5", label: "Cursor Grok 4.5" },
      { id: "grok-4.6", label: "Cursor Grok 4.6" },
      { id: "gemini-3-flash", label: "Gemini 3 Flash" },
      { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
      { id: "gpt-5-mini", label: "GPT-5 Mini" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
      { id: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
      { id: "gpt-6-astra", label: "GPT-6 Astra" },
      { id: "kimi-k3", label: "Kimi K3" },
    ],
  });
  const cursorModels = groups.find((group) => group.label === "Cursor").models;
  const cursorIds = cursorModels.map((model) => model.id);

  assert.deepEqual(cursorIds, [
    "auto-default",
    "claude-4.5-haiku",
    "claude-5-opus",
    "claude-5-sonnet",
    "codex-5.3",
    "composer-2",
    "grok-4.6",
    "gemini-3.1-pro",
    "gemini-3.5-flash",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.5",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6-astra",
    "kimi-k3",
  ]);
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
        label: "Composer 2.5",
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
  assert.equal(next.label, "Composer 2.5");
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
