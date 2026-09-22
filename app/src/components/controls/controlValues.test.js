import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSelectOptions,
  readNumber,
  readToolkitEventValue,
  readToolkitSliderNumber,
  sliderTypeForProperty,
} from "./controlValues.js";

test("reads native and toolkit numeric event shapes", () => {
  assert.equal(readNumber({ target: { value: "2.5" }, detail: 1 }), 2.5);
  assert.equal(
    readToolkitSliderNumber({ detail: { value: "4.25" } }),
    4.25,
  );
  assert.equal(
    readToolkitSliderNumber({ nativeEvent: { detail: 7 } }),
    7,
  );
});

test("unwraps legacy and shared ToolKit event values", () => {
  assert.deepEqual(
    readToolkitEventValue({
      detail: {
        control: "toolkit-position",
        value: { x: 25, y: 75, units: "percent" },
      },
    }),
    { x: 25, y: 75, units: "percent" },
  );
  assert.equal(readToolkitEventValue({ detail: "legacy" }), "legacy");
  assert.equal(
    readToolkitEventValue({ detail: undefined, target: { value: "host" } }),
    "host",
  );
});

test("chooses specialized slider types from property ranges", () => {
  assert.equal(sliderTypeForProperty("opacity", 0, 100, 1), "opacity");
  assert.equal(sliderTypeForProperty("mode", 0, 3, 1), "stepper");
  assert.equal(sliderTypeForProperty("offset", -10, 10, 0.1), "delta");
  assert.equal(sliderTypeForProperty("amount", 0, 100, 0.1), null);
});

test("serializes select options for toolkit", () => {
  assert.equal(
    formatSelectOptions([
      { value: 1, label: "One" },
      { value: "two" },
    ]),
    '[{"value":"1","label":"One"},{"value":"two","label":"two"}]',
  );
});
