import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { isPlanMode } from "../src/lib/chatApply.js";
import {
  isPlanDocument,
  loadLocalPlan,
  planDocumentSubject,
  removeLocalPlan,
  saveLocalPlan,
  shaderPlanPath,
} from "../src/lib/chatPlans.js";
import { buildChatRequest } from "../src/lib/chatPayload.js";
import {
  loadChatThreads,
  saveChatThreads,
} from "../src/lib/chatThreads.js";
import { anthropicOutputConfig } from "../../supabase/functions/chat/anthropic.ts";
import { buildSystemPrompt } from "../../supabase/functions/chat/prompt.ts";

const storage = new Map();
globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

beforeEach(() => storage.clear());

test("chat requests normalize plan mode", () => {
  const request = buildChatRequest({
    provider: "openai",
    model: "gpt-5",
    messages: [{ role: "user", content: "Plan this change" }],
    source: "export default function Effect() {}",
    kind: "effect",
    fileName: "main.ts",
    mode: "plan",
  });

  assert.equal(request.mode, "plan");
  assert.equal(isPlanMode(request.mode), true);
  assert.equal(buildChatRequest({ mode: "unknown" }).mode, "agent");
});

test("plan prompt forbids applying a complete module", () => {
  const prompt = buildSystemPrompt({
    source: "export default function Effect() {}",
    kind: "effect",
    fileName: "main.ts",
    mode: "plan",
    skills: "Always return the complete module.",
  });

  assert.match(prompt, /discussion and design phase/);
  assert.match(prompt, /Planning context \(use for technical reasoning only\)/);
  assert.doesNotMatch(prompt, /Authoring skills \(follow these/);
  assert.match(prompt, /primary intent is to get information or to change/);
  assert.match(prompt, /what may be missing, answer directly/);
  assert.match(prompt, /Do not classify intent from punctuation alone/);
  assert.match(prompt, /Communication style \(required in every mode\)/);
  assert.match(prompt, /Prefer short, direct explanations/);
  assert.match(prompt, /Expand when the user asks for more detail/);
  assert.match(prompt, /ask concise clarification questions/);
  assert.match(prompt, /Create or revise a plan only when the user explicitly asks/);
  assert.match(prompt, /concise Markdown plan.*implement without guessing/);
  assert.match(prompt, /clear bullets over exhaustive prose/);
  assert.match(prompt, /exactly one H1 heading/);
  assert.match(prompt, /future-oriented language/);
  assert.match(prompt, /Do not emit a complete shader module/);
  assert.match(prompt, /Small focused snippets or pseudocode/);
  assert.match(prompt, /override any authoring-skill instruction/);
  assert.doesNotMatch(prompt, /applied automatically to the live editor/);
});

test("agent prompt retains the complete-module apply contract", () => {
  const prompt = buildSystemPrompt({
    source: "export default function Effect() {}",
    kind: "effect",
    fileName: "main.ts",
    mode: "agent",
  });

  assert.match(prompt, /<summary>One future-tense sentence/);
  assert.match(prompt, /<description>One plain-text paragraph/);
  assert.match(prompt, /Refresh the description to match the complete resulting shader/);
  assert.match(prompt, /primary intent is to get information or to change/);
  assert.match(prompt, /what may be missing, answer directly/);
  assert.match(prompt, /Prefer short, direct explanations/);
  assert.match(prompt, /include only decision-relevant caveats/);
  assert.match(prompt, /Update the module only when the user explicitly requests/);
  assert.match(prompt, /Can you add X/);
  assert.match(prompt, /Do not claim the implementation is complete/);
  assert.match(prompt, /COMPLETE updated module source/);
  assert.match(prompt, /applied automatically to the live editor/);
});

test("Anthropic plan requests do not force low output effort", () => {
  assert.equal(anthropicOutputConfig("claude-opus-5", "plan"), undefined);
  assert.deepEqual(anthropicOutputConfig("claude-opus-5", "agent"), {
    effort: "low",
  });
});

test("plan thread metadata survives persistence", () => {
  saveChatThreads({
    shader: [
      { role: "user", mode: "plan", content: "Plan this" },
      {
        role: "assistant",
        mode: "plan",
        planId: "plan-1",
        planApplied: true,
        content: "# Plan",
      },
      {
        role: "assistant",
        buildPlanId: "plan-1",
        applied: true,
        content: "Implemented.",
      },
    ],
  });

  assert.deepEqual(loadChatThreads().shader, [
    { role: "user", content: "Plan this", mode: "plan" },
    {
      role: "assistant",
      content: "# Plan",
      mode: "plan",
      planId: "plan-1",
      planApplied: true,
    },
    {
      role: "assistant",
      content: "Implemented.",
      buildPlanId: "plan-1",
      applied: true,
    },
  ]);
});

test("local plan fallback and deterministic cloud path", () => {
  saveLocalPlan("preset:draft:1", "# Current plan");
  assert.equal(loadLocalPlan("preset:draft:1"), "# Current plan");
  saveLocalPlan("preset:draft:1", "# Replacement plan");
  assert.equal(loadLocalPlan("preset:draft:1"), "# Replacement plan");
  assert.equal(shaderPlanPath("owner", "shader"), "owner/shader/plan.md");
  removeLocalPlan("preset:draft:1");
  assert.equal(loadLocalPlan("preset:draft:1"), "");
});

test("clarifications stay in chat while completed plan responses become plan.md", () => {
  assert.equal(isPlanDocument("# Focused implementation plan\n\n- Step one"), true);
  assert.equal(isPlanDocument("#", { allowIncomplete: true }), true);
  assert.equal(
    isPlanDocument("Anything you suggest here or anything I’m missing?", {
      allowIncomplete: true,
    }),
    false
  );
  assert.equal(isPlanDocument("What does “more fun” mean here?"), false);
  assert.equal(
    isPlanDocument("Sorry—I need one detail before planning this. Which option?"),
    false
  );
  assert.equal(
    isPlanDocument("Update the controls first, then revise the shader module."),
    false
  );
  assert.equal(isPlanDocument("- Update controls\n- Revise the shader"), false);
  assert.equal(
    planDocumentSubject("# Plan for staggered pixel rows\n\n## Steps"),
    "staggered pixel rows"
  );
  assert.equal(planDocumentSubject("# **Shape controls**"), "Shape controls");
});
