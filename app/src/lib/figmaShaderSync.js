import { inferFeatures } from "../runtime/params.js";

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

export function figmaShaderDescription(snapshot) {
  const description =
    typeof snapshot?.description === "string"
      ? snapshot.description.replace(/\s+/g, " ").trim().slice(0, 1000)
      : "";
  return (
    description ||
    `Shader ${figmaShaderKindLabel(snapshot?.kind)} created in Shader Studio.`
  );
}

export function figmaShaderUpdateMetadata(snapshot) {
  const inferred = inferFeatures(snapshot?.mainTs || snapshot?.source || "");
  return {
    name:
      typeof snapshot?.name === "string" && snapshot.name.trim()
        ? snapshot.name.trim()
        : "Untitled Shader",
    description: figmaShaderDescription(snapshot),
    isAnimated:
      typeof snapshot?.features?.isAnimated === "boolean"
        ? snapshot.features.isAnimated
        : inferred.isAnimated,
    usesMouse:
      typeof snapshot?.features?.usesMouse === "boolean"
        ? snapshot.features.usesMouse
        : inferred.usesMouse,
  };
}

export async function createAndDeployFigmaShader({
  snapshot,
  planKey,
  create,
  get,
  update,
  persistLink,
}) {
  const metadata = figmaShaderUpdateMetadata(snapshot);
  const created = await create({
    name: metadata.name,
    description: metadata.description,
    planKey,
    kind: snapshot.kind,
  });
  const link = {
    figma_shader_id: created.id,
    figma_shader_kind: snapshot.kind,
    figma_shader_version: created.version || null,
  };
  await persistLink(link);
  if (typeof get === "function") {
    await get(created.id);
  }
  const deployed = await update({
    id: created.id,
    kind: snapshot.kind,
    mainTs: snapshot.mainTs,
    metadata,
    commitMessage: `Create ${metadata.name} from Shader Studio`,
  });
  const deployedLink = {
    ...link,
    figma_shader_version: deployed.version || created.version || null,
  };
  await persistLink(deployedLink);
  return deployedLink;
}
