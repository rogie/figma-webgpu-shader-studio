import { getFigmaShaderContext } from "../../../supabase/functions/_shared/figmaShaderGuidance.mjs";

export { FIGMA_SHADER_SKILL_REVISION } from "../../../supabase/functions/_shared/figmaShaderGuidance.mjs";

// Compatibility with chat proxies deployed before skills became server-owned.
export function getChatSkillContext(mode) {
  return getFigmaShaderContext(mode);
}
