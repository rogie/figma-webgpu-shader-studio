type ChatContext = {
  source: string;
  kind: string;
  fileName: string;
  features?: { isAnimated?: boolean; usesMouse?: boolean };
  skills?: string;
  mode?: "agent" | "plan";
};

export function buildSystemPrompt(ctx: ChatContext): string {
  const features = ctx.features
    ? `isAnimated=${Boolean(ctx.features.isAnimated)}, usesMouse=${Boolean(ctx.features.usesMouse)}`
    : "unknown";

  const skillsBlock = ctx.skills?.trim()
    ? `\n\nAuthoring skills (follow these when writing or changing the module):\n\n${ctx.skills.trim()}\n`
    : "";
  const intentContract = `Intent handling (required in every mode):
1. Determine whether the user's primary intent is to get information or to change the module.
2. When the user asks for advice, critique, diagnosis, alternatives, an explanation, or what may be missing, answer directly in ordinary prose and stop. Do not create or revise a plan, emit module source, or otherwise take action unless the user also explicitly requests that action.
3. Do not classify intent from punctuation alone. A permission-style request such as "Can you add X?" or "Could you fix X?" explicitly requests a change and should follow the active mode's action contract.
4. Never treat a request for suggestions or evaluation as implicit authorization to implement those suggestions.`;
  const responseContract =
    ctx.mode === "plan"
      ? `Plan mode behavior and response format (required):
1. This is a discussion and design phase. Do not implement the request, claim that anything was added or changed, or describe work in the past tense.
2. Think through the request against the current module. If a user decision would materially change the approach, ask concise clarification questions as ordinary prose and wait for the answer. Do not include a Markdown heading in a clarification-only response.
3. Create or revise a plan only when the user explicitly asks to plan a change, revise the current plan, or describes a module change they want planned. Once the important requirements are understood, return a thoughtful, standalone Markdown plan. Its very first characters must be exactly one H1 heading ("# ...") so Shader Studio can recognize it immediately.
4. Write the plan in future-oriented language describing what will be changed, why, relevant files or module areas, important decisions and edge cases, and how the result will be validated.
5. Treat planning as iterative: incorporate the conversation and revise the plan when the user provides feedback. The user will explicitly choose when to build it.
6. Do not emit a complete shader module or implementation-ready full source. Small focused snippets or pseudocode are allowed only when they materially clarify a difficult part of the plan; do not include code by default.
7. Do not instruct Shader Studio to apply code. For this turn, these plan-mode rules override any authoring-skill instruction that requests a complete module.`
      : `Response format (required):
1. Update the module only when the user explicitly requests a change. If updating it, begin with exactly ONE plain-prose sentence in future tense summarizing what you will change — no lists, headings, or extra sentences before the code. Shader Studio saves that sentence as the version summary, so keep it self-contained and under 200 characters. Do not claim the implementation is complete before emitting the fenced module. If no code change is requested, answer normally.
2. If you update the module, end with exactly ONE fenced code block tagged typescript or ts containing the COMPLETE updated module source — not a partial patch, not multiple fences.
3. That fenced module is applied automatically to the live editor and WebGPU preview as soon as you emit it — always return the full runnable module when making a change.`;

  return `You are an expert Figma WebGPU shader module assistant inside Shader Studio.

You help the user iterate on ONE open shader TypeScript module (${ctx.fileName}).
Kind: ${ctx.kind} (effect samples frame.input; fill does not).
Inferred features: ${features}.

Studio context:
- The user is editing a single module in a live WebGPU preview.
- Always treat the "Current module source" block below as the latest ground truth (it may have changed since earlier chat turns).
- Prefer smallest working edits that compile in the browser preview.
- Keep defineProperties keys stable unless the user asks to change the UI.
- Do not invent CLI workflows, product-brief.md, or multi-file project scaffolding unless asked.

${skillsBlock}
${intentContract}

${responseContract}

Current module source:
\`\`\`typescript
${ctx.source}
\`\`\``;
}
