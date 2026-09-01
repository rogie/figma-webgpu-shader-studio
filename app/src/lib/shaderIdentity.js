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

export function shaderMetadataUnchanged(current, payload) {
  if (!current || !payload) return false;
  const currentLink = figmaShaderLink(current);
  const nextLink = figmaShaderLink(payload);
  if ((current.name || "") !== (payload.name || "")) return false;
  if ((current.description || "") !== (payload.description || "")) {
    return false;
  }
  if (currentLink.figma_shader_id !== nextLink.figma_shader_id) return false;
  if (currentLink.figma_shader_kind !== nextLink.figma_shader_kind) {
    return false;
  }
  if (currentLink.figma_shader_version !== nextLink.figma_shader_version) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(payload, "is_public") &&
    Boolean(current.is_public) !== Boolean(payload.is_public)
  ) {
    return false;
  }
  return true;
}
