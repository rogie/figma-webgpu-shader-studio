/**
 * Normalize temporary drafts and Supabase shaders for nav/home.
 * Bundled file presets are intentionally not part of the user library.
 */

export function buildShaderLibraryCards({
  drafts,
  cloudShaders,
  thumbnails = {},
  cloudThumbnails = {},
  liveNames = {},
  user = null,
}) {
  const cards = [];
  const youLabel = user?.email || "You";
  const userName =
    user?.user_metadata?.user_name ||
    user?.user_metadata?.preferred_username ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    "Anon";
  const userAvatarUrl =
    user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  drafts.forEach((draft) => {
    const name = liveNames[draft.id] || draft.name;
    cards.push({
      key: draft.id,
      origin: "draft",
      name,
      kind: draft.kind,
      thumbnailUrl: thumbnails[draft.id] || null,
      authorId: user?.id ?? null,
      authorLabel: "Draft",
      authorName: user ? userName : "Yours",
      authorAvatarUrl: userAvatarUrl,
      updatedAt: null,
      draft,
      cloud: null,
      canDelete: true,
    });
  });

  cloudShaders.forEach((shader) => {
    const key = `cloud:${shader.id}`;
    const owned = Boolean(user && shader.owner_id === user.id);
    const privateDraft = owned && !shader.is_public;
    const authorLabel =
      shader.author_name ||
      (privateDraft ? "Private" : owned ? youLabel : "Unknown author");
    cards.push({
      key,
      origin: privateDraft ? "draft" : "public",
      name: liveNames[key] || shader.name,
      kind: shader.kind === "fill" ? "fill" : "effect",
      thumbnailUrl:
        thumbnails[key] ||
        cloudThumbnails[shader.id] ||
        null,
      authorId: shader.owner_id ?? user?.id ?? null,
      authorLabel,
      authorName: authorLabel,
      authorAvatarUrl:
        shader.author_avatar_url || (owned ? userAvatarUrl : null),
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
  { query = "", kind = "all", origin = "all", author = "all" } = {}
) {
  const needle = query.trim().toLowerCase();
  return cards.filter((card) => {
    if (kind !== "all" && card.kind !== kind) return false;
    if (origin !== "all" && card.origin !== origin) return false;
    if (author !== "all" && card.authorId !== author) return false;
    if (!needle) return true;
    return (
      card.name.toLowerCase().includes(needle) ||
      card.authorLabel.toLowerCase().includes(needle)
    );
  });
}
