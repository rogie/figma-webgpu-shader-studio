import assert from "node:assert/strict";
import test from "node:test";
import { figMenuChangeValue } from "./useFigMenuChange.js";

test("reads fig-menu change from detail.value, detail string, or menu.value", () => {
  assert.equal(
    figMenuChangeValue({ detail: { value: "publish" } }, { value: "" }),
    "publish"
  );
  assert.equal(figMenuChangeValue({ detail: "delete" }, { value: "" }), "delete");
  assert.equal(figMenuChangeValue({ detail: null }, { value: "rename" }), "rename");
  assert.equal(figMenuChangeValue({}, {}), "");
});
