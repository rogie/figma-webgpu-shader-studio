import {
  emptyComposition,
  isLibraryKind,
  normalizeComposition,
  readEffectFillsFromComposition,
} from "./composition.js";
import { isTransientDraftMediaUrl } from "./draftMediaStorage.js";
import { figmaShaderLink, isDraftId } from "./shaderIdentity.js";

export const DRAFTS_STORAGE_KEY = "figma-shader-studio:drafts";
export const ACTIVE_DRAFT_STORAGE_KEY = "figma-shader-studio:active-draft";

function persistableMediaFill(fill) {
  const slot =
    fill?.paint?.type === "video"
      ? "video"
      : fill?.paint?.type === "image"
        ? "image"
        : null;
  if (!slot) return fill;
  const media = { ...(fill.paint?.[slot] || {}) };
  if (isTransientDraftMediaUrl(media.url)) delete media.url;
  if (isTransientDraftMediaUrl(media.poster)) delete media.poster;
  return {
    ...fill,
    paint: {
      ...fill.paint,
      [slot]: media,
    },
  };
}

function persistableComposition(composition) {
  const graph = normalizeComposition(composition);
  return {
    ...graph,
    fills: graph.fills.map(persistableMediaFill),
  };
}

function effectFillState(draft) {
  let composition = null;
  if (Array.isArray(draft?.effectFills)) {
    composition = { effectFills: draft.effectFills };
  } else if (Array.isArray(draft?.composition?.effectFills)) {
    composition = { effectFills: draft.composition.effectFills };
  } else {
    const effectFill = draft?.effectFill || draft?.composition?.effectFill;
    if (effectFill) composition = { effectFill };
  }
  if (!composition) return null;
  const effectFills = readEffectFillsFromComposition(composition);
  const persistedFills = effectFills.map(persistableMediaFill);
  return {
    effectFills: persistedFills,
    effectFill: persistedFills[0] || null,
  };
}

export function serializeDraft(draft) {
  const storedEffectFills =
    draft.kind === "effect" ? effectFillState(draft) : null;
  return {
    id: draft.id,
    name: draft.name,
    description:
      typeof draft.description === "string"
        ? draft.description.slice(0, 1000)
        : "",
    kind: draft.kind,
    source: typeof draft.source === "string" ? draft.source : "",
    values: draft.values && typeof draft.values === "object" ? draft.values : {},
    ...(draft.kind === "composition"
      ? { composition: persistableComposition(draft.composition) }
      : storedEffectFills
        ? { composition: storedEffectFills }
        : {}),
    dependencySnapshots:
      draft.dependencySnapshots &&
      typeof draft.dependencySnapshots === "object" &&
      !Array.isArray(draft.dependencySnapshots)
        ? draft.dependencySnapshots
        : {},
    isPublic: Boolean(draft.isPublic),
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
      .map((draft) => {
        const storedEffectFills =
          draft.kind === "effect" ? effectFillState(draft) : null;
        return {
          id: draft.id,
          name: draft.name,
          description:
            typeof draft.description === "string"
              ? draft.description.slice(0, 1000)
              : "",
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
            : storedEffectFills
              ? {
                  composition: storedEffectFills,
                  effectFills: storedEffectFills.effectFills,
                  effectFill: storedEffectFills.effectFill,
                }
              : {}),
          dependencySnapshots:
            draft.dependencySnapshots &&
            typeof draft.dependencySnapshots === "object" &&
            !Array.isArray(draft.dependencySnapshots)
              ? draft.dependencySnapshots
              : {},
          isPublic: Boolean(draft.isPublic),
          pendingMedia: null,
          thumbnail:
            typeof draft.thumbnail === "string" ? draft.thumbnail : null,
          ...figmaShaderLink(draft),
        };
      });
  } catch {
    return [];
  }
}

/**
 * Removes regenerable thumbnail data while preserving every draft's source
 * and settings. Replacing the existing value with a smaller one can recover
 * from a full localStorage quota.
 */
export function stripPersistedDraftThumbnails(
  storage = globalThis.localStorage,
) {
  try {
    const raw = storage?.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return 0;
    const drafts = JSON.parse(raw);
    if (!Array.isArray(drafts)) return 0;
    let removed = 0;
    const compacted = drafts.map((draft) => {
      if (
        !draft ||
        typeof draft !== "object" ||
        typeof draft.thumbnail !== "string" ||
        !draft.thumbnail.startsWith("data:")
      ) {
        return draft;
      }
      removed += 1;
      return { ...draft, thumbnail: null };
    });
    if (removed) {
      storage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(compacted));
    }
    return removed;
  } catch {
    return 0;
  }
}

/** Persist compact draft metadata; preview blobs live in IndexedDB. */
export function writeDrafts(
  drafts,
  _thumbnailDataUrls = {},
  storage = globalThis.localStorage,
) {
  storage?.setItem(
    DRAFTS_STORAGE_KEY,
    JSON.stringify(drafts.map((draft) => serializeDraft(draft))),
  );
}
