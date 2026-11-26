import { validateModuleSource } from "./chatApply.js";
import { validateFigmaChatCompatibility } from "./figmaChatCompatibility.js";
import { FIGMA_SHADER_PROPERTY_TYPES } from "../../../supabase/functions/_shared/figmaShaderGuidance.mjs";

export function validateChatModuleSource(source, kind) {
  const compatibility = validateFigmaChatCompatibility(source, { kind });
  return compatibility.ok
    ? validateModuleSource(source, { propertyTypes: FIGMA_SHADER_PROPERTY_TYPES })
    : compatibility;
}
