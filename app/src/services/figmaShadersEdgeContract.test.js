import assert from "node:assert/strict";
import test from "node:test";
import { updateShaderToolArguments } from "../../../supabase/functions/figma-shaders/shaderWriteContract.mjs";

test("edge update uses the current staging MCP files contract", () => {
  const args = updateShaderToolArguments({
    id: "shader-1",
    kind: "effect",
    mainTs: "export default function Effect() {}",
    commitMessage: "Update effect",
  });

  assert.deepEqual(args, {
    id: "shader-1",
    kind: "effect",
    files: [{
      path: "main.ts",
      content: "export default function Effect() {}",
    }],
    commitMessage: "Update effect",
  });
  assert.equal("mainTs" in args, false);
});
