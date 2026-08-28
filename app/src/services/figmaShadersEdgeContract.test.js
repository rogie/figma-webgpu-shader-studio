import assert from "node:assert/strict";
import test from "node:test";
import {
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
    mainTs: "export default function Effect() {}",
    metadata: {
      name: "Animated effect",
      description: "Responds over time without reading the mouse.",
      isAnimated: true,
      usesMouse: false,
    },
    commitMessage: "Update effect",
  });

  assert.deepEqual(args, {
    id: "shader-1",
    kind: "effect",
    files: [{
      path: "main.ts",
      content: "export default function Effect() {}",
    }],
    metadata: {
      name: "Animated effect",
      description: "Responds over time without reading the mouse.",
      isAnimated: true,
      usesMouse: false,
    },
    commitMessage: "Update effect",
  });
  assert.equal("mainTs" in args, false);
});
