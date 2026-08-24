import assert from "node:assert/strict";
import test from "node:test";
import {
  getPreferredFigmaPlanKey,
  preferredFigmaPlan,
  setPreferredFigmaPlanKey,
} from "./figmaPlanPreference.js";

function withStorage(run) {
  const values = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  try {
    run();
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
}

test("preferredFigmaPlan remembers an available plan", () => {
  withStorage(() => {
    setPreferredFigmaPlanKey("organization::123");
    const plan = preferredFigmaPlan([
      { key: "team::456", name: "Team" },
      { key: "organization::123", name: "Org" },
    ]);
    assert.equal(plan?.name, "Org");
    assert.equal(getPreferredFigmaPlanKey(), "organization::123");
  });
});

test("preferredFigmaPlan clears a plan no longer available", () => {
  withStorage(() => {
    setPreferredFigmaPlanKey("organization::123");
    assert.equal(
      preferredFigmaPlan([{ key: "team::456", name: "Team" }]),
      null
    );
    assert.equal(getPreferredFigmaPlanKey(), "");
  });
});
