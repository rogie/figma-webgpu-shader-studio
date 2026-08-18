import { useCallback, useEffect, useRef, useState } from "react";
import { listAllShaderVersions } from "../services/shaders.js";

export function useShaderPersistence({ userId, onError }) {
  const [currentShader, setCurrentShader] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shaderVersions, setShaderVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState(false);
  const [pendingAgentCheckpoint, setPendingAgentCheckpoint] = useState(null);
  const [duplicating, setDuplicating] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishToast, setPublishToast] = useState(null);

  const versionLoadGenerationRef = useRef(0);
  const lastSavedFingerprintRef = useRef("");
  const pendingAgentCheckpointRef = useRef(null);
  const agentCheckpointSavingRef = useRef(false);

  const isOwner = Boolean(userId && currentShader?.owner_id === userId);

  const refreshShaderVersions = useCallback(async () => {
    const generation = ++versionLoadGenerationRef.current;
    if (!isOwner || !currentShader?.id) {
      setShaderVersions([]);
      setVersionsLoading(false);
      return [];
    }
    setVersionsLoading(true);
    try {
      const versions = await listAllShaderVersions(currentShader.id);
      if (generation === versionLoadGenerationRef.current) {
        setShaderVersions(versions);
      }
      return versions;
    } catch (error) {
      if (generation !== versionLoadGenerationRef.current) return [];
      throw error;
    } finally {
      if (generation === versionLoadGenerationRef.current) {
        setVersionsLoading(false);
      }
    }
  }, [currentShader?.id, isOwner]);

  useEffect(() => {
    refreshShaderVersions().catch(onError);
  }, [onError, refreshShaderVersions]);

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
