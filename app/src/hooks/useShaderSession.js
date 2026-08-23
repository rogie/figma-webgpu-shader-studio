import { useCallback } from "react";
import {
  COMPOSITION_KIND,
  emptyComposition,
  mediaFillType,
  normalizeComposition,
  sessionInputPlan,
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
  applyPaintFill,
  loadMediaForShader,
  reapplyPreferredInput,
  effectPaintRef,
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
      setShaderRoute(nextRouteId, nextKind);
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
      const plan = sessionInputPlan({
        kind: nextKind,
        graph,
        media,
        cloudShader,
        effectPaint: effectPaintRef?.current,
      });
      if (plan.action === "clear") {
        clearObjectUrl();
        host.clearInput();
        return;
      }
      if (plan.action === "media") {
        await applyMediaBlob(plan.media, mediaType(plan.media));
        return;
      }
      if (plan.action === "download") {
        await loadMediaForShader(plan.shader);
        return;
      }
      if (plan.action === "paint") {
        await applyPaintFill(plan.paint);
        return;
      }
      await reapplyPreferredInput();
    },
    [
      applyMediaBlob,
      applyPaintFill,
      clearObjectUrl,
      effectPaintRef,
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
