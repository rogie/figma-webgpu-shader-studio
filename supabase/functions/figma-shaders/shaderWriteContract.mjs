export const SHADER_LIST_TOOL = "list_shaders";
export const SHADER_GET_TOOL = "get_shader";

export function listShaderToolArguments(cursor) {
  return cursor ? { cursor } : {};
}

export function getShaderToolArguments(id, version) {
  return {
    id,
    ...(version ? { version } : {}),
  };
}

export function updateShaderToolArguments({
  id,
  kind,
  mainTs,
  metadata,
  commitMessage,
}) {
  const nextMetadata = {};
  if (typeof metadata?.name === "string" && metadata.name.trim()) {
    nextMetadata.name = metadata.name.trim();
  }
  if (
    typeof metadata?.description === "string" &&
    metadata.description.trim()
  ) {
    nextMetadata.description = metadata.description.trim();
  }
  if (typeof metadata?.isAnimated === "boolean") {
    nextMetadata.isAnimated = metadata.isAnimated;
  }
  if (typeof metadata?.usesMouse === "boolean") {
    nextMetadata.usesMouse = metadata.usesMouse;
  }

  return {
    id,
    kind,
    files: [{ path: "main.ts", content: mainTs }],
    ...(Object.keys(nextMetadata).length ? { metadata: nextMetadata } : {}),
    commitMessage,
  };
}
