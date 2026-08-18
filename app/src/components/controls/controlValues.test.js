import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSelectOptions,
  readNumber,
  readPropskitSliderNumber,
  sliderTypeForProperty,
} from "./controlValues.js";

test("reads native and propskit numeric event shapes", () => {
  assert.equal(readNumber({ target: { value: "2.5" }, detail: 1 }), 2.5);
  assert.equal(
    readPropskitSliderNumber({ detail: { value: "4.25" } }),
    4.25,
  );
  assert.equal(
    readPropskitSliderNumber({ nativeEvent: { detail: 7 } }),
    7,
  );
});

test("chooses specialized slider types from property ranges", () => {
  assert.equal(sliderTypeForProperty("opacity", 0, 100, 1), "opacity");
  assert.equal(sliderTypeForProperty("mode", 0, 3, 1), "stepper");
  assert.equal(sliderTypeForProperty("offset", -10, 10, 0.1), "delta");
  assert.equal(sliderTypeForProperty("amount", 0, 100, 0.1), null);
});

test("serializes select options for propskit", () => {
  assert.equal(
    formatSelectOptions([
      { value: 1, label: "One" },
      { value: "two" },
    ]),
    '[{"value":"1","label":"One"},{"value":"two","label":"two"}]',
  );
});
