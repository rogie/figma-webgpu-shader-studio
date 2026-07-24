import figmaShaderCoderSkill from "../../../skills/figma-shader-coder/SKILL.md?raw";
import v3Template from "../../../skills/v3.md.tmpl?raw";
import webgpuSkill from "../../../skills/webgpu/SKILL.md?raw";
import wgslSkill from "../../../skills/wgsl/SKILL.md?raw";

/**
 * Strip Go template markers from v3.md.tmpl while keeping animation/mouse
 * guidance (always relevant in the studio preview).
 */
function normalizeV3Guide(text) {
  return text
    .replace(/\{\{-?\s*if\s+\.animations\s*\}\}/g, "")
    .replace(/\{\{-?\s*end\s*\}\}/g, "")
    .replace(/\{\{-?\s*else\s*\}\}[\s\S]*?(?=\{\{-?\s*end\s*\}\})/g, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

let cached = null;

/**
 * Authoring skills + Figma shader contract for chat system context.
 * Sent with each chat request so the model can write valid studio modules.
 */
export function getChatSkillContext() {
  if (cached) return cached;
  cached = [
    "# Shader Studio authoring skills",
    "",
    "Follow these skills when editing the open Figma WebGPU shader module.",
    "Ignore CLI-only steps (figma shader build/overwrite-using-recipe, product-brief.md,",
    "target directories). In this studio the deliverable is the single open TypeScript",
    "module source shown in context; the live preview compiles it in-browser.",
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
  return cached;
}
