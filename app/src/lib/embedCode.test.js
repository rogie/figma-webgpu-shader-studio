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

test("builds a self-contained composition page with isolated layer modules", () => {
  const html = buildStandaloneEmbedCode({
    composition: {
      isFill: true,
      layers: [
        {
          role: "fill",
          enabled: true,
          params: { speed: 1.5 },
          source: `
            import { defineProperties } from "figma:shaders"
            export function setup() {}
            export function render() {}
          `,
        },
        {
          role: "effect",
          enabled: true,
          params: { amount: 0.2 },
          source: `
            export function render() {
              var marker = "</script>"
              return marker
            }
          `,
        },
      ],
    },
  });

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /const isFill = true;/);
  assert.match(html, /"speed": 1\.5/);
  assert.match(html, /"amount": 0\.2/);
  assert.match(html, /role: "fill"/);
  assert.match(html, /role: "effect"/);
  assert.doesNotMatch(html, /from "figma:shaders"/);
  assert.doesNotMatch(html, /\bexport\s+function\b/);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  assert.match(html, /<\\\/script>/);

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
