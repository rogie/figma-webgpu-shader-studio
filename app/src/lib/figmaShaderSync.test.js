import assert from "node:assert/strict";
import test from "node:test";
import {
  createAndDeployFigmaShader,
  figmaShaderActionLabel,
  figmaShaderDescription,
  figmaShaderProgressMessage,
  figmaShaderSuccessMessage,
} from "./figmaShaderSync.js";

test("Figma menu and toast labels reflect kind and linkage", () => {
  assert.equal(
    figmaShaderActionLabel({ linked: false, kind: "effect" }),
    "Create shader effect"
  );
  assert.equal(
    figmaShaderActionLabel({ linked: true, kind: "fill" }),
    "Update shader fill"
  );
  assert.equal(
    figmaShaderProgressMessage("create", "effect"),
    "Creating shader effect in Figma via MCP…"
  );
  assert.equal(
    figmaShaderSuccessMessage("update", "fill"),
    "Shader fill updated in Figma"
  );
});

test("create persists the scaffold link before deploying source", async () => {
  const events = [];
  const result = await createAndDeployFigmaShader({
    snapshot: {
      name: "Glow",
      description: "A warm glow blooms around the brightest details.",
      kind: "effect",
      mainTs: "export default function Effect() {}",
      isAnimated: true,
      usesMouse: false,
    },
    planKey: "organization::123",
    create: async (args) => {
      events.push(["create", args]);
      return { id: "shader-1", kind: "effect", version: null };
    },
    update: async (args) => {
      events.push(["update", args]);
      return { id: "shader-1", kind: "effect", version: "v2" };
    },
    persistLink: async (link) => events.push(["persist", link]),
  });

  assert.deepEqual(
    events.map(([event]) => event),
    ["create", "persist", "update", "persist"]
  );
  assert.equal(result.figma_shader_version, "v2");
  assert.equal(
    events.find(([event]) => event === "create")[1].description,
    "A warm glow blooms around the brightest details."
  );
  assert.deepEqual(
    {
      isAnimated: events.find(([event]) => event === "update")[1].isAnimated,
      usesMouse: events.find(([event]) => event === "update")[1].usesMouse,
    },
    { isAnimated: true, usesMouse: false }
  );
});

test("Figma creation falls back when no generated description exists", () => {
  assert.equal(
    figmaShaderDescription({ kind: "fill", description: "  " }),
    "Shader fill created in Shader Studio."
  );
});

test("a failed initial deploy leaves the created link available for retry", async () => {
  const persisted = [];
  await assert.rejects(
    createAndDeployFigmaShader({
      snapshot: {
        name: "Glow",
        kind: "effect",
        mainTs: "broken",
        isAnimated: false,
        usesMouse: false,
      },
      planKey: "organization::123",
      create: async () => ({ id: "shader-1", kind: "effect" }),
      update: async () => {
        throw new Error("Build failed");
      },
      persistLink: async (link) => persisted.push(link),
    }),
    /Build failed/
  );
  assert.deepEqual(persisted, [
    {
      figma_shader_id: "shader-1",
      figma_shader_kind: "effect",
      figma_shader_version: null,
    },
  ]);
});
