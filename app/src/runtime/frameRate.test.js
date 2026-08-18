import assert from "node:assert/strict";
import test from "node:test";
import { calculateFrameRate } from "./frameRate.js";

test("calculates frame rate over a sample window", () => {
  assert.equal(calculateFrameRate(100, 130, 500), 60);
  assert.equal(calculateFrameRate(20, 80, 500), 120);
});

test("returns zero for reset or invalid samples", () => {
  assert.equal(calculateFrameRate(100, 0, 500), 0);
  assert.equal(calculateFrameRate(0, 30, 0), 0);
});
