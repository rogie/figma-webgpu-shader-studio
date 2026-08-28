export function rememberStateRevision(revisions, shader) {
  const id = shader?.id;
  const revision = Number(shader?.state_revision);
  if (!id || !Number.isFinite(revision) || revision < 1) return null;
  const remembered = Number(revisions?.get?.(id));
  if (!Number.isFinite(remembered) || revision > remembered) {
    revisions?.set?.(id, revision);
    return revision;
  }
  return remembered;
}

export function expectedStateRevision(revisions, shader) {
  const remembered = Number(revisions?.get?.(shader?.id));
  if (Number.isFinite(remembered) && remembered > 0) return remembered;
  const revision = Number(shader?.state_revision);
  return Number.isFinite(revision) && revision > 0 ? revision : null;
}
