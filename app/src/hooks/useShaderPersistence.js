import { useCallback, useEffect, useRef, useState } from "react";
import { listShaderVersions } from "../services/shaders.js";
import { measurePerf, perfNow, recordPerf } from "../runtime/perf.js";
import {
  mergeVersionPage,
  VERSION_HISTORY_PAGE_SIZE,
} from "../lib/versionHistory.js";

export function useShaderPersistence({ userId, onError }) {
  const [currentShader, setCurrentShader] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shaderVersions, setShaderVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsHasMore, setVersionsHasMore] = useState(true);
  const [restoringVersion, setRestoringVersion] = useState(false);
  const [pendingAgentCheckpoint, setPendingAgentCheckpoint] = useState(null);
  const [duplicating, setDuplicating] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishToast, setPublishToast] = useState(null);

  const versionLoadGenerationRef = useRef(0);
  const versionPagesRef = useRef(new Map());
  const lastSavedFingerprintRef = useRef("");
  const pendingAgentCheckpointRef = useRef(null);
  const agentCheckpointSavingRef = useRef(false);

  const isOwner = Boolean(userId && currentShader?.owner_id === userId);

  const loadShaderVersions = useCallback(async ({
    reset = false,
    shaderId = currentShader?.id,
  } = {}) => {
    const generation = ++versionLoadGenerationRef.current;
    const canLoadCurrent = shaderId === currentShader?.id && isOwner;
    const canLoadOverride = shaderId !== currentShader?.id && Boolean(userId);
    if (!shaderId || (!canLoadCurrent && !canLoadOverride)) {
      setShaderVersions([]);
      setVersionsLoading(false);
      setVersionsHasMore(false);
      return [];
    }
    const cached = reset
      ? { versions: [], hasMore: true }
      : versionPagesRef.current.get(shaderId) || {
          versions: [],
          hasMore: true,
        };
    if (!cached.hasMore && !reset) return cached.versions;
    setVersionsLoading(true);
    const startedAt = perfNow();
    try {
      recordPerf("navigation.versionMetadataRequest");
      const beforeVersion =
        !reset && cached.versions.length
          ? cached.versions[cached.versions.length - 1].version_number
          : null;
      const page = await listShaderVersions(shaderId, {
        beforeVersion,
        limit: VERSION_HISTORY_PAGE_SIZE,
      });
      const next = mergeVersionPage(cached.versions, page, { reset });
      const { versions } = next;
      versionPagesRef.current.set(shaderId, next);
      if (generation === versionLoadGenerationRef.current) {
        setShaderVersions(versions);
        setVersionsHasMore(next.hasMore);
      }
      measurePerf("navigation.versionMetadata", startedAt);
      return versions;
    } catch (error) {
      if (generation !== versionLoadGenerationRef.current) return [];
      throw error;
    } finally {
      if (generation === versionLoadGenerationRef.current) {
        setVersionsLoading(false);
      }
    }
  }, [currentShader?.id, isOwner, userId]);

  useEffect(() => {
    versionLoadGenerationRef.current += 1;
    if (!isOwner || !currentShader?.id) {
      setShaderVersions([]);
      setVersionsHasMore(false);
      setVersionsLoading(false);
      return;
    }
    const cached = versionPagesRef.current.get(currentShader.id);
    setShaderVersions(cached?.versions || []);
    setVersionsHasMore(cached?.hasMore ?? true);
    setVersionsLoading(false);
  }, [currentShader?.id, isOwner]);

  const refreshShaderVersions = useCallback(
    (shaderId = currentShader?.id) =>
      loadShaderVersions({ reset: true, shaderId }).catch((error) => {
        onError?.(error);
        return [];
      }),
    [currentShader?.id, loadShaderVersions, onError],
  );

  return {
    currentShader,
    setCurrentShader,
    dirty,
    setDirty,
    saving,
    setSaving,
    shaderVersions,
    setShaderVersions,
    versionsLoading,
    versionsHasMore,
    loadShaderVersions,
    restoringVersion,
    setRestoringVersion,
    pendingAgentCheckpoint,
    setPendingAgentCheckpoint,
    duplicating,
    setDuplicating,
    isPublic,
    setIsPublic,
    publishOpen,
    setPublishOpen,
    publishToast,
    setPublishToast,
    isOwner,
    refreshShaderVersions,
    lastSavedFingerprintRef,
    pendingAgentCheckpointRef,
    agentCheckpointSavingRef,
  };
}
