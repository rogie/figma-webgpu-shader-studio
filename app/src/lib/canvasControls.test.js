import test from "node:test";
import assert from "node:assert/strict";
import {
  figCanvasControlType,
  fromFigCanvasValue,
  isCanvasModeProp,
  listCanvasControls,
  showsInPropertyPanel,
  toFigCanvasValue,
} from "./canvasControls.js";

test("maps defineProperties types to fig-canvas-control types", () => {
  assert.equal(figCanvasControlType({ type: "point" }), "point");
  assert.equal(figCanvasControlType({ type: "point-radius" }), "point-radius");
  assert.equal(
    figCanvasControlType({ type: "point-angle-radius" }),
    "point-radius-angle"
  );
  assert.equal(
    figCanvasControlType({ type: "point-point-line" }),
    "point-point"
  );
  assert.equal(figCanvasControlType({ type: "color-point" }), "color");
});

test("mode canvas / canvas_and_ui gating", () => {
  const canvasOnly = { type: "point-radius", mode: "canvas" };
  const both = { type: "point-radius", mode: "canvas_and_ui" };
  const uiOnly = { type: "point-radius", mode: "ui" };
  assert.equal(isCanvasModeProp(canvasOnly), true);
  assert.equal(isCanvasModeProp(both), true);
  assert.equal(isCanvasModeProp(uiOnly), false);
  assert.equal(showsInPropertyPanel(canvasOnly), false);
  assert.equal(showsInPropertyPanel(both), true);
  assert.equal(showsInPropertyPanel(uiOnly), true);
});

test("serializes percent radius for fig-canvas-control", () => {
  const def = {
    type: "point-angle-radius",
    mode: "canvas",
    positionUnit: "%",
    radiusUnit: "%",
    defaultValue: { x: 50, y: 50, radius: 75, angle: 90 },
  };
  const value = toFigCanvasValue(def, def.defaultValue);
  assert.deepEqual(value, {
    x: 50,
    y: 50,
    radius: "75%",
    angle: 90,
  });
  assert.deepEqual(fromFigCanvasValue(def, value), {
    x: 50,
    y: 50,
    radius: 75,
    angle: 90,
  });
});

test("reads the FigUI3 color event alpha aliases", () => {
  const def = { type: "color-point", unit: "%" };
  assert.deepEqual(
    fromFigCanvasValue(def, {
      x: 25,
      y: 20,
      color: "#fff5e6",
      alpha: 0.4,
      opacity: 40,
    }),
    {
      x: 25,
      y: 20,
      color: { r: 1, g: 245 / 255, b: 230 / 255, a: 0.4 },
    }
  );
});

test("preserves opacity from FigUI3 rgba colors during point drags", () => {
  const def = { type: "color-point", unit: "%" };
  assert.deepEqual(
    fromFigCanvasValue(def, {
      x: 30,
      y: 35,
      color: "rgba(255, 245, 230, 0.4)",
    }),
    {
      x: 30,
      y: 35,
      color: { r: 1, g: 245 / 255, b: 230 / 255, a: 0.4 },
    }
  );
});

test("lists only canvas-mode props", () => {
  const listed = listCanvasControls({
    region: {
      type: "point-angle-radius",
      mode: "canvas",
      defaultValue: { x: 50, y: 50, radius: 75, angle: 90 },
    },
    size: { type: "number", defaultValue: 1 },
    sphere: {
      type: "point-radius",
      mode: "canvas_and_ui",
      defaultValue: { x: 50, y: 50, radius: 40 },
    },
  });
  assert.deepEqual(
    listed.map((entry) => entry.name),
    ["region", "sphere"]
  );
});
