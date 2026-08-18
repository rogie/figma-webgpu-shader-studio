import assert from "node:assert/strict";
import test from "node:test";
import { LanguageSupport } from "@codemirror/language";
import {
  LANGUAGE_PACKAGES,
  hasLanguageSupport,
  highlightRanges,
  loadLanguageSupport,
} from "./pastedHighlight.js";

test("resolves a LanguageSupport for each detected language we highlight", async () => {
  for (const id of ["typescript", "markdown", "json", "wgsl", "css", "python"]) {
    const support = await loadLanguageSupport(id);
    assert.ok(support instanceof LanguageSupport, `${id} should load a parser`);
  }
});

test("returns null for plain text and unknown languages", async () => {
  assert.equal(await loadLanguageSupport("text"), null);
  assert.equal(await loadLanguageSupport("brainfuck"), null);
});

test("highlighting is only offered for real languages, including markdown", () => {
  assert.equal(hasLanguageSupport("typescript"), true);
  assert.equal(hasLanguageSupport("markdown"), true);
  assert.equal(hasLanguageSupport("glsl"), true);
  assert.equal(hasLanguageSupport("text"), false);
  assert.equal(hasLanguageSupport("brainfuck"), false);
});

test("highlights TypeScript with the same tok-* classes as StreamingCodeBlock", async () => {
  const support = await loadLanguageSupport("typescript");
  const ranges = highlightRanges("export function clamp(value: number) {}", support);
  assert.ok(ranges.some((range) => range.classes.includes("tok-keyword")));
});

test("plain text stays unstyled", () => {
  const ranges = highlightRanges("just a sentence.", null);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].classes, "");
});

test("caches repeated loads of the same language", async () => {
  const first = await loadLanguageSupport("json");
  const second = await loadLanguageSupport("json");
  assert.equal(first, second);
});

test("wraps TypeScript with a shader overlay when a nested language is detected", async () => {
  const plain = await loadLanguageSupport("typescript");
  const nested = await loadLanguageSupport("typescript", { nested: ["glsl"] });
  assert.ok(nested instanceof LanguageSupport);
  assert.notEqual(nested, plain);
});

test("every loadable language reports the package it comes from", async () => {
  for (const id of Object.keys(LANGUAGE_PACKAGES)) {
    assert.ok(await loadLanguageSupport(id), `${id} should be loadable`);
  }
});
