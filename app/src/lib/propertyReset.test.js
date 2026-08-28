import assert from "node:assert/strict";
import test from "node:test";
import { resetPropertiesForTarget } from "./propertyReset.js";

test("derives cloned defaults from the current source for an explicit target", () => {
  const source = "current shader source";
  const currentValues = {
    amount: 90,
    point: { x: 10, y: 20 },
  };
  const target = { type: "composition-layer", layerId: "effect-2" };
  let loadedSource = null;

  const result = resetPropertiesForTarget({
    source,
    values: currentValues,
    target,
    loadModule(candidate) {
      loadedSource = candidate;
      return {
        props: {
          amount: { defaultValue: 25 },
          point: { defaultValue: { x: 50, y: 50 } },
        },
      };
    },
  });

  assert.equal(loadedSource, source);
  assert.equal(source, "current shader source");
  assert.deepEqual(currentValues, {
    amount: 90,
    point: { x: 10, y: 20 },
  });
  assert.deepEqual(target, {
    type: "composition-layer",
    layerId: "effect-2",
  });
  assert.deepEqual(result, {
    status: "changed",
    changed: true,
    target,
    props: {
      amount: { defaultValue: 25 },
      point: { defaultValue: { x: 50, y: 50 } },
    },
    values: {
      amount: 25,
      point: { x: 50, y: 50 },
    },
  });
  assert.notStrictEqual(result.target, target);
  assert.notStrictEqual(
    result.values.point,
    result.props.point.defaultValue,
  );
});

test("reports a changed reset when only stale value keys remain", () => {
  const result = resetPropertiesForTarget({
    source: "source",
    values: { amount: 1, removedProperty: 12 },
    loadModule: () => ({
      props: { amount: { defaultValue: 1 } },
    }),
  });

  assert.equal(result.status, "changed");
  assert.equal(result.changed, true);
  assert.deepEqual(result.values, { amount: 1 });
});

test("reports no-op for defaults, omitted values, and undefined extra keys", () => {
  const loadModule = () => ({
    props: {
      amount: { defaultValue: 1 },
      enabled: { defaultValue: true },
    },
  });

  for (const values of [
    {},
    { amount: 1 },
    { amount: 1, enabled: true },
    { amount: 1, removedProperty: undefined },
  ]) {
    const result = resetPropertiesForTarget({
      source: "source",
      values,
      loadModule,
    });
    assert.equal(result.status, "no-op");
    assert.equal(result.changed, false);
    assert.deepEqual(result.values, { amount: 1, enabled: true });
  }
});

test("uses each supplied source instead of a stale property schema", () => {
  const loadModule = (source) => ({
    props: {
      amount: { defaultValue: source === "new source" ? 8 : 1 },
    },
  });

  const oldReset = resetPropertiesForTarget({
    source: "old source",
    values: { amount: 1 },
    loadModule,
  });
  const newReset = resetPropertiesForTarget({
    source: "new source",
    values: { amount: 1 },
    loadModule,
  });

  assert.equal(oldReset.status, "no-op");
  assert.equal(newReset.status, "changed");
  assert.deepEqual(newReset.values, { amount: 8 });
});

test("propagates module-loading failures without changing inputs", () => {
  const values = { amount: 2 };
  const target = { type: "document" };

  assert.throws(
    () =>
      resetPropertiesForTarget({
        source: "broken",
        values,
        target,
        loadModule() {
          throw new Error("Compile failed");
        },
      }),
    /Compile failed/,
  );
  assert.deepEqual(values, { amount: 2 });
  assert.deepEqual(target, { type: "document" });
});

test("read-only previews block reset before loading or changing anything", () => {
  const values = { amount: 2 };
  let loaded = false;
  const result = resetPropertiesForTarget({
    source: "current source",
    values,
    target: { type: "composition-layer", layerId: "effect" },
    readOnly: true,
    loadModule() {
      loaded = true;
      throw new Error("must not load");
    },
  });

  assert.equal(loaded, false);
  assert.deepEqual(result, {
    status: "read-only",
    changed: false,
    target: { type: "composition-layer", layerId: "effect" },
    props: {},
    values,
  });
  assert.strictEqual(result.values, values);
});
