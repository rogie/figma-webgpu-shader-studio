import assert from "node:assert/strict";
import test from "node:test";
import { buildStandaloneEmbedCode } from "./embedCode.js";

test("builds a self-contained vanilla JavaScript page with current params", () => {
  const html = buildStandaloneEmbedCode({
    source: `
      import { defineProperties } from "figma:shaders"
      export default function Effect() {}
      export function setup() {}
      export function render() {}
      defineProperties(Effect, {})
    `,
    values: {
      amount: 0.75,
      tint: { r: 1, g: 0.5, b: 0.25, a: 1 },
    },
    kind: "fill",
  });

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /const params = \{\s*"amount": 0\.75,/);
  assert.match(html, /"tint": \{/);
  assert.match(html, /const isEffect = false;/);
  assert.doesNotMatch(html, /from "figma:shaders"/);
  assert.doesNotMatch(html, /\bexport\s+(default\s+)?function\b/);

  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test("keeps script-closing text inside shader source from ending the page script", () => {
  const html = buildStandaloneEmbedCode({
    source: `
      export function render() {
        var marker = "</script>"
        return marker
      }
    `,
    values: {},
    kind: "effect",
  });

  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  assert.match(html, /<\\\/script>/);
});
