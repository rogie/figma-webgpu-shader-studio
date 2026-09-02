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
import { buildSystemPrompt } from "../../supabase/functions/chat/prompt.ts";

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

test("request preserves complete source, features, and skill context", () => {
  const source = `export default function Effect() {}\n// ${"shader-source-".repeat(2000)}`;
  const skills = getChatSkillContext();
  const request = buildChatRequest({
    provider: "gemini",
    model: "gemini-3.5-flash",
    messages: [{ role: "user", content: "Make it warmer" }],
    source,
    kind: "effect",
    fileName: "main.ts",
    features: { isAnimated: false, usesMouse: true },
    skills,
    mode: "plan",
    cursorAgentId: "bc-11111111-2222-3333-4444-555555555555",
  });

  assert.equal(
    request.cursorAgentId,
    "bc-11111111-2222-3333-4444-555555555555"
  );
  assert.equal(request.source, source);
  assert.equal(request.skills, skills);
  assert.equal(request.mode, "plan");
  assert.equal(request.experimentalAudio, false);
  assert.deepEqual(request.features, {
    isAnimated: false,
    usesMouse: true,
  });
  assert.match(skills, /Skill: defineProperties label casing/);
  assert.match(skills, /every user-facing `label`.*sentence case/);
  assert.match(skills, /Skill: Figma shader canvas handles/);
  assert.match(skills, /type: "point-angle-radius"/);
  assert.match(skills, /Skill: figma-shader-coder/);
  assert.match(skills, /Skill: Figma shader module contract \(v3\)/);
  assert.match(skills, /Skill: WGSL/);
  assert.match(skills, /Skill: WebGPU/);
  assert.doesNotMatch(skills, /\{\{[^}]+\}\}/);
  assert.doesNotMatch(skills, /`isAnimated` must be `false`/);
  assert.match(skills, /Do not mention frame.audio/);
  assert.doesNotMatch(skills, /Studio-only audio inputs/);
});

test("plan requests exclude implementation-only shader skills", () => {
  const skills = getChatSkillContext("plan");

  assert.match(skills, /Shader Studio planning context/);
  assert.match(skills, /Figma WebGPU and WGSL feasibility/);
  assert.match(skills, /Keep the plan concise/);
  assert.match(skills, /implement it without guessing/);
  assert.match(skills, /Skill: Figma shader canvas handles/);
  assert.match(skills, /Do not replace a supported.*separate numeric X\/Y/s);
  assert.doesNotMatch(skills, /Skill: figma-shader-coder/);
  assert.doesNotMatch(skills, /Never emit user-facing prose/);
  assert.doesNotMatch(skills, /Source files are the deliverable/);
});

test("Edge Function prompt embeds full source and skills without truncation", () => {
  const source = `const marker = "${"source-marker-".repeat(1500)}";`;
  const skills = getChatSkillContext();
  const prompt = buildSystemPrompt({
    source,
    kind: "fill",
    fileName: "main.ts",
    features: { isAnimated: true, usesMouse: false },
    skills,
  });

  assert.ok(prompt.includes(source));
  assert.ok(prompt.includes(skills));
  assert.match(prompt, /Kind: fill/);
  assert.match(prompt, /isAnimated=true, usesMouse=false/);
  assert.match(prompt, /manual edits or a restored saved version/);
  assert.match(prompt, /Never reconstruct or preserve code.*earlier assistant/);
  assert.match(prompt, /Do not mention frame.audio/);
  assert.doesNotMatch(prompt, /supportsAudio=/);
});

test("prompt includes live compile errors for the model to fix", () => {
  const prompt = buildSystemPrompt({
    source: "export default function Effect() {}",
    kind: "effect",
    fileName: "main.ts",
    compileError: "Compile error: unexpected token",
  });
  assert.match(prompt, /Current preview compile error from main.ts \/ WGSL/);
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

test("chat skills and prompt include Studio audio only when experimental audio is on", () => {
  const off = getChatSkillContext("agent");
  const on = getChatSkillContext("agent", { experimentalAudio: true });
  assert.match(off, /Do not mention frame.audio/);
  assert.doesNotMatch(off, /Studio-only audio inputs/);
  assert.match(on, /Studio-only audio inputs/);
  assert.match(on, /supportsAudio/);
  assert.match(on, /Float32Array length 64/);

  const gatedPrompt = buildSystemPrompt({
    source: "export default function Effect() {}",
    kind: "effect",
    fileName: "main.ts",
    features: { isAnimated: false, usesMouse: false, supportsAudio: true },
    experimentalAudio: true,
    skills: on,
  });
  assert.match(gatedPrompt, /supportsAudio=true/);
  assert.doesNotMatch(gatedPrompt, /Do not mention frame.audio/);
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

test("does not synthesize a done event when a Cursor stream ends early", () => {
  assert.equal(
    chatStreamCompletionEvent("cursor", { sawDone: true }),
    null
  );
  assert.equal(
    chatStreamCompletionEvent("cursor", { sawError: true }),
    null
  );
  assert.deepEqual(chatStreamCompletionEvent("openai"), { type: "done" });
  assert.deepEqual(chatStreamCompletionEvent("cursor"), {
    type: "error",
    message: "Cursor stream ended before the agent finished. Try again.",
  });
});
