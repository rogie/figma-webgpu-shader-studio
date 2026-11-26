import assert from "node:assert/strict";
import test from "node:test";
import { validateFigmaChatCompatibility } from "./figmaChatCompatibility.js";

function render(body) {
  return `export function render(device: GPUDevice, frame) { ${body} }`;
}

function rejects(source, message, options) {
  const result = validateFigmaChatCompatibility(source, options);
  assert.equal(result.ok, false);
  assert.match(result.reason, message);
}

test("accepts the official Figma module shape and the documented frame fields", () => {
  const source = `
import { defineProperties } from "figma:shaders";
export default function Layer() {}
export function setup(device, { state }) {
  const code = "diagnostic(off,derivative_uniformity); // mousePosition.down in a string";
  state.shader = device.createShaderModule({ code });
}
function prepare(frame) {
  const { x, y } = frame.mousePosition;
  return new Float32Array([x, y, frame.renderScale, frame.time]);
}
export function render(device: GPUDevice, frame) {
  const { input, output, params, deltaTime, frame: index } = frame;
  if (!input) return;
  frame.state.pointer = prepare(frame);
  frame.state.endReason = "a simulation property";
  frame.state.params = params;
  frame.state.tick = deltaTime + index;
  const pointer = frame.mousePosition;
  frame.state.x = pointer["x"];
  {
    const pointer = { down: true };
    frame.state.down = pointer.down;
  }
  output.createView();
}
defineProperties(Layer, { amount: { type: "number", defaultValue: 1 } });
`;
  assert.deepEqual(validateFigmaChatCompatibility(source, { kind: "effect" }), { ok: true });
  assert.deepEqual(validateFigmaChatCompatibility(render("frame.state.output = frame.output;")), { ok: true });
});

test("accepts the v4 held-button field in direct, aliased and destructured access", () => {
  for (const access of [
    "return frame.mousePosition.down;",
    "return frame['mousePosition']?.['down'];",
    "const current = frame; return current.mousePosition.down;",
    "const current = frame.mousePosition; return current.down;",
    "const { mousePosition } = frame; const { down: held } = mousePosition; return held;",
    "const { mousePosition: { down } } = frame; return down;",
    "let pointer; pointer = frame.mousePosition; return pointer.down;",
    "const pointer = frame.mousePosition ?? { x: 0, y: 0 }; return pointer.down;",
    "const p = (frame as any).mousePosition; return p!.down;",
    "const read = pointer => pointer.down; return read(frame.mousePosition);",
    "function read(pointer = frame.mousePosition) { return pointer.down; } return read();",
  ]) assert.deepEqual(validateFigmaChatCompatibility(render(access)), { ok: true });
});

test("rejects undocumented pointer members in direct, aliased and destructured access", () => {
  rejects(render("return frame.mousePosition.pressed;"), /frame\.mousePosition\.pressed/);
  rejects(render("const pointer = frame.mousePosition; return pointer.gestureId;"), /frame\.mousePosition\.gestureId/);
  rejects("export function render(device, { mousePosition: { endReason } }) {}", /frame\.mousePosition\.endReason/);
  rejects("function step(device, f) { return f.mousePosition.gestureId; } export { step as render };", /frame\.mousePosition\.gestureId/);
});

test("rejects unknown frame fields, dynamic frame access and pointer mutation", () => {
  rejects(render("const runtime = frame; return runtime.audio;"), /frame\.audio/);
  rejects(render("const { audio: bands } = frame; return bands;"), /frame\.audio/);
  rejects(render("return frame.params[0] + frame.pos.x;"), /frame\.pos/);
  rejects(render("const field = frame.params.field; return frame[field];"), /documented names/);
  rejects(render("return frame.mousePosition[frame.params.field];"), /named frame\.mousePosition fields: x, y, or down/);
  rejects(render("return { ...frame.mousePosition };"), /documented named frame and pointer fields/);
  rejects(render("frame.mousePosition.x = 1;"), /Only read documented shader frame and pointer fields/);
  rejects(render("let read = pointer => pointer.x; read = pointer => pointer.down; return read(frame.mousePosition);"),
    /documented named frame and pointer fields/);
});

test("fills cannot consume the input texture, including through aliases and destructuring", () => {
  for (const source of [
    render("if (frame.input) frame.input.createView();"),
    render("const runtime = frame; const { input } = runtime; if (input) input.createView();"),
    "export function render(device, { input, output }) { if (input) output.createView(); }",
  ]) {
    rejects(source, /fill cannot read frame\.input/, { kind: "fill" });
    assert.deepEqual(validateFigmaChatCompatibility(source, { kind: "effect" }), { ok: true });
  }
});

test("rejects undocumented module imports, exports, runtime declarations, and browser APIs", () => {
  rejects('import { useFrame } from "figma:react";\n' + render(""), /Only the defineProperties import/);
  rejects('import { anything } from "figma:shaders";\n' + render(""), /Only the defineProperties import/);
  rejects(render('import("some-package");'), /Dynamic imports/);
  rejects('export { render } from "external";', /External module exports/);
  rejects("export function setup() {}", /Export a render function/);
  rejects("export function initialize() {}\n" + render(""), /exports are setup and render/);
  rejects("const settings = {};\n" + render(""), /Put runtime variables/);
  rejects(render("window.addEventListener('pointerdown', () => {});"), /window is unavailable/);
  rejects(render("return globalThis['navigator'];"), /globalThis is unavailable/);
  rejects(render("return typeof fetch === 'function';"), /fetch is unavailable/);
  rejects(render("const radius = ;"), /Syntax error:/);
});
