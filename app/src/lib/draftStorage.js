import {
  emptyComposition,
  isLibraryKind,
  normalizeComposition,
  readEffectFillFromComposition,
} from "./composition.js";
import { figmaShaderLink, isDraftId } from "./shaderIdentity.js";

export const DRAFTS_STORAGE_KEY = "figma-shader-studio:drafts";
export const ACTIVE_DRAFT_STORAGE_KEY = "figma-shader-studio:active-draft";

export function serializeDraft(draft, thumbnail = null) {
  return {
    id: draft.id,
    name: draft.name,
    kind: draft.kind,
    source: typeof draft.source === "string" ? draft.source : "",
    values: draft.values && typeof draft.values === "object" ? draft.values : {},
    ...(draft.kind === "composition"
      ? { composition: normalizeComposition(draft.composition) }
      : draft.kind === "effect" &&
          (draft.effectFill || draft.composition?.effectFill)
        ? {
            composition: {
              effectFill:
                readEffectFillFromComposition({
                  effectFill: draft.effectFill || draft.composition?.effectFill,
                }) || draft.effectFill,
            },
          }
        : {}),
    isPublic: Boolean(draft.isPublic),
    thumbnail: typeof thumbnail === "string" ? thumbnail : null,
    ...figmaShaderLink(draft),
  };
}

export function readDrafts(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (draft) =>
          draft &&
          isDraftId(draft.id) &&
          typeof draft.name === "string" &&
          isLibraryKind(draft.kind) &&
          (draft.kind === "composition" || typeof draft.source === "string"),
      )
      .map((draft) => ({
        id: draft.id,
        name: draft.name,
        kind: draft.kind,
        source: typeof draft.source === "string" ? draft.source : "",
        values:
          draft.values && typeof draft.values === "object" ? draft.values : {},
        ...(draft.kind === "composition"
          ? {
              composition: normalizeComposition(
                draft.composition || emptyComposition()
              ),
            }
          : draft.kind === "effect" && draft.composition?.effectFill
            ? {
                composition: {
                  effectFill: readEffectFillFromComposition(draft.composition),
                },
                effectFill: readEffectFillFromComposition(draft.composition),
              }
            : {}),
        isPublic: Boolean(draft.isPublic),
        pendingMedia: null,
        thumbnail:
          typeof draft.thumbnail === "string" ? draft.thumbnail : null,
        ...figmaShaderLink(draft),
      }));
  } catch {
    return [];
  }
}

/** Persist only serializable data: URLs (blob: URLs die on reload). */
export function writeDrafts(
  drafts,
  thumbnailDataUrls = {},
  storage = globalThis.localStorage,
) {
  storage?.setItem(
    DRAFTS_STORAGE_KEY,
    JSON.stringify(
      drafts.map((draft) => {
        const stored = thumbnailDataUrls[draft.id];
        const thumbnail =
          typeof stored === "string" && stored.startsWith("data:")
            ? stored
            : typeof draft.thumbnail === "string" &&
                draft.thumbnail.startsWith("data:")
              ? draft.thumbnail
              : null;
        return serializeDraft(draft, thumbnail);
      }),
    ),
  );
}
