/**
 * Normalize temporary drafts and Supabase shaders for nav/home.
 * Bundled file presets are intentionally not part of the user library.
 */

import { resolvedLibraryKind } from "./composition.js";

export const ANON_YOU_LABEL = "Anon (You)";

export function cacheFullShaderRow(rows, fullShader) {
  if (!fullShader?.id) return Array.isArray(rows) ? rows : [];
  const current = Array.isArray(rows) ? rows : [];
  const existing = current.find((shader) => shader.id === fullShader.id);
  if (!existing) return [fullShader, ...current];
  return current.map((shader) =>
    shader.id === fullShader.id ? { ...shader, ...fullShader } : shader,
  );
}

export function figmaLibraryKey(kind, id) {
  return `figma:${kind}:${id}`;
}

export function parseFigmaLibraryKey(key) {
  if (typeof key !== "string" || !key.startsWith("figma:")) return null;
  const rest = key.slice("figma:".length);
  const colon = rest.indexOf(":");
  if (colon <= 0) return null;
  const kind = rest.slice(0, colon);
  const id = rest.slice(colon + 1);
  if ((kind !== "effect" && kind !== "fill") || !id) return null;
  return { kind, id };
}

export function visibleLibrarySelection(cards, value) {
  if (!value) return "";
  return (cards || []).some(
    (card) => card?.key === value && !card.separatorLabel,
  )
    ? value
    : "";
}

function hasFigmaShaderLink(shader) {
  return (
    typeof shader?.figma_shader_id === "string" &&
    (shader.figma_shader_kind === "effect" ||
      shader.figma_shader_kind === "fill")
  );
}

export function buildShaderLibraryCards({
  drafts,
  cloudShaders,
  figmaShaders = [],
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
      description:
        typeof draft.description === "string" ? draft.description : "",
      kind: resolvedLibraryKind(draft),
      thumbnailUrl: thumbnails[draft.id] || null,
      authorId: user?.id ?? null,
      authorLabel: "Draft",
      authorName: user ? userName : ANON_YOU_LABEL,
      authorAvatarUrl: userAvatarUrl,
      authorHandle: null,
      features: draft.features || {},
      updatedAt: null,
      draft,
      cloud: null,
      figma: null,
      figmaLinked: hasFigmaShaderLink(draft),
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
      description:
        typeof shader.description === "string" ? shader.description : "",
      kind: resolvedLibraryKind(shader),
      thumbnailUrl:
        thumbnails[key] ||
        cloudThumbnails[shader.id] ||
        null,
      authorId: shader.owner_id ?? user?.id ?? null,
      authorLabel,
      authorName: authorLabel,
      authorAvatarUrl:
        shader.author_avatar_url || (owned ? userAvatarUrl : null),
      authorHandle: shader.author_handle || null,
      features: shader.features || {},
      updatedAt: shader.updated_at || null,
      draft: null,
      cloud: shader,
      figma: null,
      figmaLinked: hasFigmaShaderLink(shader),
      canDelete: owned,
    });
  });

  figmaShaders.forEach((shader) => {
    const kind = shader.kind === "fill" ? "fill" : "effect";
    const key = figmaLibraryKey(kind, shader.id);
    cards.push({
      key,
      origin: "figma",
      name: liveNames[key] || shader.name,
      description: shader.description || "",
      kind,
      thumbnailUrl: thumbnails[key] || null,
      authorId: null,
      authorLabel: "Figma",
      authorName: "Figma",
      authorAvatarUrl: null,
      authorHandle: null,
      features: shader.features || {},
      updatedAt: null,
      draft: null,
      cloud: null,
      figma: { id: shader.id, kind, description: shader.description || "" },
      figmaLinked: true,
      canDelete: false,
    });
  });

  return cards;
}

export function nextLibraryCardKey(cards, deletedKey) {
  const keys = (cards || [])
    .filter((card) => card?.key && !card.separatorLabel)
    .map((card) => card.key);
  const index = keys.indexOf(deletedKey);
  if (index >= 0) return keys[index + 1] ?? keys[index - 1] ?? null;
  return keys[0] ?? null;
}

export function filterShaderLibraryCards(
  cards,
  { query = "", kind = "all", origin = "all", author = "all" } = {}
) {
  const needle = query.trim().toLowerCase();
  return cards.filter((card) => {
    if (kind !== "all" && card.kind !== kind) return false;
    if (origin !== "all" && card.origin !== origin) return false;
    if (author === "me") {
      if (!card.canDelete) return false;
    } else if (author !== "all" && card.authorId !== author) {
      return false;
    }
    if (!needle) return true;
    return (
      card.name.toLowerCase().includes(needle) ||
      String(card.description || "").toLowerCase().includes(needle) ||
      card.authorLabel.toLowerCase().includes(needle)
    );
  });
}
