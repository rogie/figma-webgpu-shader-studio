import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDefaultValuesToProps,
  applyDefaultValuesToSource,
} from "./definePropertiesDefaults.js";

const grainLike = `defineProperties(Effect, {
  intensity: { type: "number", label: "Intensity", defaultValue: 25, control: "slider", min: 0, max: 100 },
  region: { type: "point-angle-radius", label: "Region", defaultValue: { x: 50, y: 50, radius: 100, angle: 0 } },
  seed: { type: "number", label: "Seed", defaultValue: 0 },
});
`;

const ditherLike = `defineProperties(Effect, {
  algorithm: {
    type: 'string',
    label: 'Style',
    defaultValue: 'Atkinson',
    control: 'select',
    options: [
      { value: 'Atkinson', label: 'Atkinson' },
    ],
  },
  mono: {
    type: 'boolean',
    label: 'Mono',
    defaultValue: false,
  },
  monoColor: {
    type: 'color',
    label: 'Mono color',
    defaultValue: { r: 1, g: 1, b: 1, a: 1 },
  },
})
`;

test("rewrites slider numbers and object defaults in place", () => {
  const next = applyDefaultValuesToSource(grainLike, {
    intensity: 40,
    region: { x: 12, y: 80, radius: 33, angle: 45 },
    seed: 7,
  });
  assert.match(next, /defaultValue: 40,/);
  assert.match(
    next,
    /defaultValue: \{ x: 12, y: 80, radius: 33, angle: 45 \}/
  );
  assert.match(next, /defaultValue: 7 \}/);
  assert.match(next, /label: "Intensity"/);
});

test("preserves string quotes and leaves option values alone", () => {
  const next = applyDefaultValuesToSource(ditherLike, {
    algorithm: "Bayer 8x8",
    mono: true,
    monoColor: { r: 0.2, g: 0.4, b: 0.6, a: 1 },
  });
  assert.match(next, /defaultValue: 'Bayer 8x8'/);
  assert.match(next, /defaultValue: true,/);
  assert.match(next, /defaultValue: \{ r: 0\.2, g: 0\.4, b: 0\.6, a: 1 \}/);
  assert.match(next, /\{ value: 'Atkinson', label: 'Atkinson' \}/);
});

test("keeps trailing .0 number style from the original source", () => {
  const source = `defineProperties(Effect, {
    lightHeight: { type: "number", defaultValue: 4.0 },
  })`;
  const next = applyDefaultValuesToSource(source, { lightHeight: 8 });
  assert.match(next, /defaultValue: 8\.0/);
});

test("updates the last defineProperties call and skips comments", () => {
  const source = `
// defineProperties(Effect, { amount: { defaultValue: 1 } })
const text = "defineProperties";
function render() {}
defineProperties(Effect, {
  amount: { type: "number", defaultValue: 0.25 },
})
`;
  const next = applyDefaultValuesToSource(source, { amount: 0.75 });
  assert.match(next, /defaultValue: 0\.75/);
  assert.match(next, /\/\/ defineProperties\(Effect, \{ amount: \{ defaultValue: 1 \} \}\)/);
});

test("supports a single-argument defineProperties object", () => {
  const source = `const properties = defineProperties({
    scale: { type: "number", defaultValue: 1 },
  })`;
  const next = applyDefaultValuesToSource(source, { scale: 2.5 });
  assert.match(next, /defaultValue: 2\.5/);
});

test("returns the same source when values already match", () => {
  const next = applyDefaultValuesToSource(grainLike, {
    intensity: 25,
    region: { x: 50, y: 50, radius: 100, angle: 0 },
    seed: 0,
  });
  assert.equal(next, grainLike);
});

test("throws when defineProperties is missing", () => {
  assert.throws(
    () => applyDefaultValuesToSource("export function render() {}", { a: 1 }),
    /defineProperties/
  );
});

test("patches in-memory property defaults", () => {
  const next = applyDefaultValuesToProps(
    { amount: { type: "number", defaultValue: 0.2, label: "Amount" } },
    { amount: 0.8 }
  );
  assert.equal(next.amount.defaultValue, 0.8);
  assert.equal(next.amount.label, "Amount");
});
