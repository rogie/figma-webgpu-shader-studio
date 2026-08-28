export function versionPreviewRestoreSnapshot(snapshot, applied) {
  return applied && snapshot ? snapshot : null;
}
