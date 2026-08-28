export async function removePromotedDraftState({
  draftId,
  drafts,
  thumbnailDataUrls,
  writeDrafts,
  activeDraftStorageKey,
  storage = globalThis.localStorage,
  onStateRemoved = null,
  removeMedia,
}) {
  const remaining = (drafts || []).filter((draft) => draft.id !== draftId);
  writeDrafts(remaining, thumbnailDataUrls);
  if (
    remaining.length === 0 ||
    storage?.getItem(activeDraftStorageKey) === draftId
  ) {
    storage?.removeItem(activeDraftStorageKey);
  }
  onStateRemoved?.(remaining);
  if (thumbnailDataUrls) delete thumbnailDataUrls[draftId];
  await removeMedia(draftId);
  return remaining;
}
