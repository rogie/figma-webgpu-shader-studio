import assert from "node:assert/strict";
import test from "node:test";
import { syncOverflowFade } from "./overflowFade.js";

function fakeScroller({ scrollTop, clientHeight, scrollHeight }) {
  const attrs = new Set();
  return {
    scrollTop,
    clientHeight,
    scrollHeight,
    attrs,
    toggleAttribute(name, on) {
      if (on) attrs.add(name);
      else attrs.delete(name);
    },
  };
}

test("syncOverflowFade clears ends when content fits", () => {
  const node = fakeScroller({
    scrollTop: 0,
    clientHeight: 200,
    scrollHeight: 200,
  });
  syncOverflowFade(node);
  assert.equal(node.attrs.has("data-overflow-top"), false);
  assert.equal(node.attrs.has("data-overflow-bottom"), false);
});

test("syncOverflowFade marks the bottom when more content is below", () => {
  const node = fakeScroller({
    scrollTop: 0,
    clientHeight: 200,
    scrollHeight: 400,
  });
  syncOverflowFade(node);
  assert.equal(node.attrs.has("data-overflow-top"), false);
  assert.equal(node.attrs.has("data-overflow-bottom"), true);
});

test("syncOverflowFade marks the top when content is scrolled away", () => {
  const node = fakeScroller({
    scrollTop: 200,
    clientHeight: 200,
    scrollHeight: 400,
  });
  syncOverflowFade(node);
  assert.equal(node.attrs.has("data-overflow-top"), true);
  assert.equal(node.attrs.has("data-overflow-bottom"), false);
});

test("syncOverflowFade marks both ends when scrolled in the middle", () => {
  const node = fakeScroller({
    scrollTop: 80,
    clientHeight: 200,
    scrollHeight: 400,
  });
  syncOverflowFade(node);
  assert.equal(node.attrs.has("data-overflow-top"), true);
  assert.equal(node.attrs.has("data-overflow-bottom"), true);
});
