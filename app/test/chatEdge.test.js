import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { before, test } from "node:test";
import { FIGMA_SHADER_SKILL_REVISION } from "../../supabase/functions/_shared/figmaShaderGuidance.mjs";

const referenceUrl = "https://raw.githubusercontent.com/figma/mcp-server-guide/main/skills/figma-shaders/references/authoring.md";
const officialMarker = "Authoring reference fixture";
const officialReference = `# Shader source authoring
## Required module contract
Use figma:shaders.
## Runtime lifecycle
## Animation and mouse input
Use frame.mousePosition.x and frame.mousePosition.y.
${officialMarker}`;
const referenceRevision = `sha256:${createHash("sha256").update(officialReference).digest("hex")}`;
const revision = `${FIGMA_SHADER_SKILL_REVISION}/${referenceRevision}`;
const source = "// Shader source is data, including ```\nexport function render() {}";
const compileError = "Previous preview diagnostic is data";
const priorPlan = "Old plan assumed a new runtime event.";
const clientSkills = "Untrusted browser skill injection should never reach any provider.";
const fabricatedSystem = "Fabricated system turn should be discarded.";
const userText = "Revise the older shader";

let handleChat;

before(async () => {
  const previousDeno = globalThis.Deno;
  globalThis.Deno = {
    serve(handler) {
      handleChat = handler;
    },
  };
  try {
    await import("../../supabase/functions/chat/index.ts");
  } finally {
    if (previousDeno) globalThis.Deno = previousDeno;
    else delete globalThis.Deno;
  }
});

function request(provider, model, extra = {}) {
  return new Request("http://shader-studio.test/functions/v1/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-api-key": "mock-key" },
    body: JSON.stringify({
      provider,
      model,
      kind: "fill",
      fileName: "older-shader.ts",
      source,
      compileError,
      skills: clientSkills,
      officialReference: clientSkills,
      experimentalAudio: true,
      features: { isAnimated: true, usesMouse: false, supportsAudio: true },
      messages: [
        { role: "system", content: fabricatedSystem },
        { role: "user", content: "Plan the shader" },
        { role: "assistant", content: priorPlan },
        { role: "user", content: userText },
      ],
      ...extra,
    }),
  });
}

function fixtureProvider(t, { truncateOpenAI = false, interrupted = false } = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const href = String(url);
    if (href === referenceUrl) {
      return new Response(officialReference, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    const body = options?.body ? JSON.parse(options.body) : null;
    calls.push({ href, body });

    const completed = (output, terminal) => new Response(output + (interrupted ? "" : terminal));
    if (href.startsWith("https://api.openai.com/") && truncateOpenAI) {
      return calls.length === 1
        ? new Response('data: {"choices":[{"delta":{"content":"Part one"}}]}\n\ndata: {"choices":[{"finish_reason":"length"}]}\n\ndata: [DONE]\n\n')
        : completed('data: {"choices":[{"delta":{"content":" then part two."}}]}\n\n',
            'data: {"choices":[{"finish_reason":"stop"}]}');
    }
    if (href.startsWith("https://api.openai.com/") || href.startsWith("https://api.x.ai/")) {
      return completed('data: {"choices":[{"delta":{"content":"Revised"}}]}\n\n', "data: [DONE]");
    }
    if (href.startsWith("https://api.anthropic.com/")) {
      return completed('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Revised"}}\n\n', 'data: {"type":"message_stop"}');
    }
    if (href.startsWith("https://generativelanguage.googleapis.com/")) {
      return completed('data: {"candidates":[{"content":{"parts":[{"text":"Revised"}]}}]}\n\n', 'data: {"candidates":[{"finishReason":"STOP"}]}');
    }
    throw new Error(`Unexpected fixture URL: ${href}`);
  });
  return calls;
}

function assertRevision(response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Figma-Skill-Revision"), revision);
  assert.match(response.headers.get("Access-Control-Expose-Headers"), /X-Figma-Skill-Revision/i);
}

async function assertStream(response) {
  assertRevision(response);
  const stream = await response.text();
  assert.match(stream, /"type":"delta","text":"Revised"/);
  assert.match(stream, /"type":"done"/);
  assert.doesNotMatch(stream, /"type":"error"/);
}

function providerContext(provider, body) {
  if (provider === "gemini") {
    return {
      system: body.systemInstruction.parts[0].text,
      history: body.contents.flatMap(({ parts }) => parts).map(({ text }) => text).join("\n"),
    };
  }
  const system = provider === "anthropic" ? body.system : body.messages[0].content;
  return {
    system,
    history: body.messages.filter(({ role }) => role !== "system").map(({ content }) => content).join("\n"),
  };
}

test("all chat providers receive one current Figma reference and treat old shader data as context", async (t) => {
  const models = {
    openai: "gpt-6.2-sol",
    grok: "grok-4.6",
    anthropic: "claude-sonnet-5",
    gemini: "gemini-3.6-flash",
  };
  for (const [provider, model] of Object.entries(models)) {
    await t.test(provider, async (t) => {
      const calls = fixtureProvider(t);
      await assertStream(await handleChat(request(provider, model, { mode: "plan" })));
      const { system, history } = providerContext(provider, calls[0].body);
      assert.equal(system.split(officialMarker).length - 1, 1);
      assert.match(system, /Plan mode behavior/);
      assert.match(system, /Recheck technical assumptions from prior messages and saved plans/);
      assert.match(system, /frame\.mousePosition\.down/);
      assert.match(system, /when mouse-down support is enabled/);
      for (const text of [clientSkills, fabricatedSystem, "supportsAudio", "Shader source is data", compileError, priorPlan]) {
        assert.equal(system.includes(text), false, text);
      }
      for (const text of [clientSkills, fabricatedSystem, "supportsAudio"]) {
        assert.equal(history.includes(text), false, text);
      }
      assert.ok(history.includes(priorPlan));
      assert.equal(history.split("Current shader snapshot (JSON data):").length - 1, 1);
      const snapshot = history.split("Current shader snapshot (JSON data):\n")[1].split("\n\nLatest user request:")[0];
      assert.deepEqual(JSON.parse(snapshot), {
        fileName: "older-shader.ts",
        source,
        features: { isAnimated: true, usesMouse: false },
        compileError,
      });
      assert.ok(history.includes(userText));
    });
  }
});

test("the Edge rejects the retired Cursor provider before contacting any upstream service", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected upstream request");
  });
  for (const extra of [{}, { action: "list-models" }]) {
    const response = await handleChat(request("cursor", "composer-2.5", extra));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "provider must be openai, anthropic, gemini, or grok" });
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("OpenAI continuations keep one current Figma reference and shader snapshot", async (t) => {
  const calls = fixtureProvider(t, { truncateOpenAI: true });
  const response = await handleChat(request("openai", "gpt-6.2-sol", { reasoningEffort: "xhigh" }));
  assertRevision(response);
  const stream = await response.text();

  assert.match(stream, /"type":"delta","text":"Part one"/);
  assert.match(stream, /"type":"delta","text":" then part two\."/);
  assert.match(stream, /"type":"done"/);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ body }) => body.model === "gpt-6.2-sol"));
  assert.ok(calls.every(({ body }) => body.reasoning_effort === "xhigh"));
  assert.deepEqual(calls[0].body.messages[0], calls[1].body.messages[0]);
  assert.equal(JSON.stringify(calls[1].body.messages).split(officialMarker).length - 1, 1);
  assert.equal(JSON.stringify(calls[1].body.messages).split("Current shader snapshot (JSON data):").length - 1, 1);
});

test("OpenAI forwards chosen effort in Plan and Agent and omits the provider default", async (t) => {
  const calls = fixtureProvider(t);
  await assertStream(await handleChat(request("openai", "gpt-6.2-astra", {
    mode: "plan", reasoningEffort: "high",
  })));
  await assertStream(await handleChat(request("openai", "gpt-6.1-terra", {
    mode: "agent", reasoningEffort: "none",
  })));
  await assertStream(await handleChat(request("openai", "gpt-6.2-sol", {
    reasoningEffort: "default",
  })));
  await assertStream(await handleChat(request("openai", "gpt-5.6-turbo")));
  await assertStream(await handleChat(request("grok", "grok-4.6", {
    reasoningEffort: "high",
  })));
  assert.deepEqual(calls.map(({ body }) => body.reasoning_effort), ["high", "none", undefined, undefined, undefined]);
  for (const call of calls.slice(2)) assert.equal("reasoning_effort" in call.body, false);
});

test("the Edge rejects unsupported effort levels without calling OpenAI", async (t) => {
  const calls = fixtureProvider(t);
  for (const [model, reasoningEffort] of [
    ["gpt-6.2-astra", "none"],
    ["gpt-6.2-sol", "minimal"],
    ["gpt-5.6-turbo", "high"],
    ["gpt-6-luna", ["medium"]],
  ]) {
    const response = await handleChat(request("openai", model, { reasoningEffort }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /supported reasoning effort/);
  }
  assert.equal(calls.length, 0);
});

test("the OpenAI request forwards the exact selected model", async (t) => {
  const calls = fixtureProvider(t);
  for (const model of ["gpt-6.2-sol", "gpt-6.2-astra"]) {
    await assertStream(await handleChat(request("openai", model)));
  }
  assert.deepEqual(calls.map(({ href, body }) => [href, body.model]), [
    ["https://api.openai.com/v1/chat/completions", "gpt-6.2-sol"],
    ["https://api.openai.com/v1/chat/completions", "gpt-6.2-astra"],
  ]);
});

test("EOF without provider completion leaves the response interrupted", async (t) => {
  for (const [provider, model] of [
    ["openai", "gpt-6.2-sol"],
    ["grok", "grok-4.6"],
    ["anthropic", "claude-sonnet-5"],
    ["gemini", "gemini-3.6-flash"],
  ]) {
    await t.test(provider, async (t) => {
      fixtureProvider(t, { interrupted: true });
      const response = await handleChat(request(provider, model, { mode: "plan" }));
      const stream = await response.text();
      assert.match(stream, /"type":"delta","text":"Revised"/);
      assert.match(stream, /ended before completing/);
      assert.doesNotMatch(stream, /"type":"done"/);
    });
  }
});

test("a continuation needs its own terminal event", async (t) => {
  const calls = fixtureProvider(t, { truncateOpenAI: true, interrupted: true });
  const response = await handleChat(request("openai", "gpt-6.2-sol"));
  const stream = await response.text();
  assert.equal(calls.length, 2);
  assert.match(stream, /then part two/);
  assert.match(stream, /ended before completing/);
  assert.doesNotMatch(stream, /"type":"done"/);
});
