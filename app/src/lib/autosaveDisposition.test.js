import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOSAVE_DISPOSITION,
  getAutosaveDisposition,
} from "./autosaveDisposition.js";

test("saves a dirty owned document when no guard blocks it", () => {
  assert.deepEqual(
    getAutosaveDisposition({
      dirty: true,
      isOwner: true,
      currentFingerprint: "current",
      savedFingerprint: "saved",
    }),
    {
      disposition: AUTOSAVE_DISPOSITION.SAVE,
      reason: "dirty-document",
    },
  );
});

test("reports true no-op states explicitly", () => {
  assert.deepEqual(getAutosaveDisposition(), {
    disposition: "no-op",
    reason: "clean",
  });
  assert.deepEqual(
    getAutosaveDisposition({ dirty: true, isOwner: false }),
    {
      disposition: "no-op",
      reason: "not-owner",
    },
  );
  assert.deepEqual(
    getAutosaveDisposition({
      dirty: true,
      isOwner: true,
      currentFingerprint: "same",
      savedFingerprint: "same",
    }),
    {
      disposition: "no-op",
      reason: "fingerprint-match",
    },
  );
});

test("keeps visibility changes dirty for an explicit save", () => {
  assert.deepEqual(
    getAutosaveDisposition({
      dirty: true,
      isOwner: true,
      visibilityMatches: false,
    }),
    {
      disposition: "skip-retry",
      reason: "visibility-change-requires-explicit-save",
    },
  );
  assert.deepEqual(
    getAutosaveDisposition({
      dirty: true,
      isOwner: true,
      isVisible: false,
    }),
    {
      disposition: "skip-retry",
      reason: "editor-hidden",
    },
  );
});

test("a state conflict blocks background retries until explicit save", () => {
  assert.deepEqual(
    getAutosaveDisposition({
      dirty: true,
      isOwner: true,
      conflictBlocked: true,
      currentFingerprint: "local",
      savedFingerprint: "remote",
    }),
    {
      disposition: "skip-retry",
      reason: "state-conflict-requires-explicit-save",
    },
  );
});

test("reports each save-lock condition as retryable", () => {
  const cases = [
    ["saveInProgress", "save-in-progress"],
    ["queueBusy", "save-queue-busy"],
    ["locked", "lock-unavailable"],
  ];

  for (const [flag, reason] of cases) {
    assert.deepEqual(
      getAutosaveDisposition({
        dirty: true,
        isOwner: true,
        currentFingerprint: "new",
        savedFingerprint: "old",
        [flag]: true,
      }),
      { disposition: "skip-retry", reason },
    );
  }
  assert.deepEqual(
    getAutosaveDisposition({
      dirty: true,
      isOwner: true,
      lockAvailable: false,
    }),
    {
      disposition: "skip-retry",
      reason: "lock-unavailable",
    },
  );
});

test("pending media saves when persistence is ready and retries otherwise", () => {
  assert.deepEqual(
    getAutosaveDisposition({
      dirty: true,
      isOwner: true,
      hasPendingMedia: true,
      currentFingerprint: "same",
      savedFingerprint: "same",
    }),
    {
      disposition: "save",
      reason: "dirty-document",
    },
  );
  assert.deepEqual(
    getAutosaveDisposition({
      dirty: true,
      isOwner: true,
      hasPendingMedia: true,
      mediaPersistenceReady: false,
      currentFingerprint: "same",
      savedFingerprint: "same",
    }),
    {
      disposition: "skip-retry",
      reason: "media-not-durable",
    },
  );
});

test("fingerprint no-op does not wait on an irrelevant busy lock", () => {
  assert.deepEqual(
    getAutosaveDisposition({
      dirty: true,
      isOwner: true,
      queueBusy: true,
      lockAvailable: false,
      currentFingerprint: "same",
      savedFingerprint: "same",
    }),
    {
      disposition: "no-op",
      reason: "fingerprint-match",
    },
  );
});

test("empty fingerprints are unknown and do not suppress the first save", () => {
  assert.deepEqual(
    getAutosaveDisposition({
      dirty: true,
      isOwner: true,
      currentFingerprint: "",
      savedFingerprint: "",
    }),
    {
      disposition: "save",
      reason: "dirty-document",
    },
  );
});
