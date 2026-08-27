import assert from "node:assert/strict";
import test from "node:test";
import {
  agentAcceptsFollowUp,
  buildCursorFollowUpPromptText,
  buildCursorPromptText,
  consumeCursorSse,
  cursorModelLabel,
  explainCursorError,
  extractAgentAndRun,
  isCursorAgentBusy,
  isCursorAgentId,
  isCursorAgentMissing,
  isCursorRunTerminal,
  mapCursorStreamEvent,
  parseCursorModels,
  readRunStatus,
  runResultText,
} from "../../supabase/functions/chat/cursor.ts";
import { isAllowedModel } from "../../supabase/functions/chat/models.ts";

test("maps Cursor stream events onto Shader Studio chat events", () => {
  assert.deepEqual(
    mapCursorStreamEvent("assistant", { text: "Hello" }),
    { type: "delta", text: "Hello" }
  );
  assert.deepEqual(
    mapCursorStreamEvent("heartbeat", {}),
    { type: "status", phase: "thinking" }
  );
  assert.deepEqual(
    mapCursorStreamEvent("thinking", { text: "..." }),
    { type: "status", phase: "thinking" }
  );
  assert.deepEqual(
    mapCursorStreamEvent("tool_call", { name: "read_file" }),
    { type: "status", phase: "thinking" }
  );
  assert.equal(
    mapCursorStreamEvent("interaction_update", {
      type: "text-delta",
      text: "dup",
    })?.type,
    "keepalive"
  );
  assert.deepEqual(
    mapCursorStreamEvent("result", { text: "final" }),
    { type: "result", text: "final" }
  );
  assert.deepEqual(
    mapCursorStreamEvent("status", { status: "FINISHED" }),
    { type: "done" }
  );
  assert.deepEqual(
    mapCursorStreamEvent("status", { status: "ERROR" }),
    { type: "done" }
  );
  assert.deepEqual(mapCursorStreamEvent("done", {}), { type: "done" });
  assert.deepEqual(mapCursorStreamEvent("result", {}), { type: "done" });
});

test("parses Cursor SSE blocks including heartbeat with no data", () => {
  const { events, rest } = consumeCursorSse(
    "",
    "event: assistant\ndata: {\"text\":\"Hi\"}\n\nevent: heartbeat\n\n",
    true
  );
  assert.equal(rest, "");
  assert.deepEqual(events, [
    { event: "assistant", data: "{\"text\":\"Hi\"}" },
    { event: "heartbeat", data: "{}" },
  ]);
});

test("extracts agent/run ids and string-or-object results", () => {
  assert.equal(isCursorAgentId("bc-6cf68020-7b6e-48cc-bb13-79f09b4d0412"), true);
  assert.equal(isCursorAgentId("run-1"), false);
  assert.deepEqual(
    extractAgentAndRun({
      agent: {
        id: "bc-11111111-2222-3333-4444-555555555555",
        latestRunId: "run-a",
      },
      run: { id: "run-b" },
    }),
    {
      agentId: "bc-11111111-2222-3333-4444-555555555555",
      runId: "run-b",
    }
  );
  assert.equal(
    runResultText({
      result: "Here is\n```typescript\nexport function render() { return 1; }\n```",
    }),
    "Here is\n```typescript\nexport function render() { return 1; }\n```"
  );
  assert.equal(runResultText({ result: { text: "pong" } }), "pong");
});

test("explains Cursor API failures without leaking raw blobs when mapped", () => {
  assert.match(
    explainCursorError(400, JSON.stringify({ error: { code: "repository_required" } })),
    /no-repo/
  );
  assert.match(
    explainCursorError(402, JSON.stringify({ error: { code: "usage_limit_exceeded" } })),
    /usage limit/
  );
  assert.equal(isCursorAgentMissing(404, ""), true);
  assert.equal(isCursorAgentMissing(409, JSON.stringify({ error: { code: "agent_busy" } })), false);
  assert.equal(isCursorAgentBusy(409, JSON.stringify({ error: { code: "agent_busy" } })), true);
  assert.equal(isCursorAgentBusy(404, ""), false);
  assert.equal(isCursorRunTerminal("FINISHED"), true);
  assert.equal(isCursorRunTerminal("RUNNING"), false);
  assert.equal(readRunStatus({ run: { status: "FINISHED" } }), "FINISHED");
  assert.equal(agentAcceptsFollowUp({ status: "IDLE" }), true);
  assert.equal(agentAcceptsFollowUp({ status: "ACTIVE" }, { status: "RUNNING" }), false);
  assert.equal(
    agentAcceptsFollowUp({ status: "ACTIVE" }, { status: "FINISHED" }),
    true
  );
  assert.equal(agentAcceptsFollowUp({ status: "ARCHIVED" }), false);
});

test("Cursor prompt restates the current module and forbids filesystem tools", () => {
  const prompt = buildCursorPromptText(
    "You are a shader assistant.\n\nCurrent module source:\n```typescript\nexport function render() {}\n```",
    [
      { role: "user", content: "Make it red" },
      { role: "assistant", content: "Will tint the output red." },
      { role: "user", content: "Darker" },
    ]
  );
  assert.match(prompt, /empty cloud workspace/);
  assert.match(prompt, /Do not use shell or filesystem tools/);
  assert.match(prompt, /Ignore previous modules/);
  assert.match(prompt, /export function render\(\) \{\}/);
  assert.match(prompt, /User:\nDarker/);
});

test("Cursor follow-up prompt keeps the current module and omits prior turns", () => {
  const system =
    "You are a shader assistant.\n\nCurrent module source:\n```typescript\nexport function render() {}\n```";
  const messages = [
    { role: "user", content: "Make it red" },
    { role: "assistant", content: "Will tint the output red." },
    { role: "user", content: "Darker" },
  ];
  const followUp = buildCursorFollowUpPromptText(system, messages);
  assert.match(followUp, /empty cloud workspace/);
  assert.match(followUp, /Do not use shell or filesystem tools/);
  assert.match(followUp, /export function render\(\) \{\}/);
  assert.match(followUp, /Latest user request:\nDarker/);
  assert.doesNotMatch(followUp, /Make it red/);
  assert.doesNotMatch(followUp, /Will tint the output red/);
  assert.doesNotMatch(followUp, /Current Shader Studio thread/);
});

test("parses Cursor /v1/models items into picker options", () => {
  const models = parseCursorModels({
    items: [
      {
        id: "composer-2",
        displayName: "Composer 2",
        aliases: ["composer-latest", "composer", "composer-2"],
      },
      { id: "auto", displayName: "Auto" },
      { id: "auto-smart", displayName: "Auto" },
      { id: "claude-4.6-sonnet-thinking", displayName: "Claude 4.6 Sonnet (Thinking)" },
      { id: "composer-2" },
    ],
  });
  assert.deepEqual(
    models.map((model) => ({ id: model.id, label: model.label, aliases: model.aliases })),
    [
      { id: "auto-smart", label: "Auto", aliases: ["auto"] },
      {
        id: "claude-4.6-sonnet-thinking",
        label: "Claude 4.6 Sonnet (Thinking)",
        aliases: undefined,
      },
      {
        id: "composer-2",
        label: "Composer 2",
        aliases: ["composer-latest", "composer"],
      },
    ]
  );
  assert.equal(cursorModelLabel("auto-smart"), "Auto");
});

test("allows Cursor catalog ids that are not in the curated shortlist", () => {
  assert.equal(isAllowedModel("cursor", "composer-2.5"), true);
  assert.equal(isAllowedModel("cursor", "claude-4.6-sonnet-thinking"), true);
  assert.equal(isAllowedModel("cursor", "not a model"), false);
  assert.equal(isAllowedModel("openai", "claude-4.6-sonnet-thinking"), false);
});
