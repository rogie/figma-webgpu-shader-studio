import assert from "node:assert/strict";
import test from "node:test";
import { buildFigmaShaderPackage } from "../runtime/exportFigma.js";
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

test("create/update stubs refuse write until Figma ships it", () => {
  assert.throws(
    () => createFigmaShader(),
    (error) =>
      error instanceof FigmaShadersError &&
      error.code === "write_not_supported"
  );
  assert.throws(
    () => updateFigmaShader(),
    (error) =>
      error instanceof FigmaShadersError &&
      error.code === "write_not_supported"
  );
});
