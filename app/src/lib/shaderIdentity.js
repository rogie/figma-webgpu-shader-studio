export function shaderContentFingerprint({
  name,
  description,
  source,
  parameterValues,
  features,
  composition,
}) {
  return JSON.stringify({
    name: name || "",
    description: description || "",
    source: source || "",
    parameterValues: parameterValues || {},
    features: features || {},
    composition: composition || {},
  });
}

export function cloudChoiceId(id) {
  return `cloud:${id}`;
}

export function isDraftId(id) {
  return typeof id === "string" && id.startsWith("draft:");
}

export function cloudIdForDraft(id) {
  return isDraftId(id) ? id.slice("draft:".length) : id;
}

export function figmaShaderLink(shader) {
  return {
    figma_shader_id:
      typeof shader?.figma_shader_id === "string"
        ? shader.figma_shader_id
        : null,
    figma_shader_kind:
      shader?.figma_shader_kind === "effect" ||
      shader?.figma_shader_kind === "fill"
        ? shader.figma_shader_kind
        : null,
    figma_shader_version:
      typeof shader?.figma_shader_version === "string"
        ? shader.figma_shader_version
        : null,
  };
}
