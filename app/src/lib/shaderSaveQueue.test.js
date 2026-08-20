import assert from "node:assert/strict";
import test from "node:test";
import { createShaderSaveQueue } from "./shaderSaveQueue.js";

test("shaderSaveQueue runs tasks for the same shader sequentially", async () => {
  const queue = createShaderSaveQueue();
  const order = [];

  const first = queue.enqueue("shader-1", async () => {
    order.push("first-start");
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("first-end");
    return 1;
  });
  const second = queue.enqueue("shader-1", async () => {
    order.push("second-start");
    order.push("second-end");
    return 2;
  });

  assert.equal(await first, 1);
  assert.equal(await second, 2);
  assert.deepEqual(order, [
    "first-start",
    "first-end",
    "second-start",
    "second-end",
  ]);
});

test("shaderSaveQueue keeps different shaders independent", async () => {
  const queue = createShaderSaveQueue();
  const order = [];

  const slow = queue.enqueue("shader-a", async () => {
    order.push("a-start");
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("a-end");
  });
  queue.enqueue("shader-b", async () => {
    order.push("b");
  });

  await slow;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, ["a-start", "b", "a-end"]);
});

test("shaderSaveQueue continues after a failed task", async () => {
  const queue = createShaderSaveQueue();

  await assert.rejects(
    queue.enqueue("shader-1", async () => {
      throw new Error("save failed");
    }),
    /save failed/
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    await queue.enqueue("shader-1", async () => "ok"),
    "ok"
  );
  assert.equal(queue.isBusy("shader-1"), false);
});

test("shaderSaveQueue tracks busy state per shader", async () => {
  const queue = createShaderSaveQueue();
  let release = null;
  const pending = queue.enqueue("shader-1", () =>
    new Promise((resolve) => {
      release = resolve;
    })
  );

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof release, "function");
  assert.equal(queue.isBusy("shader-1"), true);
  assert.equal(queue.isBusy("shader-2"), false);

  release();
  await pending;
  assert.equal(queue.isBusy("shader-1"), false);
});
