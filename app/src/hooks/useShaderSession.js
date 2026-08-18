import { useCallback } from "react";
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
      setIsPublic(Boolean(nextPublic));
      setPendingMedia(media);
      setDirty(nextDirty);

      const restoredSource = readInputSource(sessionId) || "image";
      setInputSource(restoredSource);
      inputSourceRef.current = restoredSource;

      const host = hostRef.current;
      if (!host?.ready) return;
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
      setShaderName,
      setShaderRoute,
      setSource,
    ],
  );
}
