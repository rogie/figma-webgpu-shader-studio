import assert from "node:assert/strict";
import test from "node:test";
import { figmaShaderLanguage } from "./codeLanguage.js";

function innerNodeAt(source, needle) {
  const tree = figmaShaderLanguage.language.parser.parse(source);
  return tree.resolveInner(source.indexOf(needle) + 1).name;
}

test("parses WGSL template contents as nested shader syntax", () => {
  const source =
    "const code = `@fragment fn main() { let color: vec4f = vec4f(1.0); }`";
  assert.equal(innerNodeAt(source, "vec4f"), "Type");
});

test("leaves ordinary and interpolated templates as TypeScript", () => {
  assert.equal(innerNodeAt("const text = `hello world`", "hello"), "TemplateString");
  assert.equal(
    innerNodeAt("const code = `@fragment fn ${entry}() {}`", "entry"),
    "VariableName"
  );
});
