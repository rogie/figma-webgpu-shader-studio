import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  buildChatRequest,
  createChatSseParser,
  toApiMessages,
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

test("current image payload reaches the final user message intact", () => {
  const dataBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
  const messages = toApiMessages(
    [
      { role: "user", content: "Earlier request" },
      { role: "assistant", content: "Earlier response" },
      {
        role: "user",
        content: "Use this reference",
        attachment: {
          kind: "image",
          name: "reference.png",
          mimeType: "image/png",
        },
      },
      { role: "assistant", content: "", pending: true },
    ],
    {
      kind: "image",
      name: "reference.png",
      mimeType: "image/png",
      dataBase64,
    }
  );

  assert.equal(messages.length, 3);
  assert.deepEqual(messages.at(-1).attachments, [
    {
      kind: "image",
      name: "reference.png",
      mimeType: "image/png",
      dataBase64,
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
  });

  assert.equal(request.source, source);
  assert.equal(request.skills, skills);
  assert.deepEqual(request.features, {
    isAnimated: false,
    usesMouse: true,
  });
  assert.match(skills, /Skill: figma-shader-coder/);
  assert.match(skills, /Skill: Figma shader module contract \(v3\)/);
  assert.match(skills, /Skill: WGSL/);
  assert.match(skills, /Skill: WebGPU/);
  assert.doesNotMatch(skills, /\{\{[^}]+\}\}/);
  assert.doesNotMatch(skills, /`isAnimated` must be `false`/);
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
