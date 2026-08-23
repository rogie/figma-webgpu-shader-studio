import { useCallback } from "react";
import {
  COMPOSITION_KIND,
  emptyComposition,
  fillFromInputSource,
  mediaFillType,
  normalizeComposition,
  readEffectFillFromComposition,
  sessionInputPlan,
} from "../lib/composition.js";
import {
  rememberEffectFill,
  resolveSessionEffectFill,
} from "../lib/effectFillStorage.js";
import { readInputSource } from "../lib/inputSourceStorage.js";
import { mediaType } from "../lib/mediaFiles.js";
import {
  defaultInputUrl,
  defaultVectorUrl,
  defaultVideoUrl,
} from "../runtime/sample.js";

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
  effectFillStoreRef,
  sessionRef,
  setEffectFill,
  inputApplyGenRef,
  sessionInputAppliedRef,
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
      if (inputApplyGenRef) inputApplyGenRef.current += 1;
      const previous = sessionRef?.current;
      if (previous?.kind === "effect" && previous.presetId) {
        rememberEffectFill(
          effectFillStoreRef?.current,
          previous.presetId,
          effectPaintRef?.current,
        );
      }
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

      let nextEffectFill = null;
      const storedInputSource = readInputSource(sessionId);
      if (nextKind === "effect") {
        nextEffectFill = resolveSessionEffectFill({
          sessionId,
          store: effectFillStoreRef?.current,
          fallbackSource: storedInputSource || "image",
          documentFill: readEffectFillFromComposition(nextComposition),
          sampleUrls: {
            image: defaultInputUrl,
            vector: defaultVectorUrl,
            video: defaultVideoUrl,
          },
        });
        setEffectFill?.(nextEffectFill);
        if (effectPaintRef) effectPaintRef.current = nextEffectFill;
      } else if (setEffectFill) {
        nextEffectFill = fillFromInputSource("image");
        setEffectFill(nextEffectFill);
        if (effectPaintRef) effectPaintRef.current = nextEffectFill;
      }

      const mediaTypeForSession =
        nextKind === COMPOSITION_KIND
          ? mediaFillType(graph.fill.type) || "image"
          : storedInputSource === "html" || storedInputSource === "video"
            ? storedInputSource
            : mediaFillType(nextEffectFill?.type) ||
              storedInputSource ||
              "image";
      setInputSource(mediaTypeForSession);
      inputSourceRef.current = mediaTypeForSession;

      const host = hostRef.current;
      if (!host?.ready) return;
      if (sessionInputAppliedRef) sessionInputAppliedRef.current = sessionId;
      const sessionPaint = nextEffectFill?.paint ?? effectPaintRef?.current?.paint;
      const plan = sessionInputPlan({
        kind: nextKind,
        graph,
        media,
        cloudShader,
        effectPaint: sessionPaint,
        inputSource: mediaTypeForSession,
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
      effectFillStoreRef,
      effectPaintRef,
      hostRef,
      sessionRef,
      setEffectFill,
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
