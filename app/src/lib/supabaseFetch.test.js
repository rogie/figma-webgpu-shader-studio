import assert from "node:assert/strict";
import test from "node:test";
import {
  SupabaseRequestTimeoutError,
  createSupabaseFetch,
  formatSupabaseError,
  isTransientCloudWriteError,
} from "./supabaseFetch.js";

function abortAwareFetch() {
  return (_input, init = {}) =>
    new Promise((resolve, reject) => {
      const signal = init.signal;
      if (signal?.aborted) {
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        return;
      }
      signal?.addEventListener(
        "abort",
        () => {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        },
        { once: true }
      );
    });
}

test("createSupabaseFetch rejects hung requests with a timeout error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = abortAwareFetch();
  try {
    const fetchWithTimeout = createSupabaseFetch(20);
    await assert.rejects(
      fetchWithTimeout("https://example.test/rest/v1/shaders?select=id"),
      (error) => {
        assert.ok(error instanceof SupabaseRequestTimeoutError);
        assert.match(error.message, /while loading shaders/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createSupabaseFetch forwards successful responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify([{ id: "abc" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  try {
    const fetchWithTimeout = createSupabaseFetch(50);
    const response = await fetchWithTimeout("https://example.test/ok");
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("formatSupabaseError preserves timeout context", () => {
  const error = new SupabaseRequestTimeoutError("while saving your shader");
  assert.match(formatSupabaseError(error), /while saving your shader/);
});

test("isTransientCloudWriteError matches lock and timeout failures", () => {
  assert.equal(
    isTransientCloudWriteError(
      new SupabaseRequestTimeoutError("while saving your shader")
    ),
    true
  );
  assert.equal(
    isTransientCloudWriteError(
      new Error("canceling statement due to lock timeout")
    ),
    true
  );
  assert.equal(isTransientCloudWriteError(new Error("shader_state_conflict")), false);
});
