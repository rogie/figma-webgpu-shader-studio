import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSelectOptions,
  readColorControlValue,
  readControlEventValue,
  readGradientControlValue,
  readNumber,
  readPointControlValue,
  readToolkitEventValue,
  readToolkitSliderNumber,
  serializeGradientValue,
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

test("reads FigUI3 direct and wrapped event values", () => {
  assert.equal(readControlEventValue({ detail: { value: "screen" } }), "screen");
  assert.deepEqual(
    readPointControlValue({ detail: { x: 25, y: 75 } }),
    { x: 25, y: 75 },
  );
});

test("normalizes FigUI3 color event alpha", () => {
  assert.deepEqual(
    readColorControlValue({
      detail: { color: "#336699", opacity: 40 },
    }),
    { color: "#336699", alpha: 0.4 },
  );
  assert.deepEqual(
    readColorControlValue({ detail: { value: "#abcdef", alpha: 0.25 } }),
    { color: "#abcdef", alpha: 0.25 },
  );
});

test("round-trips gradient stops through FigUI3 values", () => {
  const serialized = serializeGradientValue([
    {
      position: 0.25,
      color: { r: 1, g: 0, b: 0, a: 0.4 },
    },
  ]);
  assert.deepEqual(JSON.parse(serialized).gradient.stops, [
    { position: 25, color: "#ff0000", opacity: 40 },
  ]);

  assert.deepEqual(
    readGradientControlValue({
      detail: {
        type: "gradient",
        gradient: {
          stops: [{ position: 25, color: "#336699", opacity: 40 }],
        },
      },
    }),
    {
      stops: [{
        position: 0.25,
        color: {
          r: 0x33 / 255,
          g: 0x66 / 255,
          b: 0x99 / 255,
          a: 0.4,
        },
      }],
    },
  );
});

test("chooses specialized slider types from property ranges", () => {
  assert.equal(sliderTypeForProperty("opacity", 0, 100, 1), "opacity");
  assert.equal(sliderTypeForProperty("mode", 0, 3, 1), "stepper");
  assert.equal(sliderTypeForProperty("offset", -10, 10, 0.1), "delta");
  assert.equal(sliderTypeForProperty("amount", 0, 100, 0.1), null);
});

test("serializes select options for FigUI3", () => {
  assert.equal(
    formatSelectOptions([
      { value: 1, label: "One" },
      { value: "two" },
    ]),
    '[{"value":"1","label":"One"},{"value":"two","label":"two"}]',
  );
});
