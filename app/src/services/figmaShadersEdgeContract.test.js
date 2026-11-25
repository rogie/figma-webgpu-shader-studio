import assert from "node:assert/strict";
import test from "node:test";
import {
  figmaPlansFromWhoamiPayload,
  getShaderToolArguments,
  listShaderToolArguments,
  SHADER_GET_TOOL,
  SHADER_LIST_TOOL,
  updateShaderToolArguments,
} from "../../../supabase/functions/figma-shaders/shaderWriteContract.mjs";

test("edge reads use the unified staging MCP shader tools", () => {
  assert.equal(SHADER_LIST_TOOL, "list_shaders");
  assert.equal(SHADER_GET_TOOL, "get_shader");
  assert.deepEqual(listShaderToolArguments(), {});
  assert.deepEqual(listShaderToolArguments("next-page"), {
    cursor: "next-page",
  });
  assert.deepEqual(getShaderToolArguments("shader-1", "commit-sha"), {
    id: "shader-1",
    version: "commit-sha",
  });
});

test("edge update uses the current staging MCP files contract", () => {
  const args = updateShaderToolArguments({
    id: "shader-1",
    kind: "effect",
    mainTs: "export function render(device, frame) { return frame.mousePosition.down }",
    metadata: {
      name: "Press effect",
      description: "Responds to a primary-button press.",
      isAnimated: false,
      usesMouse: true,
    },
    commitMessage: "Update effect",
    versionDescription: "Added a press response.",
    versionDetail: "The shader reads primary-button state at render time.",
  });

  assert.deepEqual(args, {
    id: "shader-1",
    kind: "effect",
    files: [{
      path: "main.ts",
      content: "export function render(device, frame) { return frame.mousePosition.down }",
    }],
    metadata: {
      name: "Press effect",
      description: "Responds to a primary-button press.",
      isAnimated: false,
      usesMouse: true,
    },
    commitMessage: "Update effect",
    versionDescription: "Added a press response.",
    versionDetail: "The shader reads primary-button state at render time.",
  });
  assert.equal("mainTs" in args, false);
});

test("edge reads plans from current and legacy whoami payloads", () => {
  const plans = [{
    key: "team::123",
    name: "Shader team",
    seat: "Full",
  }];

  assert.deepEqual(figmaPlansFromWhoamiPayload({ whoami: { plans } }), plans);
  assert.deepEqual(figmaPlansFromWhoamiPayload({ plans }), plans);
  assert.deepEqual(figmaPlansFromWhoamiPayload({ whoami: {} }), []);
});
