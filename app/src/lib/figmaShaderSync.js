export function figmaShaderKindLabel(kind) {
  return kind === "fill" ? "fill" : "effect";
}

export function figmaShaderActionLabel({ linked, kind }) {
  return `${linked ? "Update" : "Create"} shader ${figmaShaderKindLabel(kind)}`;
}

export function figmaShaderProgressMessage(operation, kind) {
  return `${
    operation === "create" ? "Creating" : "Updating"
  } shader ${figmaShaderKindLabel(kind)} in Figma via MCP…`;
}

export function figmaShaderSuccessMessage(operation, kind) {
  return `Shader ${figmaShaderKindLabel(kind)} ${
    operation === "create" ? "created" : "updated"
  } in Figma`;
}

export async function createAndDeployFigmaShader({
  snapshot,
  planKey,
  create,
  update,
  persistLink,
}) {
  const created = await create({
    name: snapshot.name,
    description: `Shader ${figmaShaderKindLabel(
      snapshot.kind
    )} created in Shader Studio.`,
    planKey,
    kind: snapshot.kind,
  });
  const link = {
    figma_shader_id: created.id,
    figma_shader_kind: snapshot.kind,
    figma_shader_version: created.version || null,
  };
  await persistLink(link);
  const deployed = await update({
    id: created.id,
    kind: snapshot.kind,
    mainTs: snapshot.mainTs,
    isAnimated: snapshot.isAnimated,
    usesMouse: snapshot.usesMouse,
    commitMessage: `Create ${snapshot.name} from Shader Studio`,
  });
  const deployedLink = {
    ...link,
    figma_shader_version: deployed.version || created.version || null,
  };
  await persistLink(deployedLink);
  return deployedLink;
}
