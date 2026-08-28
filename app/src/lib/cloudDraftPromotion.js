export async function createOrResumeCloudDraft({
  shaderId,
  createPayload,
  statePayload,
  metadataPayload,
  getExisting,
  create,
  saveState,
  updateMetadata,
  onStateCommitted = null,
}) {
  const existing = await getExisting(shaderId);
  if (!existing) {
    const created = await create(createPayload);
    onStateCommitted?.(created);
    return { shader: created, resumed: false };
  }

  const committed = await saveState({
    shaderId: existing.id,
    expectedStateRevision: existing.state_revision,
    ...statePayload,
  });
  onStateCommitted?.(committed);
  const shader = await updateMetadata(
    existing.id,
    metadataPayload,
    { expectedStateRevision: committed.state_revision },
  );
  return { shader, resumed: true };
}
