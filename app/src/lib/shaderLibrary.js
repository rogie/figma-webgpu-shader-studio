/**
 * Normalize temporary local drafts and Supabase shaders for nav/home.
 * Bundled file presets are intentionally not part of the user library.
 */

export function buildShaderLibraryCards({
  drafts,
  cloudShaders,
  thumbnails = {},
  cloudThumbnails = {},
  placeholderThumbnailUrl,
  liveNames = {},
  user = null,
}) {
  const cards = [];
  const youLabel = user?.email || "You";

  drafts.forEach((draft, index) => {
    const name = liveNames[draft.id] || draft.name;
    cards.push({
      key: draft.id,
      origin: "draft",
      name,
      kind: draft.kind,
      thumbnailUrl:
        thumbnails[draft.id] ||
        placeholderThumbnailUrl(index, name),
      authorId: user?.id ?? null,
      authorLabel: "Local draft",
      updatedAt: null,
      draft,
      cloud: null,
      canDelete: true,
    });
  });

  cloudShaders.forEach((shader, index) => {
    const key = `cloud:${shader.id}`;
    const owned = Boolean(user && shader.owner_id === user.id);
    const privateDraft = owned && !shader.is_public;
    cards.push({
      key,
      origin: privateDraft ? "draft" : "public",
      name: liveNames[key] || shader.name,
      kind: shader.kind === "fill" ? "fill" : "effect",
      thumbnailUrl:
        thumbnails[key] ||
        cloudThumbnails[shader.id] ||
        placeholderThumbnailUrl(drafts.length + index, shader.name),
      authorId: shader.owner_id ?? user?.id ?? null,
      authorLabel: privateDraft ? "Draft" : owned ? youLabel : "Community",
      updatedAt: shader.updated_at || null,
      draft: null,
      cloud: shader,
      canDelete: owned,
    });
  });

  return cards;
}

export function filterShaderLibraryCards(
  cards,
  { query = "", kind = "all", origin = "all" } = {}
) {
  const needle = query.trim().toLowerCase();
  return cards.filter((card) => {
    if (kind !== "all" && card.kind !== kind) return false;
    if (origin !== "all" && card.origin !== origin) return false;
    if (!needle) return true;
    return (
      card.name.toLowerCase().includes(needle) ||
      card.authorLabel.toLowerCase().includes(needle)
    );
  });
}
