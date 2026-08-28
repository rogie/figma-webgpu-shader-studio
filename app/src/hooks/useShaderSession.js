import { useCallback } from "react";
import {
  COMPOSITION_KIND,
  emptyComposition,
  fillFromInputSource,
  mediaFillType,
  normalizeComposition,
  readEffectFillsFromComposition,
  sessionInputPlan,
} from "../lib/composition.js";
import {
  rememberEffectFills,
  resolveSessionEffectFills,
} from "../lib/effectFillStorage.js";
import { readInputSource } from "../lib/inputSourceStorage.js";
import { mediaType } from "../lib/mediaFiles.js";
import {
  defaultInputUrl,
  defaultVectorUrl,
  defaultVideoUrl,
} from "../runtime/sample.js";
import { measurePerf, perfNow } from "../runtime/perf.js";
import {
  beginSessionRequest,
  persistBeforeSessionActivation,
} from "../lib/sessionRequests.js";

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
  setShaderDescription,
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
  effectFillsRef,
  effectPaintRef,
  effectFillStoreRef,
  sessionRef,
  activeDependencySnapshotsRef,
  setEffectFills,
  setEffectFill,
  inputApplyGenRef,
  sessionInputAppliedRef,
  navigationStartedAtRef,
  sessionRequestRef,
}) {
  return useCallback(
    async ({
      sessionId,
      routeId: nextRouteId = sessionId,
      name,
      description: nextDescription = "",
      source: nextSource,
      kind: nextKind,
      composition: nextComposition = null,
      values: nextValues = {},
      public: nextPublic = false,
      media = null,
      dirty: nextDirty = false,
      cloudShader = null,
      dependencySnapshots,
      persistPrevious = true,
      requestId = null,
    }) => {
      const activationStartedAt = perfNow();
      if (!beginSessionRequest(sessionRequestRef, requestId)) return;
      const activeRequestId = sessionRequestRef?.current ?? requestId;
      if (navigationStartedAtRef && !navigationStartedAtRef.current) {
        navigationStartedAtRef.current = activationStartedAt;
      }
      if (persistPrevious) {
        const current = await persistBeforeSessionActivation({
          persist: persistActiveDraft,
          sessionRequestRef,
          requestId: activeRequestId,
        });
        if (!current) return;
      }
      if (inputApplyGenRef) inputApplyGenRef.current += 1;
      const previous = sessionRef?.current;
      if (previous?.kind === "effect" && previous.presetId) {
        const previousFills = Array.isArray(effectFillsRef?.current)
          ? effectFillsRef.current
          : Array.isArray(previous.effectFills)
            ? previous.effectFills
            : effectPaintRef?.current
              ? [effectPaintRef.current]
              : [];
        rememberEffectFills(
          effectFillStoreRef?.current,
          previous.presetId,
          previousFills,
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
      setShaderDescription(nextDescription);
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
      if (activeDependencySnapshotsRef) {
        const snapshots =
          dependencySnapshots ?? cloudShader?.dependency_snapshots ?? {};
        activeDependencySnapshotsRef.current =
          snapshots && typeof snapshots === "object"
            ? structuredClone(snapshots)
            : {};
      }

      let nextEffectFills = [];
      let nextEffectFill = null;
      const storedInputSource = readInputSource(sessionId);
      if (nextKind === "effect") {
        const hasDocumentEffectFills =
          nextComposition &&
          (Array.isArray(nextComposition.effectFills) ||
            Object.prototype.hasOwnProperty.call(
              nextComposition,
              "effectFill",
            ));
        nextEffectFills = resolveSessionEffectFills({
          sessionId,
          store: effectFillStoreRef?.current,
          fallbackSource: storedInputSource || "image",
          documentFills: hasDocumentEffectFills
            ? readEffectFillsFromComposition(nextComposition)
            : null,
          documentAuthoritative: Boolean(
            cloudShader && hasDocumentEffectFills && !nextDirty,
          ),
          sampleUrls: {
            image: defaultInputUrl,
            vector: defaultVectorUrl,
            video: defaultVideoUrl,
          },
        });
        nextEffectFill = nextEffectFills[0] || null;
        setEffectFills?.(nextEffectFills);
        setEffectFill?.(nextEffectFill);
        if (effectFillsRef) effectFillsRef.current = nextEffectFills;
        if (effectPaintRef) effectPaintRef.current = nextEffectFill;
      } else {
        nextEffectFill = fillFromInputSource("image");
        nextEffectFills = [nextEffectFill];
        setEffectFills?.(nextEffectFills);
        setEffectFill?.(nextEffectFill);
        if (effectFillsRef) effectFillsRef.current = nextEffectFills;
        if (effectPaintRef) effectPaintRef.current = nextEffectFill;
      }

      const topmostCompositionFill = graph?.fills.find((fill) => fill.enabled);
      const topmostEffectPaintFill = nextEffectFills.find(
        (fill) => fill.enabled && fill.paint,
      );
      const mediaTypeForSession =
        nextKind === COMPOSITION_KIND
          ? mediaFillType(topmostCompositionFill?.type) || "image"
          : storedInputSource === "html" || storedInputSource === "video"
            ? storedInputSource
            : mediaFillType(topmostEffectPaintFill?.type) ||
              storedInputSource ||
              "image";
      setInputSource(mediaTypeForSession);
      inputSourceRef.current = mediaTypeForSession;
      measurePerf("navigation.sessionActivation", activationStartedAt);

      const host = hostRef.current;
      if (!host?.ready) return;
      if (sessionInputAppliedRef) sessionInputAppliedRef.current = sessionId;
      // Effect fill stacks are rendered by the composition host. Loading the
      // legacy row-level input asset here would replace the first persisted
      // fill with a new blob URL and discard its per-layer asset path.
      if (nextKind === "effect" && nextEffectFills.length) {
        clearObjectUrl();
        host.clearInput();
        return;
      }
      const sessionPaint =
        topmostEffectPaintFill?.paint ?? effectPaintRef?.current?.paint;
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
      activeDependencySnapshotsRef,
      clearObjectUrl,
      effectFillStoreRef,
      effectFillsRef,
      effectPaintRef,
      hostRef,
      sessionRef,
      sessionRequestRef,
      setEffectFills,
      setEffectFill,
      inputSourceRef,
      loadMediaForShader,
      navigationStartedAtRef,
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
      setShaderDescription,
      setShaderRoute,
      setSource,
    ],
  );
}
