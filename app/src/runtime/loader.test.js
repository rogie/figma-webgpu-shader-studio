import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./loader.js";

test("captures defineProperties and exported lifecycle functions", () => {
  const loaded = loadModule(`
    import { defineProperties } from "figma:shaders";
    export function setup() {}
    export function render() {}
    defineProperties(null, {
      amount: { type: "number", defaultValue: 0.5 }
    });
  `);

  assert.equal(typeof loaded.setup, "function");
  assert.equal(typeof loaded.render, "function");
  assert.equal(loaded.props.amount.defaultValue, 0.5);
});

test("captures defineProperties from figma:react the same as figma:shaders", () => {
  const loaded = loadModule(`
    import { defineProperties } from "figma:react";
    export function render() {}
    defineProperties(null, {
      amount: { type: "number", defaultValue: 0.25 }
    });
  `);

  assert.equal(loaded.props.amount.defaultValue, 0.25);
});

test("shadows globals unavailable in the Figma shader runtime", () => {
  const loaded = loadModule(`
    export function render() {
      return {
        console: typeof console,
        fetch: typeof fetch,
        window: typeof window,
        navigator: typeof navigator,
        Float64Array: typeof Float64Array,
      };
    }
  `);

  assert.deepEqual(loaded.render(), {
    console: "undefined",
    fetch: "undefined",
    window: "undefined",
    navigator: "undefined",
    Float64Array: "undefined",
  });
});

test("unknown imports resolve to inert dead proxies", () => {
  const loaded = loadModule(`
    import mystery from "unsupported-package";
    export function render() {
      return {
        call: mystery(),
        nestedCall: mystery.deeply.nested(),
        nestedIdentity: mystery.deeply === mystery.deeply,
      };
    }
  `);

  assert.deepEqual(loaded.render(), {
    call: undefined,
    nestedCall: undefined,
    nestedIdentity: true,
  });
});

test("normalizes compile, module, and missing-render errors", () => {
  assert.throws(
    () => loadModule("export function render( {"),
    /Compile error:/,
  );
  assert.throws(
    () =>
      loadModule(`
        throw new Error("startup failed");
        export function render() {}
      `),
    /Module error: startup failed/,
  );
  assert.throws(
    () => loadModule("export const value = 1;"),
    /Module has no exported `render\(device, frame\)` function/,
  );
});
