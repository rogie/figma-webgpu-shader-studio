import test from "node:test";
import assert from "node:assert/strict";
import { isCanvasHandleEvent } from "./canvasHandlePopupGuard.js";

function eventFrom(path) {
  return { composedPath: () => path };
}

test("detects fig-handle and fig-canvas-control hits", () => {
  assert.equal(
    isCanvasHandleEvent(eventFrom([{ tagName: "FIG-HANDLE" }])),
    true
  );
  assert.equal(
    isCanvasHandleEvent(
      eventFrom([{ tagName: "path" }, { tagName: "FIG-CANVAS-CONTROL" }])
    ),
    true
  );
  assert.equal(
    isCanvasHandleEvent(
      eventFrom([
        { tagName: "DIV", classList: { contains: (name) => name === "canvas-controls-overlay" } },
      ])
    ),
    true
  );
});

test("ignores pointer events from elsewhere", () => {
  assert.equal(isCanvasHandleEvent(eventFrom([{ tagName: "CANVAS" }])), false);
  assert.equal(isCanvasHandleEvent(eventFrom([{ tagName: "DIALOG" }])), false);
  assert.equal(isCanvasHandleEvent({}), false);
});
