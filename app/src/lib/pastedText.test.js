import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePaste,
  detectLanguage,
  pastedExtension,
  pastedTitle,
  scoreLine,
  segmentPaste,
  splitComposerPaste,
} from "./pastedText.js";

const ASCIIFY = `export type AsciifyCharset = "ascii" | "blocks" | "binary";

export interface AsciifyOptions {
  /** Radius of the ascii lens around the cursor. */
  radius?: number;
  /** Size of one glyph pixel in CSS pixels. */
  scale?: number;
}

const CHARSETS: Record<AsciifyCharset, number[]> = {
  ascii: [0, 128, 131200, 14336, 459200, 469440, 4357252],
  blocks: [0, 328000, 22041621, 22369621, 11512810, 33554431],
  binary: [0, 4591758, 15324974],
};

const MAX_GLYPHS = 16;

const FRAG = \`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
void main () {
  vec4 pixel = texture(uContent, vUv);
  outColor = vec4(pixel.rgb, 1.0);
}\`;

export function supportsHtmlInCanvas(): boolean {
  if (typeof document === "undefined") return false;
  const probe = document.createElement("canvas");
  const ctx = probe.getContext("2d");
  return Boolean(ctx && typeof ctx.drawElementImage === "function");
}`;

const WGSL = `struct Frame {
  time: f32,
  deltaTime: f32,
}

@group(0) @binding(0) var<uniform> frame: Frame;

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pulse = 0.5 + 0.5 * sin(frame.time * 2.0);
  return vec4f(vec3f(pulse), 1.0);
}`;

const GLSL = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;

void main() {
  vec4 pixel = texture(uContent, vUv);
  outColor = vec4(pixel.rgb, 1.0);
}`;

test("detects the Asciify TypeScript paste and its nested GLSL", async () => {
  const language = await detectLanguage(ASCIIFY);
  assert.equal(language.id, "typescript");
  assert.ok(language.nested.includes("glsl"));
  assert.equal(pastedTitle(language.id), "Pasted typescript");
  assert.equal(pastedExtension(language.id), "ts");
});

test("does not call JSDoc or GLSL * continuations markdown", async () => {
  const paste = [
    "export interface AsciifyOptions {",
    "  /** Radius of the ascii lens around the cursor. */",
    "  radius?: number;",
    "}",
    "",
    "const FRAG = `#version 300 es",
    "precision highp float;",
    "void main () {",
    "  vec2 fringe = normalize(lensDir + 1e-5)",
    "    * clamp(uAberration, 0.0, 1.0) * 0.005",
    "    * S(uRadius * 0.15, uRadius, dist) * fringeAmp;",
    "  float mask = clamp(max(lens, clamp(uBase, 0.0, 1.0)), 0.0, 1.0)",
    "    * clamp(uStrength, 0.0, 1.0);",
    "}",
    "`;",
  ].join("\n");

  const result = await analyzePaste({ text: paste });
  assert.equal(result.best.language, "typescript");
  assert.equal(result.best.title, "Pasted typescript");
  assert.equal(
    result.candidates.some((candidate) => candidate.language === "markdown"),
    false
  );
});

test("extracts only the fenced body from prose plus a code fence", async () => {
  const paste = [
    "Here is the helper I mentioned earlier.",
    "It should be dropped straight into the module.",
    "",
    "```ts",
    "export function clamp(value: number) {",
    "  return Math.min(1, Math.max(0, value));",
    "}",
    "```",
    "",
    "Let me know if the naming works for you.",
  ].join("\n");

  const result = await analyzePaste({ text: paste });
  const code = result.candidates.find((candidate) => candidate.id === "code");
  assert.ok(code);
  assert.equal(code.language, "typescript");
  assert.match(code.text, /^export function clamp/);
  assert.doesNotMatch(code.text, /mentioned earlier/);
  assert.doesNotMatch(code.text, /naming works/);
  assert.equal(result.best.id, "code");
});

test("prose with no code yields no code candidate and a text title", async () => {
  const paste = [
    "We should revisit the lens radius before shipping this.",
    "The current value feels too tight on small screens, and the",
    "falloff reads as a hard edge rather than a soft feather.",
  ].join("\n");

  const result = await analyzePaste({ text: paste });
  assert.equal(
    result.candidates.some((candidate) => candidate.id === "code"),
    false
  );
  assert.equal(result.best.id, "raw");
  assert.equal(result.best.title, "Pasted text");
});

test("detects a pure WGSL fragment locally rather than through flourite", async () => {
  const language = await detectLanguage(WGSL);
  assert.equal(language.id, "wgsl");
  assert.equal(language.source, "local");
  assert.equal(pastedTitle(language.id), "Pasted WGSL");
});

test("detects a pure GLSL fragment locally", async () => {
  const language = await detectLanguage(GLSL);
  assert.equal(language.id, "glsl");
  assert.equal(language.source, "local");
  assert.equal(pastedTitle(language.id), "Pasted GLSL");
});

test("detects JSON instead of guessing JavaScript or YAML", async () => {
  const language = await detectLanguage(
    '{\n  "speed": 0.35,\n  "color": "#7C5CFF",\n  "layers": [1, 2, 3]\n}'
  );
  assert.equal(language.id, "json");
  assert.equal(pastedTitle(language.id), "Pasted JSON");
});

test("prefers the markdown candidate for a document with headings and a fence", async () => {
  const paste = [
    "# Shader notes",
    "",
    "Two things to fix before review:",
    "",
    "- Tighten the lens radius",
    "- Soften the chromatic fringe",
    "",
    "```ts",
    "const radius = 0.4;",
    "```",
    "",
    "See the [brief](https://example.com) for context.",
  ].join("\n");

  const result = await analyzePaste({ text: paste });
  assert.equal(result.best.id, "markdown");
  assert.equal(result.best.title, "Pasted markdown");
});

test("treats a bullet-heavy brief as plain text, not markdown", async () => {
  const paste = [
    "Build me a shader EFFECT (not a fill) that renders the layer as a 3D Gaussian",
    "splat cloud using real 3DGS math, seeded from the layer's own pixels.",
    "",
    "Setup, once:",
    "- Sample frame.input on a 96x96 grid in a compute pass to build a splat buffer.",
    "- Give each splat an anisotropic 3D covariance built from a scale vector.",
    "",
    "Per frame:",
    "1. Preprocess compute pass: build a view matrix from Yaw / Pitch / Distance.",
    "2. Sort pass: pack quantized camera-space depth into the high bits of a u32.",
    "3. Render pass: instanced quads, one per surviving splat, back-to-front.",
    "   shader evaluates exp(-0.5 * d^T conic d) * opacity for the Gaussian falloff.",
    "",
    "Hard requirements:",
    "- Output PREMULTIPLIED alpha and clear to transparent.",
    "- Allocate every buffer in setup() and reuse it.",
    "- Blend state: src factor \"one\", dst factor \"one-minus-src-alpha\".",
  ].join("\n");

  const result = await analyzePaste({ text: paste });
  assert.equal(result.best.id, "raw");
  assert.equal(result.best.language, "text");
  assert.equal(result.best.title, "Pasted text");
  assert.equal(
    result.candidates.some((candidate) => candidate.id === "markdown"),
    false
  );

  const split = await splitComposerPaste({ text: paste });
  assert.equal(split.pastes.length, 0);
  assert.match(split.content, /Build me a shader EFFECT/);
});

test("segments fenced code apart from surrounding prose", () => {
  const segments = segmentPaste(
    ["Intro line about the fix.", "```js", "const a = 1;", "```", "Outro line."].join("\n")
  );
  assert.deepEqual(
    segments.map((segment) => segment.kind),
    ["prose", "code", "prose"]
  );
  assert.equal(segments[1].fenceHint, "javascript");
  assert.equal(segments[1].text, "const a = 1;");
});

test("keeps an unfenced code paste whole", () => {
  const segments = segmentPaste(ASCIIFY);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].kind, "code");
  assert.match(segments[0].text, /ascii: \[0, 128/);
});

test("treats everything outside a fence as prose", () => {
  const segments = segmentPaste(
    [
      "# Notes",
      "",
      "```ts",
      "const radius = 0.4;",
      "```",
      "",
      "See the [brief](https://example.com) for intent.",
    ].join("\n")
  );
  assert.deepEqual(
    segments.map((segment) => segment.kind),
    ["prose", "code", "prose"]
  );
});

test("scores markdown headings and list items as prose", () => {
  assert.ok(scoreLine("# Shader review notes") < 0);
  assert.ok(scoreLine("- Tighten the default lens radius") < 0);
  assert.ok(scoreLine("const radius = 0.4;") > 0);
});

test("reads a mostly-prose paste as plain text when taken whole", async () => {
  const paste = [
    "Quick note on the helper below, it needs a rename before merge.",
    "",
    "```ts",
    "export function clamp(value: number) {",
    "  return value;",
    "}",
    "```",
  ].join("\n");

  const result = await analyzePaste({ text: paste });
  const raw = result.candidates.find((candidate) => candidate.id === "raw");
  assert.equal(raw.language, "text");
  assert.equal(raw.title, "Pasted text");
});

test("splits a mixed composer draft into chat prose and a code paste", async () => {
  const paste = [
    "Hey, here's the clamp helper we talked about in standup.",
    "",
    "```ts",
    "export function clamp(value: number, min = 0, max = 1) {",
    "  return Math.min(max, Math.max(min, value));",
    "}",
    "```",
    "",
    "Let me know if the naming works.",
  ].join("\n");

  const result = await splitComposerPaste({ text: paste });
  assert.match(result.content, /clamp helper/);
  assert.match(result.content, /naming works/);
  assert.doesNotMatch(result.content, /export function clamp/);
  assert.equal(result.pastes.length, 1);
  assert.equal(result.pastes[0].language, "typescript");
  assert.match(result.pastes[0].text, /^export function clamp/);
});

test("scores array-property rows as code, not prose", () => {
  assert.ok(
    scoreLine("  ascii: [0, 128, 131200, 14336, 459200, 469440, 4357252],") >= 0.25
  );
  assert.ok(
    scoreLine("  blocks: [0, 328000, 22041621, 22369621, 11512810, 33554431],") >=
      0.25
  );
  assert.ok(scoreLine("Hey, here's the clamp helper we talked about in standup.") < 0);
});

test("sends a whole TypeScript module as a paste with no chat prose", async () => {
  const result = await splitComposerPaste({ text: ASCIIFY });
  assert.equal(result.content, "");
  assert.equal(result.pastes.length, 1);
  assert.equal(result.pastes[0].language, "typescript");
  assert.match(result.pastes[0].text, /ascii: \[0, 128/);
  assert.match(result.pastes[0].text, /blocks: \[0, 328000/);
});

test("keeps leading human prose and pastes the TypeScript module whole", async () => {
  const result = await splitComposerPaste({
    text: `Can you tighten the lens radius a bit?\n\n${ASCIIFY}`,
  });
  assert.equal(result.content, "Can you tighten the lens radius a bit?");
  assert.equal(result.pastes.length, 1);
  assert.match(result.pastes[0].text, /ascii: \[0, 128/);
  assert.doesNotMatch(result.content, /ascii:/);
});

test("keeps wrapped WebGL argument lists inside the paste", async () => {
  const paste = [
    "Lets use this code: export interface DropletsOptions {",
    "  intensity?: number;",
    "}",
    "",
    "  gl.texParameteri(",
    "    gl.TEXTURE_2D,",
    "    gl.TEXTURE_MIN_FILTER,",
    "    gl.LINEAR_MIPMAP_LINEAR,",
    "  );",
    "",
    "export function createDroplets() {",
    "  return null;",
    "}",
  ].join("\n");

  const result = await splitComposerPaste({ text: paste });
  assert.equal(result.content, "Lets use this code:");
  assert.equal(result.pastes.length, 1);
  assert.match(result.pastes[0].text, /gl\.TEXTURE_2D/);
  assert.match(result.pastes[0].text, /LINEAR_MIPMAP_LINEAR/);
  assert.doesNotMatch(result.content, /TEXTURE_/);
});

test("scores wrapped member arguments as code", () => {
  assert.ok(
    scoreLine("    gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR,") >=
      0.25
  );
  assert.ok(scoreLine("    gl.TEXTURE_2D,") >= 0.25);
});

test("splits a short Do this: lead from an interface", async () => {
  const paste = [
    "Do this: export interface DropletsOptions {",
    "  intensity?: number;",
    "}",
  ].join("\n");

  const result = await splitComposerPaste({ text: paste });
  assert.equal(result.content, "Do this:");
  assert.equal(result.pastes.length, 1);
  assert.match(result.pastes[0].text, /^export interface DropletsOptions/);
  assert.doesNotMatch(result.content, /export interface/);
});

test("splits a same-line instruction from an unfenced function", async () => {
  const paste = [
    "Change the clamp function to: export function clamp(value: number, min = 0, max = 1) {",
    "  return Math.min(max, Math.max(min, value));",
    "}",
  ].join("\n");

  const result = await splitComposerPaste({ text: paste });
  assert.equal(result.content, "Change the clamp function to:");
  assert.equal(result.pastes.length, 1);
  assert.equal(result.pastes[0].language, "typescript");
  assert.match(result.pastes[0].text, /^export function clamp/);
  assert.doesNotMatch(result.content, /export function/);
});

test("splits a same-line instruction from flattened GLSL at precision mediump", async () => {
  const paste =
    "convert this precision mediump float; // textures uniform sampler2D u_waterMap; uniform sampler2D u_textureShine; varying vec2 v_texCoord; void main() { gl_FragColor = vec4(1.0); }";

  const result = await splitComposerPaste({ text: paste });
  assert.equal(result.content, "convert this");
  assert.equal(result.pastes.length, 1);
  assert.equal(result.pastes[0].language, "glsl");
  assert.match(result.pastes[0].text, /^precision mediump float;/);
  assert.doesNotMatch(result.content, /precision|sampler2D|gl_FragColor/);
});

test("splits same-line instructions at other GLSL and WGSL heads", async () => {
  const cases = [
    {
      paste:
        "port this uniform sampler2D u_waterMap; varying vec2 v_texCoord; void main() { gl_FragColor = texture2D(u_waterMap, v_texCoord); }",
      content: "port this",
      language: "glsl",
      codeStart: /^uniform sampler2D u_waterMap;/,
    },
    {
      paste:
        "rewrite this void main() { gl_FragColor = vec4(gl_FragCoord.xy / u_resolution, 0.0, 1.0); }",
      content: "rewrite this",
      language: "glsl",
      codeStart: /^void main\(\)/,
    },
    {
      paste:
        "use this @fragment fn main(@location(0) uv: vec2f) -> @location(0) vec4f { return vec4f(uv, 0.0, 1.0); }",
      content: "use this",
      language: "wgsl",
      codeStart: /^@fragment/,
    },
    {
      paste:
        "bind this @group(0) @binding(0) var<uniform> frame: Frame; @fragment fn main() -> @location(0) vec4f { return vec4f(1.0); }",
      content: "bind this",
      language: "wgsl",
      codeStart: /^@group\(0\)/,
    },
    {
      paste:
        "start from struct Frame { time: f32, deltaTime: f32, } @fragment fn main() -> @location(0) vec4f { return vec4f(1.0); }",
      content: "start from",
      language: "wgsl",
      codeStart: /^struct Frame \{/,
    },
  ];

  for (const item of cases) {
    const result = await splitComposerPaste({ text: item.paste });
    assert.equal(result.content, item.content, item.paste);
    assert.equal(result.pastes.length, 1, item.paste);
    assert.equal(result.pastes[0].language, item.language, item.paste);
    assert.match(result.pastes[0].text, item.codeStart, item.paste);
  }
});

test("does not split English that only mentions shader-ish words", async () => {
  const cases = [
    "Make the lighting more uniform across the surface.",
    "Explain this in float terms for the team.",
    "The varying grain amount should stay soft.",
  ];

  for (const text of cases) {
    const result = await splitComposerPaste({ text });
    assert.equal(result.content, text);
    assert.equal(result.pastes.length, 0, text);
  }
});

test("splits a same-line instruction at a leading // or /* comment", async () => {
  const lineComment = await splitComposerPaste({
    text: "convert this // textures uniform sampler2D u_waterMap; void main() { gl_FragColor = texture2D(u_waterMap, vec2(0.5)); }",
  });
  assert.equal(lineComment.content, "convert this");
  assert.equal(lineComment.pastes.length, 1);
  assert.equal(lineComment.pastes[0].language, "glsl");
  assert.match(lineComment.pastes[0].text, /^\/\/ textures uniform sampler2D/);

  const blockComment = await splitComposerPaste({
    text: "convert this /* water map */ uniform sampler2D u_waterMap; void main() { gl_FragColor = vec4(1.0); }",
  });
  assert.equal(blockComment.content, "convert this");
  assert.equal(blockComment.pastes.length, 1);
  assert.equal(blockComment.pastes[0].language, "glsl");
  assert.match(blockComment.pastes[0].text, /^\/\* water map \*\//);
});

test("does not treat https:// as a code comment head", async () => {
  const result = await splitComposerPaste({
    text: "Read https://example.com/docs before changing the grain.",
  });
  assert.equal(result.content, "Read https://example.com/docs before changing the grain.");
  assert.equal(result.pastes.length, 0);
});

test("keeps a sentence about a function as a message with no paste", async () => {
  const result = await splitComposerPaste({
    text: "Change the clamp function to use a default max of one.",
  });
  assert.equal(result.content, "Change the clamp function to use a default max of one.");
  assert.equal(result.pastes.length, 0);
});

test("keeps a plain request as a user message with no paste", async () => {
  const result = await splitComposerPaste({
    text: "Make the grain softer in the highlights.",
  });
  assert.equal(result.content, "Make the grain softer in the highlights.");
  assert.equal(result.pastes.length, 0);
});
