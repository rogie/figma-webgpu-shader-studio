import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadModule } from "./loader.js";

for (const name of ["dither", "grain", "pixelate", "sphere"]) {
  test(`${name} preset evaluates after performance optimizations`, async () => {
    const source = await readFile(
      new URL(`../../../${name}.ts`, import.meta.url),
      "utf8"
    );
    const module = loadModule(source);
    assert.equal(typeof module.render, "function");
    assert.equal(typeof module.props, "object");
  });
}
