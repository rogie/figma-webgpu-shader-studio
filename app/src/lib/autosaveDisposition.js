export const AUTOSAVE_DISPOSITION = Object.freeze({
  SAVE: "save",
  SKIP_RETRY: "skip-retry",
  NO_OP: "no-op",
});

function result(disposition, reason) {
  return { disposition, reason };
}

/**
 * Decide whether a background save should run.
 *
 * `skip-retry` means dirty work still exists but a transient or explicit-save
 * guard blocks this attempt. `no-op` means autosave has no document write to
 * perform. Every path carries a reason so callers never treat a skipped lock or
 * non-durable media as a successful save.
 */
export function getAutosaveDisposition({
  dirty = false,
  isOwner = false,
  visibilityMatches = true,
  isVisible = true,
  hasPendingMedia = false,
  mediaPersistenceReady = true,
  conflictBlocked = false,
  saveInProgress = false,
  queueBusy = false,
  locked = false,
  lockAvailable = true,
  currentFingerprint = "",
  savedFingerprint = "",
} = {}) {
  if (!dirty) {
    return result(AUTOSAVE_DISPOSITION.NO_OP, "clean");
  }
  if (!isOwner) {
    return result(AUTOSAVE_DISPOSITION.NO_OP, "not-owner");
  }
  if (!visibilityMatches) {
    return result(
      AUTOSAVE_DISPOSITION.SKIP_RETRY,
      "visibility-change-requires-explicit-save",
    );
  }
  if (conflictBlocked) {
    return result(
      AUTOSAVE_DISPOSITION.SKIP_RETRY,
      "state-conflict-requires-explicit-save",
    );
  }
  if (!isVisible) {
    return result(AUTOSAVE_DISPOSITION.SKIP_RETRY, "editor-hidden");
  }
  if (hasPendingMedia && !mediaPersistenceReady) {
    return result(AUTOSAVE_DISPOSITION.SKIP_RETRY, "media-not-durable");
  }
  if (
    !hasPendingMedia &&
    typeof currentFingerprint === "string" &&
    currentFingerprint.length > 0 &&
    currentFingerprint === savedFingerprint
  ) {
    return result(AUTOSAVE_DISPOSITION.NO_OP, "fingerprint-match");
  }
  if (saveInProgress) {
    return result(AUTOSAVE_DISPOSITION.SKIP_RETRY, "save-in-progress");
  }
  if (queueBusy) {
    return result(AUTOSAVE_DISPOSITION.SKIP_RETRY, "save-queue-busy");
  }
  if (locked || !lockAvailable) {
    return result(AUTOSAVE_DISPOSITION.SKIP_RETRY, "lock-unavailable");
  }
  return result(AUTOSAVE_DISPOSITION.SAVE, "dirty-document");
}
