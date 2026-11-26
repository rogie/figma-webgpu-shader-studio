import assert from "node:assert/strict";
import test from "node:test";
import { validateChatModuleSource } from "./chatValidation.js";

function shaderWithProperty(property) {
  return `import { defineProperties } from "figma:shaders";
export default function Shader() {}
export function render(device, frame) { return frame.output; }
defineProperties(Shader, { mode: ${property} });`;
}

test("chat applies Figma property and control rules to the evaluated schema", () => {
  assert.deepEqual(validateChatModuleSource(shaderWithProperty(`{
    type: "number", control: "select", defaultValue: 0,
    options: [{ value: 0, label: "Soft" }, { value: 1, label: "Hard" }],
  }`), "fill"), { ok: true });

  for (const [property, reason] of [
    ['{ type: "custom-control" }', /property type/],
    ['{ type: "number", control: "unreviewed" }', /number control/],
    ['{ type: "number", control: "select", options: [{ value: "hard" }] }', /numeric menu options/],
  ]) {
    const result = validateChatModuleSource(shaderWithProperty(property), "fill");
    assert.equal(result.ok, false);
    assert.match(result.reason, reason);
  }
});
