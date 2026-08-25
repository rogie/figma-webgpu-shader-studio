import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import {
  buildFigmaShaderPackage,
  buildFigmaShaderZip,
} from "../runtime/exportFigma.js";
import {
  createFigmaShader,
  updateFigmaShader,
  FigmaShadersError,
} from "./figmaShadersWrite.js";

test("buildFigmaShaderPackage emits version-2 features.json", () => {
  const source = `
export default class Shader {
  main() {
    return frame.time;
  }
}
`;
  const pkg = buildFigmaShaderPackage(source, "Demo");
  assert.equal(pkg.mainTs, source);
  assert.match(pkg.featuresJson, /"name": "Demo"/);
  assert.match(pkg.featuresJson, /"version": 2/);
  assert.equal(pkg.features.name, "Demo");
  assert.equal(pkg.features.version, 2);
  assert.equal(pkg.features.isAnimated, true);
});

test("buildFigmaShaderZip bundles source and inferred mouse features", async () => {
  const source = `
// frame.time must not mark this shader as animated.
export function render(device, frame) {
  return frame.mousePosition.x;
}
`;
  const archive = await buildFigmaShaderZip(source, "Cursor/Glow");
  const files = unzipSync(archive.bytes);

  assert.equal(archive.filename, "Cursor-Glow.zip");
  assert.deepEqual(Object.keys(files).sort(), ["features.json", "main.ts"]);
  assert.equal(strFromU8(files["main.ts"]), source);
  assert.deepEqual(JSON.parse(strFromU8(files["features.json"])), {
    version: 2,
    name: "Cursor/Glow",
    isAnimated: false,
    usesMouse: true,
  });
});

test("createFigmaShader sends the staging MCP proxy contract", async () => {
  const calls = [];
  const result = await createFigmaShader(
    async (body, options) => {
      calls.push({ body, options });
      return { id: "shader-1", kind: "effect", version: "v1" };
    },
    {
      name: "Glow",
      description: "Adds a glow",
      planKey: "organization::123",
      kind: "effect",
    },
    { token: "test-token" }
  );
  assert.deepEqual(calls, [
    {
      body: {
        op: "create",
        name: "Glow",
        description: "Adds a glow",
        planKey: "organization::123",
        kind: "effect",
      },
      options: { token: "test-token" },
    },
  ]);
  assert.deepEqual(result, {
    id: "shader-1",
    kind: "effect",
    version: "v1",
  });
});

test("updateFigmaShader sends source, feature flags, and commit message", async () => {
  const calls = [];
  const result = await updateFigmaShader(
    async (body) => {
      calls.push(body);
      return { id: "shader-1", kind: "fill", version: "v2" };
    },
    {
      id: "shader-1",
      kind: "fill",
      mainTs: "export default function Fill() {}",
      isAnimated: true,
      usesMouse: false,
      commitMessage: "Update Fill from Shader Studio",
    }
  );
  assert.deepEqual(calls[0], {
    op: "update",
    id: "shader-1",
    kind: "fill",
    mainTs: "export default function Fill() {}",
    isAnimated: true,
    usesMouse: false,
    commitMessage: "Update Fill from Shader Studio",
  });
  assert.equal(result.version, "v2");
});

test("write requests validate kind, plan, and returned id", async () => {
  await assert.rejects(
    createFigmaShader(
      async () => ({}),
      {
        name: "Glow",
        description: "Glow",
        planKey: "bad-plan",
        kind: "effect",
      }
    ),
    (error) =>
      error instanceof FigmaShadersError && error.code === "invalid_plan_key"
  );
  await assert.rejects(
    updateFigmaShader(
      async () => ({}),
      {
        id: "shader-1",
        kind: "effect",
        mainTs: "source",
        isAnimated: false,
        usesMouse: false,
        commitMessage: "Update",
      }
    ),
    (error) =>
      error instanceof FigmaShadersError && error.code === "missing_shader_id"
  );
});
