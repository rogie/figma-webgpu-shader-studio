/**
 * Normalize presets, drafts, and cloud shaders into one card list for nav/home.
 * Public/multi-author rows can append with the same shape later.
 */

export function buildShaderLibraryCards({
  presets,
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

  presets.forEach((preset, index) => {
    cards.push({
      key: preset.id,
      origin: "preset",
      name: liveNames[preset.id] || preset.name,
      kind: preset.kind,
      thumbnailUrl:
        thumbnails[preset.id] ||
        placeholderThumbnailUrl(index, preset.name),
      authorId: null,
      authorLabel: "Shader Studio",
      updatedAt: null,
      draft: null,
      cloud: null,
    });
  });

  drafts.forEach((draft, index) => {
    const name = liveNames[draft.id] || draft.name;
    cards.push({
      key: draft.id,
      origin: "draft",
      name,
      kind: draft.kind,
      thumbnailUrl:
        thumbnails[draft.id] ||
        placeholderThumbnailUrl(presets.length + index, name),
      authorId: user?.id ?? null,
      authorLabel: youLabel,
      updatedAt: null,
      draft,
      cloud: null,
    });
  });

  cloudShaders.forEach((shader, index) => {
    const key = `cloud:${shader.id}`;
    cards.push({
      key,
      origin: "cloud",
      name: liveNames[key] || shader.name,
      kind: shader.kind === "fill" ? "fill" : "effect",
      thumbnailUrl:
        thumbnails[key] ||
        cloudThumbnails[shader.id] ||
        placeholderThumbnailUrl(
          presets.length + drafts.length + index,
          shader.name
        ),
      authorId: shader.owner_id ?? user?.id ?? null,
      authorLabel:
        user && shader.owner_id === user.id ? youLabel : "Author",
      updatedAt: shader.updated_at || null,
      draft: null,
      cloud: shader,
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
