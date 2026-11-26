import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  assistantContentForApi,
  buildChatRequest,
  chatStreamCompletionEvent,
  createChatSseParser,
  toApiMessages,
  userContentForApi,
} from "../src/lib/chatPayload.js";
import { buildCurrentShaderTurn, buildSystemPrompt } from "../../supabase/functions/chat/prompt.ts";
import { FIGMA_SHADER_SKILL_REVISION } from "../../supabase/functions/_shared/figmaShaderGuidance.mjs";

let vite;
let getChatSkillContext;

before(async () => {
  vite = await createServer({
    configFile: fileURLToPath(
      new URL("../vite.config.js", import.meta.url)
    ),
    server: { middlewareMode: true },
    appType: "custom",
  });
  ({ getChatSkillContext } = await vite.ssrLoadModule(
    "/src/lib/chatSkills.js"
  ));
});

after(async () => {
  await vite?.close();
});

test("user pastes are fenced back into API history", () => {
  const messages = toApiMessages([
    {
      role: "user",
      content: "Change the clamp function to:",
      pastes: [
        {
          language: "typescript",
          text: "export function clamp(value: number) {\n  return value;\n}",
        },
      ],
    },
    { role: "assistant", content: "Updated." },
  ]);

  assert.match(messages[0].content, /Change the clamp function to:/);
  assert.match(messages[0].content, /```typescript/);
  assert.match(messages[0].content, /export function clamp/);
  assert.equal(
    userContentForApi({
      content: "",
      pastes: [{ language: "text", text: "plain" }],
    }),
    "```\nplain\n```"
  );
});

test("provider history omits stale assistant modules but keeps discussion", () => {
  const oldResponse = `<summary>Will make the shader red.</summary>
<description>A red shader.</description>
\`\`\`typescript
export function render() {
  return "OLD_ASSISTANT_SOURCE";
}
\`\`\``;
  const messages = toApiMessages([
    { role: "user", content: "Make it red" },
    { role: "assistant", content: oldResponse, applied: true },
    { role: "user", content: "Now make the current version softer" },
  ]);

  assert.match(messages[1].content, /Will make the shader red/);
  assert.match(messages[1].content, /Current module source.*authoritative/);
  assert.doesNotMatch(messages[1].content, /OLD_ASSISTANT_SOURCE/);
  assert.equal(
    assistantContentForApi({ content: "Earlier prose-only guidance." }),
    "Earlier prose-only guidance."
  );
});

test("current attachment payloads reach the final user message intact", () => {
  const firstDataBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
  const secondDataBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAC";
  const messages = toApiMessages(
    [
      { role: "user", content: "Earlier request" },
      { role: "assistant", content: "Earlier response" },
      {
        role: "user",
        content: "Use this reference",
        attachments: [
          {
            kind: "image",
            name: "reference.png",
            mimeType: "image/png",
          },
          {
            kind: "image",
            name: "palette.png",
            mimeType: "image/png",
          },
        ],
      },
      { role: "assistant", content: "", pending: true },
    ],
    [
      {
        kind: "image",
        name: "reference.png",
        mimeType: "image/png",
        dataBase64: firstDataBase64,
      },
      {
        kind: "image",
        name: "palette.png",
        mimeType: "image/png",
        dataBase64: secondDataBase64,
      },
    ]
  );

  assert.equal(messages.length, 3);
  assert.deepEqual(messages.at(-1).attachments, [
    {
      kind: "image",
      name: "reference.png",
      mimeType: "image/png",
      dataBase64: firstDataBase64,
    },
    {
      kind: "image",
      name: "palette.png",
      mimeType: "image/png",
      dataBase64: secondDataBase64,
    },
  ]);
});

test("request sends the full source, Figma revision, and only supported feature metadata", () => {
  const source = `export default function Effect() {}\n// ${"shader-source-".repeat(2000)}`;
  const skills = getChatSkillContext();
  const request = buildChatRequest({
    provider: "gemini",
    model: "gemini-3.5-flash",
    messages: [{ role: "user", content: "Make it warmer" }],
    source,
    kind: "effect",
    fileName: "main.ts",
    features: { isAnimated: false, usesMouse: true, supportsAudio: true },
    skills,
    figmaSkillRevision: FIGMA_SHADER_SKILL_REVISION,
    mode: "plan",
    cursorAgentId: "bc-11111111-2222-3333-4444-555555555555",
  });

  assert.equal(
    request.cursorAgentId,
    "bc-11111111-2222-3333-4444-555555555555"
  );
  assert.equal(request.source, source);
  assert.equal(request.skills, skills);
  assert.equal(request.figmaSkillRevision, FIGMA_SHADER_SKILL_REVISION);
  assert.equal(request.mode, "plan");
  assert.equal(request.experimentalAudio, undefined);
  assert.deepEqual(request.features, {
    isAnimated: false,
    usesMouse: true,
  });
  assert.match(skills, /Use sentence case for labels/);
  assert.doesNotMatch(skills, /frame\.audio|supportsAudio|product-brief|overwrite-using-recipe/);
});

test("plan requests exclude implementation-only shader skills", () => {
  const skills = getChatSkillContext("plan");

  assert.match(skills, /Use the Figma shader contract to evaluate feasibility/);
  assert.match(skills, /Return a plan only when requested/);
  assert.doesNotMatch(skills, /product-brief|overwrite-using-recipe|Never emit user-facing prose/);
});

test("agent and plan prompts include only the documented Figma pointer API", () => {
  for (const mode of ["agent", "plan"]) {
    const prompt = buildSystemPrompt({
      kind: "fill",
      mode,
    });

    assert.ok(prompt.includes(getChatSkillContext(mode)));
    assert.match(prompt, /Recheck technical assumptions from prior messages and saved plans/);
    assert.match(prompt, /`frame\.mousePosition\.x` and `frame\.mousePosition\.y`, in layer-local pixels/);
    assert.match(prompt, /Mark mouse use when reading `frame\.mousePosition`/);
    assert.match(prompt, /use an approved fallback/);
    assert.doesNotMatch(prompt, /gestureId|endReason|mousePosition\.down|frame\.audio|supportsAudio/);
  }
});

test("Edge keeps the full shader snapshot in data and owns the skill context", () => {
  const source = `const marker = "${"source-marker-".repeat(1500)}";`;
  const skills = getChatSkillContext();
  const turn = buildCurrentShaderTurn({
    source,
    fileName: "main.ts",
    features: { isAnimated: true, usesMouse: false },
  }, "Please revise this shader.");
  const prompt = buildSystemPrompt({ kind: "fill" });

  assert.ok(turn.includes(JSON.stringify(source)));
  assert.ok(!prompt.includes(source));
  assert.ok(prompt.includes(skills));
  assert.match(prompt, /Kind: fill/);
  assert.match(turn, /"isAnimated": true/);
  assert.match(turn, /"usesMouse": false/);
  assert.match(prompt, /Never reconstruct or preserve code.*earlier assistant/);
  assert.doesNotMatch(prompt, /frame\.audio|supportsAudio/);
});

test("prompt includes live compile errors for the model to fix", () => {
  const prompt = buildCurrentShaderTurn({
    source: "export default function Effect() {}",
    fileName: "main.ts",
    compileError: "Compile error: unexpected token",
  }, "Fix it");
  assert.match(prompt, /"compileError":/);
  assert.match(prompt, /Compile error: unexpected token/);
  const request = buildChatRequest({
    provider: "gemini",
    model: "gemini-3.5-flash",
    messages: [{ role: "user", content: "Fix it" }],
    source: "export default function Effect() {}",
    kind: "effect",
    fileName: "main.ts",
    compileError: "  Shader compilation error at WGSL line 12  ",
  });
  assert.equal(
    request.compileError,
    "Shader compilation error at WGSL line 12",
  );
});

test("experimental audio cannot add Studio features to chat guidance or shader metadata", () => {
  const off = getChatSkillContext("agent");
  const on = getChatSkillContext("agent", { experimentalAudio: true });
  assert.equal(on, off);

  const gatedPrompt = buildSystemPrompt({
    kind: "effect",
    experimentalAudio: true,
    skills: "Invent an audio API using frame.audio",
  });
  assert.doesNotMatch(gatedPrompt, /frame\.audio|supportsAudio/);
});

test("SSE parser preserves split chunks and an unterminated final event", () => {
  const parser = createChatSseParser();
  assert.deepEqual(parser.push('data: {"type":"delta","te'), []);
  assert.deepEqual(
    parser.push('xt":"hello"}\n\ndata: {"type":"delta","text":" world"}'),
    [{ type: "delta", text: "hello" }]
  );
  assert.deepEqual(parser.push("", { flush: true }), [
    { type: "delta", text: " world" },
  ]);
});

test("SSE parser preserves safe provider status phases", () => {
  const parser = createChatSseParser();
  assert.deepEqual(
    parser.push(
      'data: {"type":"status","phase":"thinking"}\n\n' +
        'data: {"type":"status","phase":"responding"}\n\n' +
        'data: {"type":"status","phase":"starting"}\n\n' +
        'data: {"type":"status","phase":"private-reasoning"}\n\n' +
        'data: {"type":"cursor-agent","agentId":"bc-11111111-2222-3333-4444-555555555555","runId":"run-1"}\n\n' +
        'data: {"type":"done","agentId":"bc-11111111-2222-3333-4444-555555555555","runId":"run-1"}\n\n'
    ),
    [
      { type: "status", phase: "thinking" },
      { type: "status", phase: "responding" },
      { type: "status", phase: "starting" },
      {
        type: "cursor-agent",
        agentId: "bc-11111111-2222-3333-4444-555555555555",
        runId: "run-1",
      },
      {
        type: "done",
        agentId: "bc-11111111-2222-3333-4444-555555555555",
        runId: "run-1",
      },
    ]
  );
});

test("a premature stream end cannot synthesize a completed shader edit", () => {
  assert.equal(
    chatStreamCompletionEvent("cursor", { sawDone: true }),
    null
  );
  assert.equal(
    chatStreamCompletionEvent("cursor", { sawError: true }),
    null
  );
  assert.deepEqual(chatStreamCompletionEvent("openai"), {
    type: "error",
    message: "The model stream ended before the agent finished. Try again.",
  });
  assert.deepEqual(chatStreamCompletionEvent("cursor"), {
    type: "error",
    message: "Cursor stream ended before the agent finished. Try again.",
  });
});
