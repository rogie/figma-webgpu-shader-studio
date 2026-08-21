import { useCallback } from "react";
import {
  COMPOSITION_KIND,
  emptyComposition,
  mediaFillType,
  normalizeComposition,
} from "../lib/composition.js";
import { readInputSource } from "../lib/inputSourceStorage.js";
import { mediaType } from "../lib/mediaFiles.js";

export function useShaderSession({
  persistActiveDraft,
  pendingValuesRef,
  hostRef,
  playPreferenceRef,
  inputSourceRef,
  setRunning,
  setError,
  setCurrentShader,
  setPresetId,
  setShaderRoute,
  setShaderName,
  setSource,
  setSessionKind,
  setComposition,
  setIsPublic,
  setPendingMedia,
  setDirty,
  setInputSource,
  clearObjectUrl,
  applyMediaBlob,
  loadMediaForShader,
  reapplyPreferredInput,
}) {
  return useCallback(
    async ({
      sessionId,
      routeId: nextRouteId = sessionId,
      name,
      source: nextSource,
      kind: nextKind,
      composition: nextComposition = null,
      values: nextValues = {},
      public: nextPublic = false,
      media = null,
      dirty: nextDirty = false,
      cloudShader = null,
      persistPrevious = true,
    }) => {
      if (persistPrevious) persistActiveDraft();
      pendingValuesRef.current = nextValues;
      hostRef.current?.stop();
      setRunning(playPreferenceRef.current);
      setError(null);
      setCurrentShader(cloudShader);
      setPresetId(sessionId);
      setShaderRoute(nextRouteId);
      setShaderName(name);
      setSource(nextSource);
      setSessionKind(nextKind);
      const graph =
        nextKind === COMPOSITION_KIND
          ? normalizeComposition(nextComposition || emptyComposition())
          : null;
      setComposition(graph);
      setIsPublic(Boolean(nextPublic));
      setPendingMedia(media);
      setDirty(nextDirty);

      const mediaTypeForSession =
        nextKind === COMPOSITION_KIND
          ? mediaFillType(graph.fill.type) || "image"
          : readInputSource(sessionId) || "image";
      setInputSource(mediaTypeForSession);
      inputSourceRef.current = mediaTypeForSession;

      const host = hostRef.current;
      if (!host?.ready) return;
      if (nextKind === COMPOSITION_KIND) {
        if (graph.fill.type === "shader") {
          clearObjectUrl();
          host.clearInput();
          return;
        }
        if (media) {
          await applyMediaBlob(media, mediaType(media));
          return;
        }
        if (cloudShader?.input_path) {
          await loadMediaForShader(cloudShader);
          return;
        }
        await reapplyPreferredInput();
        return;
      }
      if (nextKind !== "effect") {
        clearObjectUrl();
        host.clearInput();
        return;
      }
      if (media) {
        await applyMediaBlob(media, mediaType(media));
        return;
      }
      if (cloudShader?.input_path) {
        await loadMediaForShader(cloudShader);
        return;
      }
      await reapplyPreferredInput();
    },
    [
      applyMediaBlob,
      clearObjectUrl,
      hostRef,
      inputSourceRef,
      loadMediaForShader,
      pendingValuesRef,
      persistActiveDraft,
      playPreferenceRef,
      reapplyPreferredInput,
      setCurrentShader,
      setDirty,
      setError,
      setInputSource,
      setIsPublic,
      setPendingMedia,
      setPresetId,
      setRunning,
      setComposition,
      setSessionKind,
      setShaderName,
      setShaderRoute,
      setSource,
    ],
  );
}
