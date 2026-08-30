import assert from "node:assert/strict";
import test from "node:test";
import {
  isUuid,
  normalizeProfileHandle,
  profileHandleError,
  profileRouteIdentifier,
} from "./profileHandles.js";

test("normalizes profile handles", () => {
  assert.equal(normalizeProfileHandle("  @Rogie-King  "), "rogie-king");
  assert.equal(normalizeProfileHandle("@@@Creator"), "creator");
});

test("validates profile handles", () => {
  assert.equal(profileHandleError("rogie"), "");
  assert.match(profileHandleError("ab"), /3–30/);
  assert.match(profileHandleError("bad_handle"), /lowercase letters/);
  assert.match(profileHandleError("-creator"), /start and end/);
  assert.match(profileHandleError("shader"), /reserved/);
});

test("uses handles for profile routes with UUID fallback", () => {
  const id = "69ddd849-5ec7-4f41-a64f-60512f836402";
  assert.equal(isUuid(id), true);
  assert.equal(isUuid("rogie"), false);
  assert.equal(profileRouteIdentifier({ id, handle: "rogie" }), "rogie");
  assert.equal(profileRouteIdentifier({ id, handle: null }), id);
});
