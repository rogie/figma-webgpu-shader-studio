import figmaShaderCoderSkill from "../../../skills/figma-shader-coder/SKILL.md?raw";
import canvasHandlesSkill from "../../../skills/canvas-handles/SKILL.md?raw";
import v3Template from "../../../skills/v3.md.tmpl?raw";
import webgpuSkill from "../../../skills/webgpu/SKILL.md?raw";
import wgslSkill from "../../../skills/wgsl/SKILL.md?raw";

/**
 * Strip Go template markers from v3.md.tmpl while keeping animation/mouse
 * guidance (always relevant in the studio preview).
 */
function normalizeV3Guide(text) {
  const tokenPattern = /\{\{-?\s*([^{}]+?)\s*-?\}\}/g;
  const parents = [];
  let active = true;
  let cursor = 0;
  let normalized = "";
  let match;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (active) normalized += text.slice(cursor, match.index);
    const directive = match[1].trim();
    if (/^if\s+\.animations$/.test(directive)) {
      parents.push(active);
    } else if (directive === "else") {
      active = false;
    } else if (directive === "end") {
      active = parents.pop() ?? true;
    }
    cursor = tokenPattern.lastIndex;
  }
  if (active) normalized += text.slice(cursor);

  return normalized.replace(/\n{3,}/g, "\n\n").trim();
}

const CANVAS_HANDLES_CONTEXT = `## Skill: Figma shader canvas handles

${canvasHandlesSkill.trim()}`;

const PLAN_SKILL_CONTEXT = `# Shader Studio planning context

- Use the current module source, shader kind, and inferred features as technical ground truth.
- Evaluate the requested change for Figma WebGPU and WGSL feasibility, including properties, rendering stages, resources, animation, mouse input, alpha handling, and performance where relevant.
- Keep the plan concise while including enough behavior, decisions, edge cases, and validation to implement it without guessing.
- Do not follow file-writing, CLI, recipe, deployment, or complete-module output instructions while planning.

${CANVAS_HANDLES_CONTEXT}`;

let cachedAuthoring = null;

/**
 * Authoring skills + Figma shader contract for chat system context.
 * Sent with each chat request so the model can write valid studio modules.
 */
export function getChatSkillContext(mode = "agent") {
  if (mode === "plan") return PLAN_SKILL_CONTEXT;
  if (cachedAuthoring) return cachedAuthoring;
  cachedAuthoring = [
    "# Shader Studio authoring skills",
    "",
    "Follow these skills when editing the open Figma WebGPU shader module.",
    "Ignore CLI-only steps (figma shader build/overwrite-using-recipe, product-brief.md,",
    "target directories). In this studio the deliverable is the single open TypeScript",
    "module source shown in context; the live preview compiles it in-browser.",
    "",
    "## Skill: defineProperties label casing",
    "",
    "- Write every user-facing `label` inside `defineProperties` in sentence case.",
    "- This applies to property labels and option labels.",
    "- Capitalize only the first word plus proper nouns and acronyms; for example,",
    '  use `"Light source"` instead of `"Light Source"` and `"Blue noise"` instead',
    '  of `"Blue Noise"`.',
    "- Before returning a module, review all `defineProperties` labels and correct",
    "  any title-case labels, even when the surrounding property was unchanged.",
    "",
    CANVAS_HANDLES_CONTEXT,
    "",
    "## Skill: figma-shader-coder",
    "",
    figmaShaderCoderSkill.trim(),
    "",
    "## Skill: Figma shader module contract (v3)",
    "",
    normalizeV3Guide(v3Template),
    "",
    "## Skill: WGSL",
    "",
    wgslSkill.trim(),
    "",
    "## Skill: WebGPU",
    "",
    webgpuSkill.trim(),
  ].join("\n");
  return cachedAuthoring;
}
