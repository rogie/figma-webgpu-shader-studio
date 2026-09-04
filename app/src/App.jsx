import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CompositionEditor, {
  DocumentInputsPane,
  ExportPropertiesPane,
  FigmaPropertiesPane,
} from "./components/CompositionEditor.jsx";
import AccountMenu from "./components/AccountMenu.jsx";
import AppNav from "./components/AppNav.jsx";
import AppToasts from "./components/AppToasts.jsx";
import DeleteShaderDialog from "./components/DeleteShaderDialog.jsx";
import ExportDialog from "./components/ExportDialog.jsx";
import FigmaPlanDialog from "./components/FigmaPlanDialog.jsx";
import HomeView from "./components/HomeView.jsx";
import ProfileView from "./components/ProfileView.jsx";
import "./components/HomeNav.css";
import ComposerView from "./components/ComposerView.jsx";
import LibraryFilterMenu from "./components/LibraryFilterMenu.jsx";
import PopoutIcon from "./components/PopoutIcon.jsx";
import ToggleSidebarIcon from "./components/ToggleSidebarIcon.jsx";
import ShaderView from "./components/ShaderView.jsx";
import Preview from "./components/Preview.jsx";
import PreviewToolbar from "./components/PreviewToolbar.jsx";
import PresentSettingsDialog from "./components/PresentSettingsDialog.jsx";
import ShaderActionsMenu from "./components/ShaderActionsMenu.jsx";
import ShaderList from "./components/ShaderList.jsx";
import ShaderCard from "./components/ShaderCard.jsx";
import ShaderVersionSelect from "./components/ShaderVersionSelect.jsx";
import UserAvatar from "./components/UserAvatar.jsx";
import ViewPropertiesDialog from "./components/ViewPropertiesDialog.jsx";
import { useAuth } from "./contexts/AuthContext.jsx";
import { getPreset, shaderModuleFileName } from "./presets.js";
import { exportFigmaFiles } from "./runtime/exportFigma.js";
import {
  evenExportSize,
  renderVideoInWorker,
  imageExportQualityFactor,
  resolveEmbedFormat,
  resolveImageExportFormat,
  resolveImageExportQuality,
  resolveVideoExportAspect,
  resolveVideoExportFormat,
  resolveVideoExportResolution,
  resolveVideoExportSize,
  videoExportFileExtension,
  videoResolutionOptions,
} from "./runtime/exportVideo.js";
import {
  applyAudioPlayback,
  decodeExportPcm,
  resolveExportSoundtrack,
} from "./runtime/exportAudio.js";
import { ShaderHost } from "./runtime/host.js";
import { subscribePreviewPixelRatioMode } from "./runtime/dpi.js";
import { loadModule } from "./runtime/loader.js";
import { measurePerf, perfNow, recordPerf } from "./runtime/perf.js";
import {
  buildDefaults,
  detectKind,
  inferFeatures,
  mergeShaderFeatures,
  supportsRenderScale,
} from "./runtime/params.js";
import {
  HTML_IN_CANVAS_SETUP,
  HTML_INPUT_HEIGHT,
  HTML_INPUT_WIDTH,
  supportsCopyElementImageToTexture,
  supportsHtmlInCanvas,
} from "./runtime/htmlInCanvas.js";
import defaultInputUrl from "./assets/default-input.png";
import {
  defaultVectorUrl,
  defaultVideoUrl,
  imageBitmapForInput,
  makeSampleBitmap,
  makeSampleVectorBitmap,
  makeSampleVideoBlob,
  rasterizeSvgBlob,
} from "./runtime/sample.js";
import { CANVAS_PROP_TYPES } from "./lib/canvasControls.js";
import { portalToFigOverlay } from "./lib/figOverlay.js";
import {
  applyDefaultValuesToProps,
  applyDefaultValuesToSource,
} from "./lib/definePropertiesDefaults.js";
import {
  isPlanDocument,
  loadLocalPlan,
  removeLocalPlan,
  saveLocalPlan,
} from "./lib/chatPlans.js";
import {
  copyChatThreadKey,
  migrateChatThreadKey,
} from "./lib/chatThreads.js";
import {
  copyCursorAgentThreadKey,
  migrateCursorAgentThreadKey,
} from "./lib/cursorAgent.js";
import {
  buildShaderDocumentPayload,
  buildShaderDocumentSnapshot,
  buildShaderStateSavePayload,
  editorStateMatchesSnapshot,
  shaderDocumentFingerprint,
} from "./lib/shaderDocument.js";
import {
  createPresentSessionId,
  isPresentMessage,
  makePresentUrl,
  presentChannelName,
  presentMessage,
  readPresentSessionId,
} from "./lib/presentWindow.js";
import {
  hasUncheckpointedShaderState,
  isShaderStateConflict,
  resolveAgentCheckpointAfterCompile,
  summarizeAgentVersion,
  summarizeManualVersion,
} from "./lib/shaderVersions.js";
import { versionPreviewRestoreSnapshot } from "./lib/versionPreview.js";
import { refreshRestoredRuntime } from "./lib/versionRestoreRuntime.js";
import { validateModuleSource } from "./lib/chatApply.js";
import {
  AUTOSAVE_DISPOSITION,
  getAutosaveDisposition,
} from "./lib/autosaveDisposition.js";
import {
  ANON_YOU_LABEL,
  buildShaderLibraryCards,
  cacheFullShaderRow,
  figmaLibraryKey,
  filterShaderLibraryCards,
  nextLibraryCardKey,
} from "./lib/shaderLibrary.js";
import {
  LIBRARY_THUMBNAIL_URL_TTL_MS,
  LIBRARY_ROW_CACHE_FRESH_MS,
  libraryCacheIsFresh,
  libraryCacheScope,
  libraryRefreshIsCurrent,
  readLibrarySessionCache,
  reconcileLibraryShaders,
  writeLibrarySessionCache,
} from "./lib/librarySessionCache.js";
import {
  formatSupabaseError,
  isTransientCloudWriteError,
} from "./lib/supabaseFetch.js";
import { resetPropertiesForTarget } from "./lib/propertyReset.js";
import {
  getFigmaAccessToken,
  subscribeFigmaAccessToken,
} from "./lib/figmaAccessToken.js";
import { FIGMA_LIBRARY_UI_ENABLED } from "./lib/figmaLibraryUi.js";
import {
  preferredFigmaPlan,
  setPreferredFigmaPlanKey,
} from "./lib/figmaPlanPreference.js";
import {
  createAndDeployFigmaShader,
  figmaShaderProgressMessage,
  figmaShaderSuccessMessage,
  figmaShaderUpdateMetadata,
} from "./lib/figmaShaderSync.js";
import { buildStandaloneEmbedCode } from "./lib/embedCode.js";
import {
  ACTIVE_DRAFT_STORAGE_KEY,
  readDrafts as savedDrafts,
  writeDrafts,
} from "./lib/draftStorage.js";
import { orderDraftsForMigration } from "./lib/draftContinuity.js";
import { removePromotedDraftState } from "./lib/draftPromotionCleanup.js";
import {
  annotatePersistedFillMedia,
  createDraftMediaStore,
  draftMediaRecordToFile,
  hydratePersistedFillMediaStack,
  unresolvedLocalDraftMediaKey,
} from "./lib/draftMediaStorage.js";
import { writeInputSource as persistInputSource } from "./lib/inputSourceStorage.js";
import {
  persistableEffectFills,
  readEffectFill,
  readEffectFills,
  rememberEffectFills,
} from "./lib/effectFillStorage.js";
import {
  blobToDataUrl,
  dataUrlToObjectUrl,
  fileFromBlobUrl,
  mediaType,
  revokeObjectUrl as revokeThumbnailUrl,
} from "./lib/mediaFiles.js";
import { createRafCssWriter } from "./lib/panelResize.js";
import {
  CANVAS_CONTROLS_STORAGE_KEY,
  CANVAS_THEME_STORAGE_KEY,
  DEFAULT_APP_NAV_WIDTH,
  DEFAULT_CHAT_HEIGHT,
  defaultCodeWidth,
  EDITOR_FILTERS_STORAGE_KEY,
  LIBRARY_VIEW_STORAGE_KEY,
  APP_NAV_COLLAPSED_STORAGE_KEY,
  MAX_APP_NAV_WIDTH,
  MIN_APP_NAV_WIDTH,
  MIN_CHAT_HEIGHT,
  MIN_CODE_EDITOR_HEIGHT,
  MIN_CODE_WIDTH,
  MIN_PREVIEW_HEIGHT,
  MIN_PREVIEW_WIDTH,
  MIN_STACKED_SIDEBAR,
  PLAY_STORAGE_KEY,
  readCanvasControlsVisible as savedCanvasControlsVisible,
  readCanvasTheme as savedCanvasTheme,
  readEditorFilters as savedEditorFilters,
  readLibraryView as savedLibraryView,
  readAppNavCollapsed as savedAppNavCollapsed,
  readPlayState as savedPlayState,
  readSidebarSections as savedSidebarSections,
  readTheme as savedTheme,
  readExperimentalAudio as savedExperimentalAudio,
  subscribeExperimentalAudio,
  SIDEBAR_SECTIONS_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from "./lib/layoutStorage.js";
import {
  collectCompositionFeatures,
  compositionLayerShaderId,
  compositionPaintFill,
  compositionStructureKey,
  COMPOSITION_FILL_ID,
  COMPOSITION_KIND,
  emptyComposition,
  enabledVideoFillSoundtrack,
  fillFromInputSource,
  paintForInputSource,
  resolvedLibraryKind,
  fillTypeForDroppedMedia,
  isCompositionPlayable,
  isDocumentPlayable,
  isLiveWebcamFill,
  liveWebcamFillCount,
  mediaFillType,
  normalizeComposition,
  parseCompositionShaderId,
  readEffectFillsFromComposition,
  readReferencedShader,
  referencedShaderKeys,
  replacePrimaryCompositionFill,
  resolveReferencedShaderSource,
  unpublishedCompositionLabels,
  unpublishedCompositionRefs,
  promoteCompositionRefs,
  serializeCompositionExport,
} from "./lib/composition.js";
import {
  buildCompositionDependencySnapshots,
  dependencyLayerSourceOverrides,
  dependencySourceForKey,
  dependencySnapshotForKey,
  resolvedByKeyWithDependencySnapshots,
} from "./lib/compositionDependencies.js";
import { cloudSessionComposition } from "./lib/cloudCompositionGraph.js";
import {
  graphTypeForPaint,
  fillLoadErrorMessage,
  isPaintFillType,
  paintImageSource,
  paintSize,
  rasterizePaintFill,
  resolvePaintFill,
  sampleFallbackPaint,
} from "./lib/paintFill.js";
import {
  audioPlaybackSettings,
  enabledAudioFileInput,
  enabledMicrophoneInput,
  hasAudioInput,
  normalizeDocumentInputs,
  readDocumentInputs,
  removedDocumentInputs,
} from "./lib/documentInputs.js";
import {
  documentAudioAssetPaths,
  hasDraftAudioMedia,
  hydrateAudioInputsWithUrls,
  hydrateDraftAudioInputs,
  persistDraftAudioInputs,
  uploadDocumentInputAudio,
} from "./lib/documentInputMedia.js";
import { AudioInputBus } from "./runtime/audioInput.js";
import {
  cloudChoiceId,
  cloudIdForDraft,
  figmaShaderLink,
  isDraftId,
  shaderMetadataUnchanged,
} from "./lib/shaderIdentity.js";
import { activateBeforeHydration } from "./lib/sessionRequests.js";
import {
  expectedStateRevision,
  rememberStateRevision,
} from "./lib/stateRevisionBaseline.js";
import { createOrResumeCloudDraft } from "./lib/cloudDraftPromotion.js";
import {
  shaderSaveQueue,
  withExclusiveShaderSave,
} from "./lib/shaderSaveQueue.js";
import {
  buildFigmaShaderPackage,
  createFigmaShader,
  getFigmaShader,
  listAllFigmaShaders,
  listFigmaPlans,
  updateFigmaShader,
} from "./services/figmaShaders.js";
import { useFigMenuChange } from "./hooks/useFigMenuChange.js";
import { useOverflowFade } from "./hooks/useOverflowFade.js";
import { usePanelLayout } from "./hooks/usePanelLayout.js";
import { useShaderPersistence } from "./hooks/useShaderPersistence.js";
import { useShaderRuntime } from "./hooks/useShaderRuntime.js";
import { useShaderSession } from "./hooks/useShaderSession.js";
import {
  ASSET_BUCKET,
  createShader,
  deleteShader,
  downloadAsset,
  downloadShaderPlan,
  getAssetUrl,
  getAssetUrls,
  getThumbnailUrls,
  getProfile,
  getShader,
  getShaderMaybe,
  getShadersByIds,
  getShaderVersion,
  getAppRoute,
  getShaderRouteId,
  listShaderAssetPaths,
  listShaderThumbnailPaths,
  listShaderVersions,
  listShaders,
  listPublicShaderGraphs,
  listRetainedShaderAssetPaths,
  makeEmbedUrl,
  makeHomeUrl,
  makeProfileUrl,
  makeShareUrl,
  makeViewUrl,
  MAX_MEDIA_BYTES,
  THUMBNAIL_BUCKET,
  removeAssets,
  removeThumbnailAssets,
  removeShaderPlan,
  restoreShaderVersion,
  saveShaderState,
  updateShader,
  uploadAsset,
  uploadThumbnailAsset,
  uploadShaderPlan,
} from "./services/shaders.js";
import {
  createThumbnailVariant,
  THUMBNAIL_SIZE,
} from "./lib/thumbnailVariants.js";

const CodePane = lazy(() => import("./components/CodePane.jsx"));
const Controls = lazy(() => import("./components/Controls.jsx"));
const ShaderChatSection = lazy(
  () => import("./components/ShaderChatSection.jsx"),
);

// FigUI3 builds light-DOM internals; a stable opaque marker keeps React from
// wiping those nodes when the parent re-renders.
const opaqueContent = { __html: "" };

const THUMBNAIL_IDLE_MS = 4000;
const BACKGROUND_AUTOSAVE_MS = 4000;
const CLOUD_WRITE_BACKOFF_MS = 20_000;
const FILL_ASSET_URL_CACHE_MS = 5 * 60_000;

async function uploadThumbnailVariants({
  ownerId,
  shaderId,
  blob,
  public: usePublicBucket,
}) {
  const bucket = usePublicBucket ? THUMBNAIL_BUCKET : ASSET_BUCKET;
  const thumbnailPath = await uploadThumbnailAsset({
    ownerId,
    shaderId,
    role: "thumbnail",
    blob,
    fileName: "thumbnail.webp",
    contentType: blob.type || "image/webp",
    public: usePublicBucket,
  });
  let thumbnailSmallPath = null;
  try {
    const smallBlob = await createThumbnailVariant(blob);
    thumbnailSmallPath = await uploadThumbnailAsset({
      ownerId,
      shaderId,
      role: "thumbnail-small",
      blob: smallBlob,
      fileName: "thumbnail-small.webp",
      contentType: smallBlob.type || "image/webp",
      public: usePublicBucket,
    });
  } catch {
    // The full thumbnail remains usable when local downscaling is unavailable.
  }
  return {
    thumbnail_path: thumbnailPath,
    thumbnail_small_path: thumbnailSmallPath,
    thumbnail_bucket: bucket,
  };
}

const fillAssetUrlCache = new Map();
const fillAssetBatchPromises = new Map();
const audioPrefetchPromises = new Map();
const draftMediaStore = createDraftMediaStore();

function initialEditorDocument() {
  const route = getAppRoute();
  const requestedPreset = route.id ? getPreset(route.id) : null;
  if (route.id && requestedPreset?.id === route.id) {
    const loaded = loadModule(requestedPreset.source);
    const stored = readEffectFills(requestedPreset.id);
    const fallbackFill =
      readEffectFill(requestedPreset.id) || fillFromInputSource("image");
    return {
      id: requestedPreset.id,
      name: requestedPreset.name,
      description:
        typeof requestedPreset.description === "string"
          ? requestedPreset.description
          : "",
      source: requestedPreset.source,
      kind: requestedPreset.kind,
      effectFill: stored[0] || fallbackFill,
      effectFills: stored.length
        ? stored
        : normalizeComposition({ fill: fallbackFill }).fills,
      props: loaded.props,
      values: buildDefaults(loaded.props),
      loading: false,
    };
  }
  return {
    id: route.id ? `loading:${route.id}` : "idle",
    name: "",
    description: "",
    source: "",
    kind: route.kind === COMPOSITION_KIND ? COMPOSITION_KIND : "effect",
    effectFill: null,
    effectFills: [],
    props: {},
    values: {},
    loading: Boolean(route.id),
  };
}

function promotePendingAgentCheckpoint(
  pendingRef,
  setPending,
  { presetId, source, values }
) {
  const checkpoint = resolveAgentCheckpointAfterCompile(pendingRef.current, {
    presetId,
    source,
    values,
  });
  if (!checkpoint) return;
  pendingRef.current = null;
  setPending(checkpoint);
}

const INITIAL_DRAFTS = savedDrafts();

async function migrateLocalPlanToCloud(localKey, ownerId, shaderId) {
  const markdown = loadLocalPlan(localKey);
  if (!isPlanDocument(markdown)) return;
  const cloudKey = `cloud:${shaderId}`;
  try {
    await uploadShaderPlan({ ownerId, shaderId, markdown });
    removeLocalPlan(localKey);
    removeLocalPlan(cloudKey);
  } catch (error) {
    saveLocalPlan(cloudKey, markdown);
    if (cloudKey !== localKey) removeLocalPlan(localKey);
    console.warn("Failed to migrate plan.md to cloud storage", error);
  }
}

async function readPlanForCopy({
  threadKey,
  ownerId = null,
  shaderId = null,
}) {
  const local = loadLocalPlan(threadKey);
  if (isPlanDocument(local)) return local;
  if (!ownerId || !shaderId) return "";
  try {
    const cloud = await downloadShaderPlan(ownerId, shaderId);
    return isPlanDocument(cloud) ? cloud : "";
  } catch {
    return "";
  }
}

async function copyPlanToCloud(threadKey, markdown, ownerId, shaderId) {
  if (!isPlanDocument(markdown)) return;
  try {
    await uploadShaderPlan({ ownerId, shaderId, markdown });
    removeLocalPlan(threadKey);
  } catch {
    saveLocalPlan(threadKey, markdown);
  }
}

const FIGMA_SHADER_CATEGORIES = [
  { kind: "effect", label: "Shader effect" },
  { kind: "fill", label: "Shader fill" },
];
const EFFECT_PREVIEW_LAYER_ID = "effect-preview";

function afterPointerRelease(callback) {
  let finished = false;
  let frame = 0;
  let fallbackTimer = 0;

  const cleanupListeners = () => {
    window.clearTimeout(fallbackTimer);
    window.removeEventListener("pointerup", open, true);
    window.removeEventListener("pointercancel", cancel, true);
  };
  const open = () => {
    if (finished) return;
    finished = true;
    cleanupListeners();
    frame = requestAnimationFrame(callback);
  };
  const cancel = () => {
    if (finished) return;
    finished = true;
    cleanupListeners();
  };

  window.addEventListener("pointerup", open, { once: true, capture: true });
  window.addEventListener("pointercancel", cancel, {
    once: true,
    capture: true,
  });
  fallbackTimer = window.setTimeout(open, 180);

  return () => {
    finished = true;
    cleanupListeners();
    cancelAnimationFrame(frame);
  };
}

function effectFillPreviewKey(fills) {
  const normalized = normalizeComposition(
    Array.isArray(fills) ? { fills } : { fill: fills }
  );
  return normalized.fills
    .map((fill) =>
      fill.type === "shader" && fill.shaderId
        ? `${fill.id}:${fill.shaderId}:${fill.enabled !== false}`
        : `${fill.id}:${fill.type}:${fill.enabled !== false}`
    )
    .join("|");
}

function usesCompositionHost(sessionKind, fills) {
  if (sessionKind === COMPOSITION_KIND) return true;
  // Only effect sessions layer their fills through the composition host. A
  // standalone shader fill is the whole output, so it runs as a plain module.
  return sessionKind === "effect" && Boolean(effectFillPreviewKey(fills));
}

function serializeVideoExportComposition({
  kind,
  composition,
  effectFills,
  presetId,
  source,
  values,
  resolvedByKey,
}) {
  if (kind === COMPOSITION_KIND) {
    return serializeCompositionExport(composition, resolvedByKey, null);
  }
  if (!usesCompositionHost(kind, effectFills)) return null;
  return serializeCompositionExport(
    {
      fills: effectFills,
      effects: [
        {
          id: EFFECT_PREVIEW_LAYER_ID,
          shaderId: presetId,
          values,
          enabled: true,
        },
      ],
    },
    resolvedByKey,
    new Map([[presetId, { source, broken: false, kind: "effect" }]]),
  );
}

function fillMediaUrl(fill) {
  return fill?.paint?.image?.url || fill?.paint?.video?.url || "";
}

function fillMediaEntries(fills = []) {
  return fills
    .map((fill) => ({ fill, url: fillMediaUrl(fill) }))
    .filter(
      ({ url }) =>
        typeof url === "string" &&
        (url.startsWith("blob:") || url.startsWith("data:"))
    );
}

function assertLocalFillMediaAvailable(fills, message) {
  if ((fills || []).some((fill) => unresolvedLocalDraftMediaKey(fill))) {
    throw new Error(message);
  }
}

function fillMediaSlot(fill) {
  if (fill?.paint?.type === "video") return "video";
  if (fill?.paint?.type === "image") return "image";
  return null;
}

function annotateLiveDraftFill(fill, draftId) {
  const slot = fillMediaSlot(fill);
  if (!slot) return fill;
  const annotated = annotatePersistedFillMedia(fill, {
    draftId,
    roleId: fill.id || "fill",
  });
  return {
    ...annotated,
    paint: {
      ...annotated.paint,
      [slot]: {
        ...(fill.paint?.[slot] || {}),
        ...(annotated.paint?.[slot] || {}),
      },
    },
  };
}

function annotateLocalDraftMediaKeys(draftId, fills = []) {
  return fills.map((fill) => {
    const url = fillMediaUrl(fill);
    return typeof url === "string" &&
      (url.startsWith("blob:") || url.startsWith("data:"))
      ? annotateLiveDraftFill(fill, draftId)
      : fill;
  });
}

async function persistLocalDraftMedia(
  draftId,
  fills,
  pendingMedia = null,
  inputs = [],
) {
  const annotatedById = new Map();
  for (const fill of fills) {
    const slot = fillMediaSlot(fill);
    if (!slot) continue;
    const url = fillMediaUrl(fill);
    const media = fill.paint?.[slot] || {};
    const annotated = annotateLiveDraftFill(fill, draftId);
    let file = await fileFromBlobUrl(url);
    if (!file && media.assetPath) {
      try {
        const blob = await downloadAsset(media.assetPath);
        const fileName =
          String(media.assetPath).split("/").pop() ||
          (slot === "video" ? "input.mp4" : "input.png");
        file = new File([blob], fileName, {
          type: blob.type || "application/octet-stream",
        });
      } catch {
        file = null;
      }
    }
    const existingRecord = media.localAssetKey
      ? await draftMediaStore.get(draftId, fill.id || "fill")
      : null;
    if (file) {
      await draftMediaStore.put({
        draftId,
        roleId: fill.id || "fill",
        blob: file,
        fileName: file.name,
        lastModified: file.lastModified,
      });
    }
    if ((file || existingRecord) && !draftMediaStore.isDurable()) {
      throw new Error(
        "Local media storage is unavailable. Keep this tab open and try choosing the media again.",
      );
    }
    if (file || existingRecord) {
      annotatedById.set(fill.id, annotated);
    }
  }
  if (pendingMedia) {
    await draftMediaStore.put({
      draftId,
      roleId: "input",
      blob: pendingMedia,
      fileName: pendingMedia.name,
      lastModified: pendingMedia.lastModified,
    });
    if (!draftMediaStore.isDurable()) {
      throw new Error(
        "Local media storage is unavailable. Keep this tab open and try choosing the media again.",
      );
    }
  }
  if (inputs.length) {
    await persistDraftAudioInputs(draftId, inputs, draftMediaStore, {
      downloadAsset,
    });
    if (hasDraftAudioMedia(inputs) && !draftMediaStore.isDurable()) {
      throw new Error(
        "Local media storage is unavailable. Keep this tab open and try choosing the media again.",
      );
    }
  }
  return fills.map((fill) => annotatedById.get(fill.id) || fill);
}

async function hydrateLocalDraftMedia(draft) {
  const storedComposition =
    draft?.composition && typeof draft.composition === "object"
      ? draft.composition
      : {};
  if (draft?.kind === COMPOSITION_KIND) {
    const graph = normalizeComposition(storedComposition);
    return {
      ...draft,
      composition: normalizeComposition({
        ...graph,
        fills: await hydratePersistedFillMediaStack(
          graph.fills,
          draftMediaStore,
          { draftId: draft.id },
        ),
        inputs: await hydrateDraftAudioInputs(
          draft.id,
          graph.inputs,
          draftMediaStore,
        ),
      }),
      pendingMedia: null,
    };
  }
  const hydratedInputs = await hydrateDraftAudioInputs(
    draft.id,
    storedComposition.inputs,
    draftMediaStore,
  );
  if (draft?.kind === "effect") {
    const fills = readEffectFillsFromComposition(storedComposition);
    const hydratedFills = await hydratePersistedFillMediaStack(
      fills,
      draftMediaStore,
      { draftId: draft.id },
    );
    const inputRecord = await draftMediaStore.get(draft.id, "input");
    return {
      ...draft,
      composition: {
        effectFills: hydratedFills,
        effectFill: hydratedFills[0] || null,
        inputs: hydratedInputs,
      },
      effectFills: hydratedFills,
      effectFill: hydratedFills[0] || null,
      pendingMedia: draftMediaRecordToFile(inputRecord),
    };
  }
  return {
    ...draft,
    composition: {
      ...storedComposition,
      inputs: hydratedInputs,
    },
  };
}

async function removeLocalDraftMedia(draftId) {
  const records = await draftMediaStore.list(draftId);
  await Promise.all(
    records.map((record) => draftMediaStore.delete(draftId, record.roleId))
  );
}

function withFillAssetPath(fill, assetPath) {
  const paint = fill?.paint;
  if (!paint || !assetPath) return fill;
  if (paint.type === "video") {
    const { localAssetKey: _localAssetKey, ...video } = paint.video || {};
    return {
      ...fill,
      paint: {
        ...paint,
        video: { ...video, assetPath },
      },
    };
  }
  if (paint.type === "image") {
    const { localAssetKey: _localAssetKey, ...image } = paint.image || {};
    return {
      ...fill,
      paint: {
        ...paint,
        image: { ...image, assetPath },
      },
    };
  }
  return fill;
}

function fillMediaAssetPath(fill) {
  return (
    fill?.paint?.image?.assetPath || fill?.paint?.video?.assetPath || ""
  );
}

async function uploadFillAssetsForTarget({
  fills,
  ownerId,
  shaderId,
  copyDurableAssets = false,
}) {
  let durableFills = persistableEffectFills(fills);
  let firstInput = { path: null, name: null, mimeType: null };
  for (const fill of fills) {
    const slot = fillMediaSlot(fill);
    if (!slot) continue;
    const media = fill.paint?.[slot] || {};
    let file = await fileFromBlobUrl(media.url);
    if (!file && copyDurableAssets && media.assetPath) {
      const blob = await downloadAsset(media.assetPath);
      file = new File(
        [blob],
        String(media.assetPath).split("/").pop() ||
          (slot === "video" ? "input.mp4" : "input.png"),
        { type: blob.type || "application/octet-stream" }
      );
    }
    if (!file) continue;
    if (file.size > MAX_MEDIA_BYTES) {
      throw new Error("Input media must be 25 MB or smaller.");
    }
    const contentType = mediaType(file);
    const roleId = String(fill.id || "fill").replace(
      /[^a-zA-Z0-9_-]/g,
      "-"
    );
    const assetPath = await uploadAsset({
      ownerId,
      shaderId,
      role: `fill-${roleId}`,
      blob: file,
      fileName: file.name,
      contentType,
    });
    durableFills = durableFills.map((item) =>
      item.id === fill.id ? withFillAssetPath(item, assetPath) : item
    );
    if (!firstInput.path) {
      firstInput = {
        path: assetPath,
        name: file.name,
        mimeType: contentType,
      };
    }
  }
  return { durableFills, firstInput };
}

function liveSessionInputs(kind, composition, documentInputs) {
  return kind === COMPOSITION_KIND
    ? normalizeDocumentInputs(composition?.inputs)
    : normalizeDocumentInputs(documentInputs);
}

function compositionWithDocumentInputs(kind, composition, fills, inputs) {
  if (kind === COMPOSITION_KIND) {
    return normalizeComposition({ ...composition, fills, inputs });
  }
  if (kind === "effect") {
    return {
      effectFills: fills,
      effectFill: fills[0] || null,
      inputs,
    };
  }
  return { inputs };
}

function withFillAssetUrl(fill, urlsByPath) {
  const paint = fill?.paint;
  const assetPath = fillMediaAssetPath(fill);
  const url = assetPath ? urlsByPath?.[assetPath] : "";
  if (!paint || !url) return fill;
  if (paint.type === "video") {
    return {
      ...fill,
      paint: {
        ...paint,
        video: { ...(paint.video || {}), url },
      },
    };
  }
  if (paint.type === "image") {
    return {
      ...fill,
      paint: {
        ...paint,
        image: { ...(paint.image || {}), url },
      },
    };
  }
  return fill;
}

function prefetchAudioUrl(url) {
  if (!url || typeof Audio === "undefined") return Promise.resolve();
  const cached = audioPrefetchPromises.get(url);
  if (cached) return cached;
  const promise = new Promise((resolve) => {
    const audio = new Audio();
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      audio.removeEventListener("canplay", finish);
      audio.removeEventListener("error", finish);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      resolve();
    };
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.addEventListener("canplay", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    timer = window.setTimeout(finish, 5000);
    audio.src = url;
    audio.load();
  });
  audioPrefetchPromises.set(url, promise);
  return promise;
}

async function prefetchDocumentAudio(inputs) {
  const urls = normalizeDocumentInputs(inputs)
    .filter((input) => input.enabled && input.type === "audio")
    .map((input) => input.audio?.url)
    .filter(Boolean);
  await Promise.all(urls.map(prefetchAudioUrl));
}

async function hydrateCompositionMediaUrls(composition) {
  if (!composition || typeof composition !== "object") return composition;
  const groups = [
    composition.fills,
    composition.effectFills,
    composition.fill ? [composition.fill] : null,
    composition.effectFill ? [composition.effectFill] : null,
  ].filter(Array.isArray);
  const paths = [
    ...new Set(
      [
        ...groups.flat().map(fillMediaAssetPath),
        ...documentAudioAssetPaths(composition.inputs),
      ].filter(Boolean)
    ),
  ];
  if (!paths.length) {
    await prefetchDocumentAudio(composition.inputs);
    return composition;
  }
  const now = Date.now();
  const urlsByPath = {};
  const missingPaths = [];
  for (const path of paths) {
    const cached = fillAssetUrlCache.get(path);
    if (cached?.expiresAt > now && cached.url) {
      urlsByPath[path] = cached.url;
    } else {
      fillAssetUrlCache.delete(path);
      missingPaths.push(path);
    }
  }
  try {
    if (missingPaths.length) {
      const batchKey = [...missingPaths].sort().join("\n");
      let batchPromise = fillAssetBatchPromises.get(batchKey);
      if (!batchPromise) {
        recordPerf("navigation.fillAssetBatch");
        batchPromise = getAssetUrls(missingPaths).finally(() => {
          fillAssetBatchPromises.delete(batchKey);
        });
        fillAssetBatchPromises.set(batchKey, batchPromise);
      }
      const resolved = await batchPromise;
      for (const path of missingPaths) {
        const url = resolved?.[path];
        if (!url) continue;
        urlsByPath[path] = url;
        fillAssetUrlCache.set(path, {
          url,
          expiresAt: now + FILL_ASSET_URL_CACHE_MS,
        });
      }
    }
  } catch {
    if (!Object.keys(urlsByPath).length) {
      await prefetchDocumentAudio(composition.inputs);
      return composition;
    }
  }
  const hydrate = (fill) => withFillAssetUrl(fill, urlsByPath);
  const hydrated = {
    ...composition,
    ...(Array.isArray(composition.fills)
      ? { fills: composition.fills.map(hydrate) }
      : {}),
    ...(Array.isArray(composition.effectFills)
      ? { effectFills: composition.effectFills.map(hydrate) }
      : {}),
    ...(composition.fill ? { fill: hydrate(composition.fill) } : {}),
    ...(composition.effectFill
      ? { effectFill: hydrate(composition.effectFill) }
      : {}),
    ...(Array.isArray(composition.inputs)
      ? { inputs: hydrateAudioInputsWithUrls(composition.inputs, urlsByPath) }
      : {}),
  };
  await prefetchDocumentAudio(hydrated.inputs);
  return hydrated;
}

function createHiddenVideoElement() {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("muted", "");
  Object.assign(video.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(video);
  return video;
}

function hasLiveWebcamStream(video) {
  return isLiveMediaStream(video?.srcObject);
}

function isLiveMediaStream(stream) {
  return Boolean(
    stream &&
      typeof stream.getVideoTracks === "function" &&
      stream.getVideoTracks().some((track) => track.readyState === "live")
  );
}

function webcamDeviceId(stream) {
  return stream?.getVideoTracks?.()[0]?.getSettings?.().deviceId || "";
}

function readFillWebcamStream() {
  for (const node of document.querySelectorAll(
    "fig-fill-picker, fig-input-fill"
  )) {
    if (isLiveMediaStream(node.webcamStream)) return node.webcamStream;
  }
  return null;
}

async function waitForVideoFrame(video, errorMessage) {
  await new Promise((resolve, reject) => {
    video.addEventListener("loadeddata", resolve, { once: true });
    video.addEventListener(
      "error",
      () => reject(new Error(errorMessage)),
      { once: true }
    );
  });
  await video.play();
  if (typeof video.requestVideoFrameCallback === "function") {
    await new Promise((resolve) => {
      video.requestVideoFrameCallback(() => resolve());
    });
    return;
  }
  if (video.videoWidth) return;
  await new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (video.videoWidth > 0 || performance.now() - start > 2000) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function groupByKind(
  cards,
  effectLabel,
  fillLabel,
  compositionLabel,
  keyPrefix,
  { includeEmptyKinds = [] } = {},
) {
  const groups = [
    [COMPOSITION_KIND, compositionLabel],
    ["effect", effectLabel],
    ["fill", fillLabel],
  ];
  return groups.flatMap(([kind, label]) => {
    const matches = cards.filter((card) => card.kind === kind);
    if (!matches.length && !includeEmptyKinds.includes(kind)) return [];
    return [
      {
        key: `separator:${keyPrefix}:${kind}`,
        separatorLabel: label,
        separatorKind: kind,
      },
      ...matches,
    ];
  });
}

function groupLibraryCards(cards, options) {
  return groupByKind(
    cards,
    "Shader effects",
    "Shader fills",
    "Compositions",
    "studio",
    options,
  );
}

function compositionWithLayerValues(graph, layerId, values) {
  const normalized = normalizeComposition(graph);
  if (normalized.fills.some((fill) => fill.id === layerId)) {
    return normalizeComposition({
      ...normalized,
      fills: normalized.fills.map((fill) =>
        fill.id === layerId ? { ...fill, values: values || {} } : fill
      ),
    });
  }
  return {
    ...normalized,
    effects: normalized.effects.map((effect) =>
      effect.id === layerId ? { ...effect, values: values || {} } : effect
    ),
  };
}

function mergeValues(definitions, candidate = {}) {
  const defaults = buildDefaults(definitions);
  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(candidate, key)) {
      defaults[key] = candidate[key];
    }
  }
  return defaults;
}

function editorPersistenceFingerprint(document, { name, description } = {}) {
  return JSON.stringify({
    document: shaderDocumentFingerprint(document),
    name: String(name || ""),
    description: String(description || ""),
  });
}

function compositionCloudIds(graph) {
  const ids = referencedShaderKeys(graph).map((key) => {
    const parsed = parseCompositionShaderId(key);
    if (!parsed) return null;
    if (parsed.origin === "cloud") return parsed.id;
    return parsed.id.startsWith("draft:")
      ? parsed.id.slice("draft:".length)
      : null;
  });
  return ids.includes(null) ? null : [...new Set(ids)];
}

function publicItemsReferencing(shaderId, rows = []) {
  if (!shaderId) return [];
  return rows.filter((row) => {
    if (!row?.is_public || row.id === shaderId) return false;
    const graph =
      row.kind === COMPOSITION_KIND
        ? row.composition
        : normalizeComposition({
            fills: readEffectFillsFromComposition(row.composition),
          });
    return compositionCloudIds(graph)?.includes(shaderId);
  });
}

function replaceShaderUrl(id, kind, embed = false, view = false) {
  let url = id
    ? embed
      ? makeEmbedUrl(id, kind)
      : view
        ? makeViewUrl(id, kind)
        : makeShareUrl(id, kind)
    : makeHomeUrl();
  const presentId = embed ? readPresentSessionId() : null;
  if (presentId) url = makePresentUrl(url, presentId);
  window.history.replaceState({}, "", url);
}

function pushShaderUrl(id, kind) {
  window.history.pushState({}, "", makeShareUrl(id, kind));
}

function AuthorAvatar({ class: className, tooltip, src, name, onClick, isYou }) {
  return (
    <UserAvatar
      class={className}
      tooltip={tooltip ?? name ?? "Anon"}
      src={src}
      name={name}
      onClick={onClick}
      isYou={isYou}
    />
  );
}

function consumeAuthCallbackError() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const description =
    url.searchParams.get("error_description") ||
    hash.get("error_description");
  if (!description) return null;

  for (const key of ["error", "error_code", "error_description", "sb"]) {
    url.searchParams.delete(key);
  }
  if (hash.has("error") || hash.has("error_description")) url.hash = "";
  window.history.replaceState({}, "", url);

  if (description.includes("Multiple accounts with the same email address")) {
    return "We found multiple accounts for this email. Contact support to merge them, then try again.";
  }
  return `Sign in failed: ${description}`;
}

export default function App() {
  const {
    user,
    loading: authLoading,
    configured: authConfigured,
  } = useAuth();
  const userId = user?.id ?? null;
  const [initialDocument] = useState(initialEditorDocument);
  const [presetId, setPresetId] = useState(initialDocument.id);
  const [shaderName, setShaderName] = useState(initialDocument.name);
  const [shaderDescription, setShaderDescription] = useState(
    initialDocument.description,
  );
  const [source, setSource] = useState(initialDocument.source);
  const [sessionKind, setSessionKind] = useState(initialDocument.kind);
  const [composition, setComposition] = useState(null);
  const [effectFill, setEffectFill] = useState(initialDocument.effectFill);
  const [effectFills, setEffectFills] = useState(initialDocument.effectFills);
  const [documentInputs, setDocumentInputs] = useState([]);
  const [supportsAudio, setSupportsAudio] = useState(false);
  const [experimentalAudio, setExperimentalAudio] = useState(
    savedExperimentalAudio,
  );
  const [inputImageUrl, setInputImageUrl] = useState(defaultInputUrl);
  const [selectedLayerId, setSelectedLayerId] = useState(COMPOSITION_FILL_ID);
  const [compositionPropsLayerId, setCompositionPropsLayerId] = useState(null);
  const [layerControlsEpoch, setLayerControlsEpoch] = useState(0);
  const [resolvedShaders, setResolvedShaders] = useState({});
  const [props, setProps] = useState(initialDocument.props);
  const [values, setValues] = useState(initialDocument.values);
  const [error, setError] = useState(null);
  const compileErrorRef = useRef(null);
  const [fatal, setFatal] = useState(null);
  const [notice, setNotice] = useState(null);
  const showNotice = useCallback((message, options = {}) => {
    setNotice({
      message,
      error: options.error === true,
      danger: options.danger === true,
      brand: options.brand === true,
    });
  }, []);
  const reportAppError = useCallback((value) => {
    const message =
      typeof value === "string" ? value : value?.message || String(value || "");
    if (message) showNotice(message, { error: true });
  }, [showNotice]);
  const onPersistenceError = useCallback(
    (persistenceError) =>
      showNotice(persistenceError.message || String(persistenceError), {
        error: true,
      }),
    [showNotice],
  );
  const [running, setRunning] = useState(savedPlayState);
  const {
    runtimeReady,
    setRuntimeReady,
    previewZoom,
    previewZoomRequest,
    requestPreviewZoom,
    inputSource,
    setInputSource,
    effectVisible,
    setEffectVisible,
    uploading,
    setUploading,
    hostRef,
    pointerSurfaceRef,
    inputSourceRef,
    inputApplyGenRef,
    pendingInputSourceRef,
    mediaUrlRef,
    videoRef,
    onStageSize,
    onPointerSurface,
    onPreviewZoomChange,
    isInputApplyCurrent,
    clearObjectUrl,
  } = useShaderRuntime();
  const [fillsLoading, setFillsLoading] = useState(false);
  const inputBusy = uploading || fillsLoading;
  const [sessionResourcesLoading, setSessionResourcesLoading] = useState(
    initialDocument.loading,
  );
  const [versionPreviewLoading, setVersionPreviewLoading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [cloudShaders, setCloudShadersState] = useState([]);
  const libraryMutationEpochRef = useRef(0);
  const setCloudShaders = useCallback((update) => {
    libraryMutationEpochRef.current += 1;
    setCloudShadersState(update);
  }, []);
  const [drafts, setDrafts] = useState(INITIAL_DRAFTS);
  const [cloudThumbnails, setCloudThumbnails] = useState({});
  const [cloudSmallThumbnails, setCloudSmallThumbnails] = useState({});
  const [pendingMedia, setPendingMedia] = useState(null);
  const [autosaveRetryRevision, setAutosaveRetryRevision] = useState(0);
  const [migrationRetryRevision, setMigrationRetryRevision] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTab, setExportTab] = useState("image");
  const [videoExportSettings, setVideoExportSettings] = useState({
    format: "mp4",
    imageFormat: "image/webp",
    imageQuality: 100,
    embedFormat: "code",
    resolution: "current",
    aspect: "16:9",
    duration: 5,
    frameRate: 30,
    bitrate: 8,
    includeAudio: true,
  });
  const [videoExportProgress, setVideoExportProgress] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const {
    currentShader,
    setCurrentShader,
    dirty,
    setDirty,
    saving,
    setSaving,
    shaderVersions,
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
  } = useShaderPersistence({
    userId: user?.id ?? null,
    onError: onPersistenceError,
  });
  const editorViewRef = useRef(null);
  const {
    appNavWidth,
    codeWidth,
    chatHeight,
    previewHeight,
    stacked,
    saveAppNavWidth,
    saveCodeWidth,
    saveChatHeight,
    savePreviewHeight,
  } = usePanelLayout(editorViewRef);
  const [theme, setTheme] = useState(savedTheme);
  const [canvasTheme, setCanvasTheme] = useState(savedCanvasTheme);
  const [showCanvasHandles, setShowCanvasHandles] = useState(
    savedCanvasControlsVisible,
  );
  const [routeId, setRouteId] = useState(() => getShaderRouteId());
  const [routeKind, setRouteKind] = useState(() => getAppRoute().kind);
  const [routeProfile, setRouteProfile] = useState(
    () => getAppRoute().profile || null,
  );
  const [presentSessionId] = useState(() => readPresentSessionId());
  const [editorRouteError, setEditorRouteError] = useState(null);
  const routeEmbedRef = useRef(Boolean(getAppRoute().embed));
  const [routeEmbed, setRouteEmbed] = useState(routeEmbedRef.current);
  const routeViewRef = useRef(Boolean(getAppRoute().view));
  const [routeView, setRouteView] = useState(routeViewRef.current);
  const [embedStatus, setEmbedStatus] = useState(() =>
    routeEmbedRef.current || routeViewRef.current ? "loading" : "idle"
  );
  const presentWindowRef = useRef(null);
  const presentChannelRef = useRef(null);
  const presentReadyRef = useRef(false);
  const presentWindowOpenRef = useRef(false);
  const presentWindowPollRef = useRef(0);
  const presentRestoreFrameRef = useRef(0);
  const presentSendTimerRef = useRef(0);
  const presentStateRef = useRef(null);
  const presentPlaybackRef = useRef(null);
  const presentApplyGenerationRef = useRef(0);
  const [presentWindowOpen, setPresentWindowOpen] = useState(false);
  const [homeQuery, setHomeQuery] = useState("");
  const [editorQuery, setEditorQuery] = useState("");
  const [homeKind, setHomeKind] = useState("all");
  const [homeAuthor, setHomeAuthor] = useState("all");
  const [editorKind, setEditorKind] = useState(
    () => savedEditorFilters().kind,
  );
  const [editorOrigin, setEditorOrigin] = useState(
    () => savedEditorFilters().origin,
  );
  const [editorAuthor, setEditorAuthor] = useState(
    () => savedEditorFilters().author,
  );
  const [libraryView, setLibraryView] = useState(savedLibraryView);
  const [figmaTokenConfigured, setFigmaTokenConfigured] = useState(
    () =>
      FIGMA_LIBRARY_UI_ENABLED ? Boolean(getFigmaAccessToken()) : false
  );
  const [figmaShaders, setFigmaShaders] = useState([]);
  const [figmaLibraryLoading, setFigmaLibraryLoading] = useState(false);
  const [figmaLibraryError, setFigmaLibraryError] = useState("");
  const [activeFigmaDetail, setActiveFigmaDetail] = useState(null);
  const [activeFigmaDetailLoading, setActiveFigmaDetailLoading] = useState(false);
  const [activeFigmaDetailError, setActiveFigmaDetailError] = useState("");
  const [figmaImportOpen, setFigmaImportOpen] = useState(false);
  const [figmaImportProgress, setFigmaImportProgress] = useState(null);
  const [figmaImportCheckedKeys, setFigmaImportCheckedKeys] = useState([]);
  const [figmaImportKind, setFigmaImportKind] = useState("all");
  const [figmaSyncing, setFigmaSyncing] = useState(false);
  const [figmaSyncToast, setFigmaSyncToast] = useState(null);
  const [figmaPlans, setFigmaPlans] = useState([]);
  const [figmaPlanKey, setFigmaPlanKey] = useState("");
  const [pendingFigmaCreate, setPendingFigmaCreate] = useState(null);
  const [codeCollapsed, setCodeCollapsed] = useState(
    () => savedSidebarSections().codeCollapsed
  );
  const [chatCollapsed, setChatCollapsed] = useState(
    () => savedSidebarSections().chatCollapsed
  );
  const [libraryNavMotion, setLibraryNavMotion] = useState(() =>
    savedAppNavCollapsed() ? "closed" : "open"
  );
  const appNavCollapsed =
    libraryNavMotion === "closed" || libraryNavMotion === "closing";
  const libraryNavMounted = libraryNavMotion !== "closed";
  const appNavRef = useRef(null);
  const [appNavShift, setAppNavShift] = useState(appNavWidth);
  const viewMode = routeEmbed && routeId
    ? "embed"
    : routeView && routeId
      ? "view"
      : routeProfile
        ? "profile"
        : routeId
          ? "editor"
          : "home";
  const [activeNavItem, setActiveNavItem] = useState(() =>
    viewMode === "editor" ? "editor" : "home",
  );

  useEffect(() => {
    if (viewMode === "editor") {
      setActiveNavItem("editor");
    } else if (viewMode === "profile") {
      setActiveNavItem("home");
    } else if (viewMode === "home") {
      setActiveNavItem("home");
    }
  }, [viewMode]);

  const setShaderRoute = useCallback((id, kind, options = {}) => {
    const nextEmbed = Boolean(
      id && (options.embed ?? routeEmbedRef.current)
    );
    const nextView = Boolean(
      id && !nextEmbed && (options.view ?? routeViewRef.current)
    );
    routeEmbedRef.current = nextEmbed;
    routeViewRef.current = nextView;
    replaceShaderUrl(id, kind, nextEmbed, nextView);
    setRouteId(id || null);
    setRouteProfile(null);
    setRouteKind(kind === COMPOSITION_KIND ? COMPOSITION_KIND : null);
    setRouteEmbed(nextEmbed);
    setRouteView(nextView);
    if (!nextEmbed) setEmbedStatus("idle");
  }, []);
  const [thumbnails, setThumbnails] = useState(() => {
    const initial = {};
    for (const draft of INITIAL_DRAFTS) {
      if (draft.thumbnail?.startsWith("data:")) {
        const url = dataUrlToObjectUrl(draft.thumbnail);
        if (url) initial[draft.id] = url;
      }
    }
    return initial;
  });
  // data: mirrors of capture blobs for localStorage / upload (blob: is display-only).
  const thumbnailDataUrlsRef = useRef(null);
  if (thumbnailDataUrlsRef.current === null) {
    const initial = {};
    for (const draft of INITIAL_DRAFTS) {
      if (draft.thumbnail?.startsWith("data:")) {
        initial[draft.id] = draft.thumbnail;
      }
    }
    thumbnailDataUrlsRef.current = initial;
  }
  const thumbnailCaptureGenRef = useRef(0);
  const thumbnailPreviewTimerRef = useRef(0);
  const [thumbnailRefreshRevision, setThumbnailRefreshRevision] = useState(0);

  const canvasRef = useRef(null);
  const htmlInputRef = useRef(null);
  const viewerRef = useRef(null);
  const sidebarRef = useRef(null);
  const chatPaneRef = useRef(null);
  const [canClearChat, setCanClearChat] = useState(false);
  const nameInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const moreMenuAnchorRef = useRef(null);
  const shaderContextMenuRef = useRef(null);
  const [shaderContextRequest, setShaderContextRequest] = useState(null);
  const publishAnchorRef = useRef(null);
  const publishDialogRef = useRef(null);
  const publishToastRef = useRef(null);
  const figmaSyncToastRef = useRef(null);
  const noticeToastRef = useRef(null);
  const exportDialogRef = useRef(null);
  const exportTabsRef = useRef(null);
  const videoExportToastRef = useRef(null);
  const videoExportedToastRef = useRef(null);
  const imageFormatRef = useRef(null);
  const imageResolutionRef = useRef(null);
  const imageAspectRef = useRef(null);
  const videoFormatRef = useRef(null);
  const videoResolutionRef = useRef(null);
  const videoAspectRef = useRef(null);
  const videoFrameRateRef = useRef(null);
  const videoBitrateRef = useRef(null);
  const embedFormatRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const editorCardsRef = useRef([]);
  const chooseItemRef = useRef(() => {});
  const saveBeforeSessionChangeRef = useRef(null);
  const figmaImportDialogRef = useRef(null);
  const figmaPlanDialogRef = useRef(null);
  const figmaImportChooserRef = useRef(null);
  const figmaImportKindRef = useRef(null);
  const propertiesPanelRef = useRef(null);
  const propertiesPanelContentFadeRef = useOverflowFade();
  const visualizerRef = useRef(null);
  const lastSuccessfulCompileRef = useRef({
    presetId: initialDocument.id,
    source: initialDocument.source,
    values: initialDocument.values,
  });
  const agentCheckpointRetryTimerRef = useRef(0);
  const initedRef = useRef(false);
  const sourceRef = useRef(source);
  const compositionRef = useRef(composition);
  const effectFillRef = useRef(effectFill);
  const effectFillsRef = useRef(effectFills);
  const documentInputsRef = useRef(documentInputs);
  const supportsAudioRef = useRef(supportsAudio);
  const experimentalAudioRef = useRef(experimentalAudio);
  const audioBusRef = useRef(null);
  const ownedAudioElementRef = useRef(null);
  const audioSourceKeyRef = useRef("");
  const audioInputsSnapshotRef = useRef([]);
  const audioInputsPresetRef = useRef(null);
  const dedicatedMicStreamRef = useRef(null);
  const effectFillByPresetRef = useRef(new Map());
  const sessionInputAppliedRef = useRef("");
  const inputImageUrlRef = useRef(defaultInputUrl);
  const sessionKindRef = useRef(sessionKind);
  const selectedLayerIdRef = useRef(selectedLayerId);
  selectedLayerIdRef.current = selectedLayerId;
  const propsRef = useRef(props);
  const valuesRef = useRef(values);
  const playPreferenceRef = useRef(running);
  const compileGenerationRef = useRef(0);
  const compileCompositionRef = useRef(null);
  const compileRef = useRef(null);
  const navigationStartedAtRef = useRef(0);
  const sessionRequestRef = useRef(0);
  const loadingSessionIdRef = useRef(
    initialDocument.loading ? initialDocument.id : null,
  );
  const loadingRevealFrameRef = useRef(0);
  const versionPreviewCacheRef = useRef(new Map());
  const versionPreviewStateRef = useRef(null);
  const versionPreviewAppliedRef = useRef(false);
  const versionPreviewSnapshotRef = useRef(null);
  const versionPreviewRequestRef = useRef(0);
  const versionPreviewMediaCleanupRef = useRef(null);
  const clearShaderVersionPreviewRef = useRef(() => {});
  const activeDependencySnapshotsRef = useRef({});
  const dependencySnapshotShaderIdRef = useRef(null);
  const draftMediaPersistenceRef = useRef(null);
  const draftMediaPersistenceErrorRef = useRef(null);
  const committedStateRevisionsRef = useRef(new Map());
  const pendingValuesRef = useRef(null);
  const compileTimer = useRef(0);
  const lastCompiledPresetRef = useRef(presetId);
  const liveShaderSourceRef = useRef(new Map());
  const draftsRef = useRef(drafts);
  const cloudShadersRef = useRef(cloudShaders);
  const cloudThumbnailsRef = useRef(cloudThumbnails);
  const cloudSmallThumbnailsRef = useRef(cloudSmallThumbnails);
  const resolvedShadersRef = useRef(resolvedShaders);
  draftsRef.current = drafts;
  cloudShadersRef.current = cloudShaders;
  cloudThumbnailsRef.current = cloudThumbnails;
  cloudSmallThumbnailsRef.current = cloudSmallThumbnails;
  resolvedShadersRef.current = resolvedShaders;
  const beginSessionResourceLoad = useCallback((sessionId) => {
    cancelAnimationFrame(loadingRevealFrameRef.current);
    loadingRevealFrameRef.current = 0;
    loadingSessionIdRef.current = sessionId || null;
    setSessionResourcesLoading(true);
  }, []);
  const finishSessionResourceLoad = useCallback((sessionId) => {
    if (
      sessionId &&
      loadingSessionIdRef.current &&
      sessionId !== loadingSessionIdRef.current
    ) {
      return;
    }
    const activeId = loadingSessionIdRef.current;
    cancelAnimationFrame(loadingRevealFrameRef.current);
    loadingRevealFrameRef.current = requestAnimationFrame(() => {
      if (loadingSessionIdRef.current !== activeId) return;
      loadingSessionIdRef.current = null;
      loadingRevealFrameRef.current = 0;
      setSessionResourcesLoading(false);
    });
  }, []);
  useEffect(
    () => () => cancelAnimationFrame(loadingRevealFrameRef.current),
    [],
  );
  const [liveShaderRevision, setLiveShaderRevision] = useState(0);
  const previewParamsRafRef = useRef(0);
  const paintFillRafRef = useRef(0);
  const applyPaintFillRef = useRef(null);
  const compositionMediaSourcesRef = useRef([]);
  const compositionWebcamStreamsRef = useRef(new Map());
  const sharedLoadedRef = useRef(false);
  const migratedUserRef = useRef(null);
  const migrationInFlightUserRef = useRef(null);
  const migrationRetryTimerRef = useRef(0);
  const migrationRetryAttemptRef = useRef(0);
  const cloudWriteBackoffUntilRef = useRef(0);
  const conflictBlockedShaderRef = useRef(null);
  const activeFigmaLink = figmaShaderLink(
    isDraftId(presetId)
      ? drafts.find((draft) => draft.id === presetId)
      : currentShader
  );
  const activeFigmaRecord = useMemo(() => {
    if (!activeFigmaLink.figma_shader_id) return null;
    const localFeatures = buildFigmaShaderPackage(source, shaderName).features;
    const remoteFeatures =
      activeFigmaDetail?.features ||
      (activeFigmaDetail?.mainTs
        ? inferFeatures(activeFigmaDetail.mainTs)
        : undefined);
    return {
      id: activeFigmaLink.figma_shader_id,
      type:
        activeFigmaDetail?.kind ||
        activeFigmaLink.figma_shader_kind ||
        sessionKind,
      owner: activeFigmaDetail?.owner,
      name: activeFigmaDetail?.name || shaderName || "Shader",
      version:
        activeFigmaDetail?.version ||
        activeFigmaLink.figma_shader_version ||
        "",
      isAnimated:
        typeof remoteFeatures?.isAnimated === "boolean"
          ? remoteFeatures.isAnimated
          : localFeatures.isAnimated,
      usesMouse:
        typeof remoteFeatures?.usesMouse === "boolean"
          ? remoteFeatures.usesMouse
          : localFeatures.usesMouse,
    };
  }, [
    activeFigmaDetail,
    activeFigmaLink.figma_shader_id,
    activeFigmaLink.figma_shader_kind,
    activeFigmaLink.figma_shader_version,
    sessionKind,
    shaderName,
    source,
  ]);
  useEffect(() => {
    const id = activeFigmaLink.figma_shader_id;
    if (!id) {
      setActiveFigmaDetail(null);
      setActiveFigmaDetailLoading(false);
      setActiveFigmaDetailError("");
      return undefined;
    }

    let cancelled = false;
    setActiveFigmaDetail(null);
    setActiveFigmaDetailLoading(true);
    setActiveFigmaDetailError("");
    getFigmaShader(id)
      .then((detail) => {
        if (!cancelled) setActiveFigmaDetail(detail);
      })
      .catch((detailError) => {
        if (cancelled) return;
        setActiveFigmaDetail(null);
        setActiveFigmaDetailError(
          detailError?.message || "Could not load Figma shader metadata."
        );
      })
      .finally(() => {
        if (!cancelled) setActiveFigmaDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeFigmaLink.figma_shader_id,
    activeFigmaLink.figma_shader_version,
  ]);
  const draftSessionRef = useRef({
    presetId,
    shaderName,
    shaderDescription,
    source,
    values,
    isPublic,
    pendingMedia,
    kind: sessionKind,
    composition,
    effectFills,
    dependencySnapshots: activeDependencySnapshotsRef.current,
    ...activeFigmaLink,
  });

  sourceRef.current = source;
  compositionRef.current = composition;
  effectFillRef.current = effectFill;
  effectFillsRef.current = effectFills;
  documentInputsRef.current = documentInputs;
  supportsAudioRef.current = supportsAudio;
  experimentalAudioRef.current = experimentalAudio;
  compileErrorRef.current = error;
  sessionKindRef.current = sessionKind;
  propsRef.current = props;
  valuesRef.current = values;
  draftSessionRef.current = {
    presetId,
    shaderName,
    shaderDescription,
    source,
    values,
    isPublic,
    pendingMedia,
    kind: sessionKind,
    composition,
    effectFills,
    dependencySnapshots: activeDependencySnapshotsRef.current,
    ...activeFigmaLink,
  };
  const kind = useMemo(
    () =>
      sessionKind === COMPOSITION_KIND
        ? COMPOSITION_KIND
        : detectKind(source),
    [sessionKind, source]
  );
  const propertiesPanelTitle =
    sessionKind === COMPOSITION_KIND
      ? "Composition"
      : sessionKind === "fill"
        ? "Shader fill"
        : "Shader effect";
  const isShaderFillPanel = sessionKind === "fill";
  const isComposerView = routeKind === COMPOSITION_KIND;
  useEffect(() => {
    if (presetId && kind !== COMPOSITION_KIND) {
      persistInputSource(presetId, inputSource);
    }
  }, [kind, presetId, inputSource]);
  useEffect(() => {
    const paint = effectFillRef.current?.paint;
    const paintUrl =
      (paint?.type === "image" && paint.image?.url) ||
      (paint?.type === "video" && paint.video?.url) ||
      "";
    const next = paintUrl || defaultInputUrl;
    inputImageUrlRef.current = next;
    setInputImageUrl(next);
  }, [presetId]);
  useEffect(() => {
    if (kind !== "effect") return;
    // Removing the last input fill is intentional. Do not let the legacy
    // single-fill alias recreate it from the stored input source.
    if (effectFillsRef.current.length === 0) return;
    if (inputSource === "html") {
      setEffectFill((current) =>
        current?.type === "html" ? current : fillFromInputSource("html")
      );
      return;
    }
    const paint = paintForInputSource(inputSource, {
      image: defaultInputUrl,
      vector: defaultVectorUrl,
      video: defaultVideoUrl,
    });
    if (!paint) return;
    setEffectFill((current) => {
      if (current?.type === "shader") return current;
      // Webcam is represented as the graph's video type, but its paint must
      // remain webcam-specific so the saved device can be reacquired.
      if (current?.paint?.type === "webcam") return current;
      const next = {
        ...fillFromInputSource(inputSource),
        shaderId: current?.shaderId ?? null,
        values: current?.values || {},
        enabled: current?.enabled !== false,
        paint,
      };
      const currentUrl =
        current?.paint?.image?.url || current?.paint?.video?.url;
      const nextUrl = paint.image?.url || paint.video?.url;
      if (
        current?.type === next.type &&
        current?.paint?.type === paint.type &&
        currentUrl === nextUrl
      ) {
        return current;
      }
      const customUrl =
        typeof currentUrl === "string" &&
        currentUrl &&
        currentUrl !== defaultInputUrl &&
        currentUrl !== defaultVectorUrl &&
        currentUrl !== defaultVideoUrl;
      if (customUrl && inputSource !== "vector" && current?.type === next.type) {
        return current;
      }
      return next;
    });
  }, [inputSource, kind]);
  useEffect(() => {
    if (sessionKind !== "effect" || !effectFill) return;
    setEffectFills((current) => {
      const normalized = normalizeComposition({ fills: current });
      const first = normalized.fills[0];
      if (
        first &&
        JSON.stringify({ ...first, id: undefined }) ===
          JSON.stringify({ ...effectFill, id: undefined })
      ) {
        return current;
      }
      return normalizeComposition({
        fills: [
          { ...effectFill, id: first?.id || effectFill.id || COMPOSITION_FILL_ID },
          ...normalized.fills.slice(1),
        ],
      }).fills;
    });
  }, [effectFill, sessionKind]);
  useEffect(() => {
    if (sessionKind !== "effect" || !presetId) return;
    rememberEffectFills(effectFillByPresetRef.current, presetId, effectFills);
  }, [effectFills, presetId, sessionKind]);
  useEffect(() => {
    if (sessionKind !== "effect") return;
    const graph = normalizeComposition({ fills: effectFills, effects: [] });
    const retainedPins = {};
    for (const key of referencedShaderKeys(graph)) {
      const pin = dependencySnapshotForKey(
        activeDependencySnapshotsRef.current,
        key
      );
      if (pin) retainedPins[key] = pin;
    }
    activeDependencySnapshotsRef.current = retainedPins;
  }, [effectFills, sessionKind]);
  const resolvedByKey = useMemo(
    () => new Map(Object.entries(resolvedShaders)),
    [resolvedShaders]
  );
  const pinAwareResolvedByKey = useMemo(
    () =>
      resolvedByKeyWithDependencySnapshots(
        new Map([
          ...resolvedByKey,
          ...liveShaderSourceRef.current,
        ]),
        activeDependencySnapshotsRef.current,
      ),
    [
      composition,
      currentShader?.dependency_snapshots,
      effectFills,
      liveShaderRevision,
      presetId,
      resolvedByKey,
    ],
  );
  const compositionPlayable = useMemo(
    () =>
      kind === COMPOSITION_KIND &&
      isCompositionPlayable(composition, pinAwareResolvedByKey),
    [composition, kind, pinAwareResolvedByKey]
  );
  const previewPlayable = useMemo(
    () =>
      isDocumentPlayable({
        kind: sessionKind,
        source,
        composition,
        effectFills,
        resolvedByKey: pinAwareResolvedByKey,
        features: { supportsAudio },
        inputs:
          sessionKind === COMPOSITION_KIND
            ? composition?.inputs
            : documentInputs,
      }),
    [
      composition,
      documentInputs,
      effectFills,
      pinAwareResolvedByKey,
      sessionKind,
      source,
      supportsAudio,
    ],
  );
  const shaderFeatures = useMemo(
    () =>
      mergeShaderFeatures(
        kind === COMPOSITION_KIND
          ? collectCompositionFeatures(composition, pinAwareResolvedByKey)
          : inferFeatures(source),
        { supportsAudio },
      ),
    [composition, kind, pinAwareResolvedByKey, source, supportsAudio]
  );
  const shaderFeaturesRef = useRef(shaderFeatures);
  shaderFeaturesRef.current = shaderFeatures;
  const figmaPushBlocked =
    Boolean(supportsAudio) ||
    Boolean(shaderFeatures.supportsAudio) ||
    hasAudioInput(
      sessionKind === COMPOSITION_KIND ? composition?.inputs : documentInputs,
    );
  useEffect(() => {
    if (currentShader) {
      rememberStateRevision(
        committedStateRevisionsRef.current,
        currentShader,
      );
      const sameDirtyShader =
        dirty &&
        dependencySnapshotShaderIdRef.current === currentShader.id;
      if (!sameDirtyShader) {
        activeDependencySnapshotsRef.current =
          currentShader.dependency_snapshots &&
          typeof currentShader.dependency_snapshots === "object"
            ? structuredClone(currentShader.dependency_snapshots)
            : {};
      }
      dependencySnapshotShaderIdRef.current = currentShader.id;
    } else if (!isDraftId(presetId)) {
      activeDependencySnapshotsRef.current = {};
      dependencySnapshotShaderIdRef.current = null;
    }
  }, [currentShader, dirty, presetId]);
  const captureDocumentSnapshot = useCallback(
    (overrides = {}) => {
      const nextSource =
        typeof overrides.source === "string"
          ? overrides.source
          : sourceRef.current;
      const nextKind =
        overrides.kind ||
        (sessionKindRef.current === COMPOSITION_KIND
          ? COMPOSITION_KIND
          : detectKind(nextSource));
      const nextValues =
        overrides.parameterValues || overrides.values || valuesRef.current;
      const nextEffectFills =
        overrides.effectFills || effectFillsRef.current || [];
      const baseComposition =
        overrides.composition !== undefined
          ? overrides.composition
          : compositionRef.current;
      const nextComposition =
        nextKind === COMPOSITION_KIND
          ? compositionWithLayerValues(
              baseComposition,
              overrides.selectedLayerId || selectedLayerIdRef.current,
              nextValues
            )
          : baseComposition;
      const dependencySnapshots =
        overrides.dependencySnapshots ??
        activeDependencySnapshotsRef.current;
      const nextInputs = normalizeDocumentInputs(
        overrides.inputs ||
          (nextKind === COMPOSITION_KIND
            ? nextComposition?.inputs
            : documentInputsRef.current),
      );
      const features = mergeShaderFeatures(
        overrides.features ||
          (nextKind === COMPOSITION_KIND
            ? collectCompositionFeatures(
                nextComposition,
                resolvedByKeyWithDependencySnapshots(
                  new Map([
                    ...Object.entries(resolvedShaders),
                    ...liveShaderSourceRef.current,
                  ]),
                  dependencySnapshots,
                ),
              )
            : inferFeatures(nextSource)),
        { supportsAudio: supportsAudioRef.current },
      );
      const input =
        overrides.input ||
        {
          path: currentShader?.input_path || null,
          name: currentShader?.input_name || null,
          mimeType: currentShader?.input_mime_type || null,
        };
      return buildShaderDocumentSnapshot({
        source: nextSource,
        kind: nextKind,
        parameterValues: nextValues,
        features,
        composition:
          nextKind === COMPOSITION_KIND
            ? { ...nextComposition, inputs: nextInputs }
            : nextKind === "effect"
              ? {
                  ...(nextComposition && typeof nextComposition === "object"
                    ? nextComposition
                    : {}),
                  effectFills: nextEffectFills,
                  effectFill: nextEffectFills[0] || null,
                  inputs: nextInputs,
                }
              : { inputs: nextInputs },
        effectFills: nextEffectFills,
        input,
        dependencySnapshots,
      });
    },
    [
      currentShader?.input_mime_type,
      currentShader?.input_name,
      currentShader?.input_path,
      resolvedShaders,
    ]
  );
  const chatShaderKey = currentShader?.id
    ? `cloud:${currentShader.id}`
    : `preset:${presetId}`;
  const protectedPreview = Boolean(currentShader && !isOwner);
  const hasUncheckpointedChanges =
    isOwner && hasUncheckpointedShaderState(currentShader);
  const effectiveCodeCollapsed = protectedPreview ? false : codeCollapsed;
  const currentAuthorIsYou = Boolean(isOwner || isDraftId(presetId));
  const currentAuthorName =
    currentShader?.author_name ||
    (currentAuthorIsYou
      ? user
        ? user.user_metadata?.user_name ||
          user.user_metadata?.preferred_username ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email ||
          "Anon"
        : ANON_YOU_LABEL
      : "Unknown author");
  const currentAuthorAvatarUrl =
    currentShader?.author_avatar_url ||
    (currentAuthorIsYou
      ? user?.user_metadata?.avatar_url || user?.user_metadata?.picture || ""
      : "");
  const showCurrentAuthor = Boolean(currentShader || isDraftId(presetId));

  useEffect(() => {
    if (protectedPreview && renaming) setRenaming(false);
  }, [protectedPreview, renaming]);

  useEffect(() => {
    if (routeEmbed) return;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [routeEmbed, theme]);

  useEffect(() => {
    if (routeEmbed) return;
    localStorage.setItem(CANVAS_THEME_STORAGE_KEY, canvasTheme);
  }, [canvasTheme, routeEmbed]);

  useEffect(() => {
    if (routeEmbed) return;
    localStorage.setItem(
      CANVAS_CONTROLS_STORAGE_KEY,
      String(showCanvasHandles),
    );
  }, [routeEmbed, showCanvasHandles]);

  useEffect(() => {
    if (routeEmbed) return;
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, libraryView);
  }, [libraryView, routeEmbed]);

  useEffect(() => {
    if (authLoading) return;
    setEditorAuthor((current) => {
      if (!userId) return "all";
      return current === "me" ? userId : current;
    });
  }, [authLoading, userId]);

  useEffect(() => {
    if (routeEmbed) return;
    localStorage.setItem(
      EDITOR_FILTERS_STORAGE_KEY,
      JSON.stringify({
        kind: editorKind,
        origin: editorOrigin,
        author: editorAuthor,
      }),
    );
  }, [editorAuthor, editorKind, editorOrigin, routeEmbed]);

  useEffect(() => {
    if (!FIGMA_LIBRARY_UI_ENABLED) {
      setFigmaTokenConfigured(false);
      return undefined;
    }
    const syncToken = () => {
      setFigmaTokenConfigured(Boolean(getFigmaAccessToken()));
    };
    syncToken();
    return subscribeFigmaAccessToken(syncToken);
  }, []);

  useEffect(() => {
    if (!FIGMA_LIBRARY_UI_ENABLED || !figmaImportOpen || !figmaTokenConfigured) {
      setFigmaShaders([]);
      setFigmaLibraryError("");
      setFigmaLibraryLoading(false);
      return;
    }

    let cancelled = false;
    setFigmaLibraryLoading(true);
    setFigmaLibraryError("");

    (async () => {
      try {
        const shaders = await listAllFigmaShaders();
        if (cancelled) return;
        setFigmaShaders(shaders);
      } catch (libraryError) {
        if (cancelled) return;
        setFigmaShaders([]);
        setFigmaLibraryError(libraryError.message || String(libraryError));
      } finally {
        if (!cancelled) setFigmaLibraryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [figmaImportOpen, figmaTokenConfigured]);

  useEffect(() => {
    const dialog = figmaImportDialogRef.current;
    if (!dialog) return;
    if (figmaImportOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
    if (!figmaImportOpen) {
      setFigmaImportCheckedKeys([]);
      setFigmaImportKind("all");
      setFigmaImportProgress(null);
    }
  }, [figmaImportOpen]);

  useEffect(() => {
    const dialog = figmaPlanDialogRef.current;
    if (!dialog) return;
    if (pendingFigmaCreate) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [pendingFigmaCreate]);

  useEffect(() => {
    const control = figmaImportKindRef.current;
    if (!control) return undefined;
    const onKind = (event) => {
      const value = String(event.detail ?? event.target.value ?? "all");
      if (
        value === "all" ||
        value === "effect" ||
        value === "fill" ||
        value === "imported"
      ) {
        setFigmaImportKind(value);
        setFigmaImportCheckedKeys([]);
      }
    };
    control.addEventListener("input", onKind);
    return () => control.removeEventListener("input", onKind);
  }, [figmaImportOpen, figmaLibraryLoading, figmaTokenConfigured]);

  useEffect(() => {
    if (routeEmbed) return;
    localStorage.setItem(
      SIDEBAR_SECTIONS_STORAGE_KEY,
      JSON.stringify({ codeCollapsed, chatCollapsed })
    );
  }, [chatCollapsed, codeCollapsed, routeEmbed]);

  useEffect(() => {
    if (routeEmbed) return;
    localStorage.setItem(
      APP_NAV_COLLAPSED_STORAGE_KEY,
      appNavCollapsed ? "true" : "false",
    );
  }, [appNavCollapsed, routeEmbed]);

  useEffect(() => {
    if (libraryNavMotion !== "open") return;
    const width = appNavRef.current?.getBoundingClientRect().width;
    if (width) setAppNavShift(Math.round(width));
  }, [appNavWidth, libraryNavMotion]);

  const prefersReducedLibraryMotion = () =>
    Boolean(
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    );

  const hideLibraryNav = useCallback(() => {
    const nav = appNavRef.current;
    const width = nav?.getBoundingClientRect().width;
    if (width) setAppNavShift(Math.round(width));
    if (prefersReducedLibraryMotion()) {
      setLibraryNavMotion("closed");
      return;
    }
    setLibraryNavMotion("closing");
  }, []);

  const showLibraryNav = useCallback(() => {
    if (prefersReducedLibraryMotion()) {
      setLibraryNavMotion("open");
      return;
    }
    setLibraryNavMotion("opening");
  }, []);

  useLayoutEffect(() => {
    if (libraryNavMotion !== "opening") return undefined;
    const nav = appNavRef.current;
    const width = nav?.getBoundingClientRect().width;
    if (width) setAppNavShift(Math.round(width));
    let innerFrame = 0;
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() =>
        setLibraryNavMotion("open")
      );
    });
    return () => {
      window.cancelAnimationFrame(outerFrame);
      window.cancelAnimationFrame(innerFrame);
    };
  }, [libraryNavMotion]);

  useEffect(() => {
    if (libraryNavMotion !== "closing") return undefined;
    const nav = appNavRef.current;
    if (!nav) {
      setLibraryNavMotion("closed");
      return undefined;
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setLibraryNavMotion("closed");
    };
    const onEnd = (event) => {
      if (event.target !== nav) return;
      if (event.propertyName && event.propertyName !== "--library-slide") {
        return;
      }
      finish();
    };
    nav.addEventListener("transitionend", onEnd);
    const timeout = window.setTimeout(finish, 280);
    return () => {
      nav.removeEventListener("transitionend", onEnd);
      window.clearTimeout(timeout);
    };
  }, [libraryNavMotion]);

  useEffect(() => {
    if (routeEmbed || user) return;
    const timer = window.setTimeout(() => {
      writeDrafts(drafts, thumbnailDataUrlsRef.current);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [drafts, routeEmbed, thumbnails, user]);

  useEffect(() => {
    if (routeEmbed || user || !isDraftId(presetId)) return;
    const draftId = presetId;
    const currentFills =
      sessionKind === COMPOSITION_KIND
        ? normalizeComposition(composition).fills
        : sessionKind === "effect"
          ? effectFills
          : [];
    const currentInputs = liveSessionInputs(
      sessionKind,
      composition,
      documentInputs,
    );
    if (
      !fillMediaEntries(currentFills).length &&
      !pendingMedia &&
      !hasDraftAudioMedia(currentInputs)
    ) {
      draftMediaPersistenceErrorRef.current = null;
      return;
    }
    const keyedFills = annotateLocalDraftMediaKeys(draftId, currentFills);
    const fillsChanged =
      JSON.stringify(keyedFills) !== JSON.stringify(currentFills);
    if (fillsChanged) {
      if (sessionKindRef.current === COMPOSITION_KIND) {
        const graph = normalizeComposition(compositionRef.current);
        const next = normalizeComposition({ ...graph, fills: keyedFills });
        compositionRef.current = next;
        setComposition(next);
      } else if (sessionKindRef.current === "effect") {
        effectFillsRef.current = keyedFills;
        effectFillRef.current = keyedFills[0] || null;
        setEffectFills(keyedFills);
        setEffectFill(keyedFills[0] || null);
      }
    }

    const storedDrafts = savedDrafts();
    const immediatelyDurableDrafts = storedDrafts.map((draft) => {
      if (draft.id !== draftId) return draft;
      if (sessionKindRef.current === COMPOSITION_KIND) {
        return {
          ...draft,
          composition: normalizeComposition({
            ...compositionRef.current,
            fills: keyedFills,
            inputs: currentInputs,
          }),
        };
      }
      if (sessionKindRef.current === "effect") {
        return {
          ...draft,
          composition: {
            effectFills: keyedFills,
            effectFill: keyedFills[0] || null,
            inputs: currentInputs,
          },
          effectFills: keyedFills,
          effectFill: keyedFills[0] || null,
        };
      }
      return {
        ...draft,
        composition: {
          ...(draft.composition && typeof draft.composition === "object"
            ? draft.composition
            : {}),
          inputs: currentInputs,
        },
      };
    });
    writeDrafts(immediatelyDurableDrafts, thumbnailDataUrlsRef.current);

    let cancelled = false;
    draftMediaPersistenceErrorRef.current = null;
    const persistence = persistLocalDraftMedia(
      draftId,
      keyedFills,
      pendingMedia,
      currentInputs,
    );
    draftMediaPersistenceRef.current = persistence;
    persistence
      .then((annotatedFills) => {
        if (
          cancelled ||
          draftSessionRef.current.presetId !== draftId ||
          JSON.stringify(annotatedFills) === JSON.stringify(keyedFills)
        ) {
          return;
        }
        if (sessionKindRef.current === COMPOSITION_KIND) {
          const graph = normalizeComposition(compositionRef.current);
          const next = normalizeComposition({
            ...graph,
            fills: graph.fills.map(
              (fill) =>
                annotatedFills.find((item) => item.id === fill.id) || fill
            ),
          });
          compositionRef.current = next;
          setComposition(next);
        } else if (sessionKindRef.current === "effect") {
          effectFillsRef.current = annotatedFills;
          effectFillRef.current = annotatedFills[0] || null;
          setEffectFills(annotatedFills);
          setEffectFill(annotatedFills[0] || null);
        }
      })
      .catch((mediaError) => {
        draftMediaPersistenceErrorRef.current = mediaError;
        const message =
          mediaError.message ||
          "Local media could not be saved for browser reload.";
        showNotice(message, { error: true });
      })
      .finally(() => {
        if (draftMediaPersistenceRef.current === persistence) {
          draftMediaPersistenceRef.current = null;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    composition,
    documentInputs,
    effectFills,
    pendingMedia,
    presetId,
    routeEmbed,
    sessionKind,
    showNotice,
    user,
  ]);

  useEffect(() => {
    if (routeEmbed || user) return;
    if (!isDraftId(presetId)) {
      localStorage.removeItem(ACTIVE_DRAFT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_DRAFT_STORAGE_KEY, presetId);
    const timer = window.setTimeout(() => {
      const documentSnapshot = captureDocumentSnapshot();
      setDrafts((current) => {
        const existing = current.find((draft) => draft.id === presetId);
        if (!existing) return current;
        if (
          existing.name === shaderName &&
          existing.description === shaderDescription &&
          existing.source === documentSnapshot.source &&
          existing.kind === documentSnapshot.kind &&
          existing.isPublic === isPublic &&
          JSON.stringify(existing.values || {}) ===
            JSON.stringify(documentSnapshot.parameterValues) &&
          JSON.stringify(existing.composition || null) ===
            JSON.stringify(documentSnapshot.composition) &&
          JSON.stringify(existing.effectFills || null) ===
            JSON.stringify(
              documentSnapshot.kind === "effect"
                ? documentSnapshot.composition.effectFills
                : []
            ) &&
          JSON.stringify(existing.dependencySnapshots || {}) ===
            JSON.stringify(documentSnapshot.dependencySnapshots) &&
          JSON.stringify(existing.features || {}) ===
            JSON.stringify(documentSnapshot.features || {})
        ) {
          return current;
        }
        return current.map((draft) =>
          draft.id === presetId
            ? {
                ...draft,
                name: shaderName,
                description: shaderDescription,
                source: documentSnapshot.source,
                kind: documentSnapshot.kind,
                values: documentSnapshot.parameterValues,
                composition: documentSnapshot.composition,
                effectFills:
                  documentSnapshot.kind === "effect"
                    ? documentSnapshot.composition.effectFills
                    : [],
                effectFill:
                  documentSnapshot.kind === "effect"
                    ? documentSnapshot.composition.effectFill
                    : null,
                dependencySnapshots: documentSnapshot.dependencySnapshots,
                features: documentSnapshot.features,
                isPublic,
                pendingMedia,
              }
            : draft
        );
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    captureDocumentSnapshot,
    composition,
    documentInputs,
    effectFill,
    effectFills,
    isPublic,
    pendingMedia,
    presetId,
    routeEmbed,
    sessionKind,
    shaderName,
    shaderDescription,
    source,
    user,
    values,
  ]);

  useEffect(() => {
    const flush = (event) => {
      if (routeEmbedRef.current) return;
      const session = draftSessionRef.current;
      if (!isDraftId(session.presetId)) return;
      const documentSnapshot = captureDocumentSnapshot();
      const current = savedDrafts();
      const next = current.some((draft) => draft.id === session.presetId)
        ? current.map((draft) =>
            draft.id === session.presetId
              ? {
                  ...draft,
                  name: session.shaderName,
                  description: session.shaderDescription,
                  source: documentSnapshot.source,
                  kind: documentSnapshot.kind,
                  values: documentSnapshot.parameterValues,
                  composition: documentSnapshot.composition,
                  effectFills:
                    documentSnapshot.kind === "effect"
                      ? documentSnapshot.composition.effectFills
                      : [],
                  dependencySnapshots: documentSnapshot.dependencySnapshots,
                  features: documentSnapshot.features,
                  isPublic: session.isPublic,
                  pendingMedia: null,
                }
              : draft
          )
        : [
            {
              id: session.presetId,
              name: session.shaderName,
              description: session.shaderDescription,
              kind: documentSnapshot.kind,
              source: documentSnapshot.source,
              values: documentSnapshot.parameterValues,
              composition: documentSnapshot.composition,
              effectFills:
                documentSnapshot.kind === "effect"
                  ? documentSnapshot.composition.effectFills
                  : [],
              dependencySnapshots: documentSnapshot.dependencySnapshots,
              features: documentSnapshot.features,
              isPublic: session.isPublic,
              pendingMedia: null,
              thumbnail: null,
              ...figmaShaderLink(session),
            },
            ...current,
          ];
      writeDrafts(next, thumbnailDataUrlsRef.current);
      localStorage.setItem(ACTIVE_DRAFT_STORAGE_KEY, session.presetId);
      if (
        draftMediaPersistenceRef.current ||
        draftMediaPersistenceErrorRef.current
      ) {
        event?.preventDefault?.();
        if (event) event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  useEffect(() => {
    const popup = publishDialogRef.current;
    if (!popup) return;
    if (publishOpen) {
      popup.anchor = publishAnchorRef.current || moreMenuAnchorRef.current;
      popup.open = true;
    } else {
      popup.open = false;
    }
  }, [publishOpen]);

  useEffect(() => {
    const dialog = exportDialogRef.current;
    if (!dialog) return;
    if (exportOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [exportOpen]);

  useEffect(() => {
    const tabs = exportTabsRef.current;
    const onInput = (event) => {
      const value = String(event.detail ?? event.target.value ?? "image");
      if (value === "image" || value === "video" || value === "embed") {
        setExportTab(value);
      }
    };
    tabs?.addEventListener("input", onInput);
    return () => tabs?.removeEventListener("input", onInput);
  }, [exportOpen]);

  useEffect(() => {
    const toast = videoExportToastRef.current;
    if (!toast) return;
    if (videoExportProgress) {
      toast.showToast?.();
    } else {
      toast.hideToast?.();
    }
  }, [videoExportProgress]);

  useEffect(() => {
    const imageFormatSelect = imageFormatRef.current;
    const formatSelect = videoFormatRef.current;
    const imageResolutionSelect = imageResolutionRef.current;
    const imageAspectSelect = imageAspectRef.current;
    const resolutionSelect = videoResolutionRef.current;
    const aspectSelect = videoAspectRef.current;
    const frameRateSelect = videoFrameRateRef.current;
    const bitrateSelect = videoBitrateRef.current;
    const embedFormatSelect = embedFormatRef.current;
    const readValue = (event) => {
      const detail = event.detail;
      return String(
        detail && typeof detail === "object" && "value" in detail
          ? detail.value
          : (detail ?? event.target.value)
      );
    };
    const onImageFormat = (event) => {
      setVideoExportSettings((settings) => ({
        ...settings,
        imageFormat: resolveImageExportFormat(readValue(event)),
      }));
    };
    const onFormat = (event) => {
      setVideoExportSettings((settings) => ({
        ...settings,
        format: resolveVideoExportFormat(readValue(event)),
      }));
    };
    const onResolution = (event) => {
      setVideoExportSettings((settings) => ({
        ...settings,
        resolution: resolveVideoExportResolution(readValue(event)),
      }));
    };
    const onAspect = (event) => {
      setVideoExportSettings((settings) => ({
        ...settings,
        aspect: resolveVideoExportAspect(readValue(event)),
      }));
    };
    const onFrameRate = (event) => {
      setVideoExportSettings((settings) => ({
        ...settings,
        frameRate: Number(readValue(event)),
      }));
    };
    const onBitrate = (event) => {
      setVideoExportSettings((settings) => ({
        ...settings,
        bitrate: Number(readValue(event)),
      }));
    };
    const onEmbedFormat = (event) => {
      setVideoExportSettings((settings) => ({
        ...settings,
        embedFormat: resolveEmbedFormat(readValue(event)),
      }));
    };
    imageFormatSelect?.addEventListener("change", onImageFormat);
    formatSelect?.addEventListener("change", onFormat);
    imageResolutionSelect?.addEventListener("change", onResolution);
    imageAspectSelect?.addEventListener("change", onAspect);
    resolutionSelect?.addEventListener("change", onResolution);
    aspectSelect?.addEventListener("change", onAspect);
    frameRateSelect?.addEventListener("change", onFrameRate);
    bitrateSelect?.addEventListener("change", onBitrate);
    embedFormatSelect?.addEventListener("input", onEmbedFormat);
    return () => {
      imageFormatSelect?.removeEventListener("change", onImageFormat);
      formatSelect?.removeEventListener("change", onFormat);
      imageResolutionSelect?.removeEventListener("change", onResolution);
      imageAspectSelect?.removeEventListener("change", onAspect);
      resolutionSelect?.removeEventListener("change", onResolution);
      aspectSelect?.removeEventListener("change", onAspect);
      frameRateSelect?.removeEventListener("change", onFrameRate);
      bitrateSelect?.removeEventListener("change", onBitrate);
      embedFormatSelect?.removeEventListener("input", onEmbedFormat);
    };
  }, [videoExportSettings.resolution]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (deleteTarget) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [deleteTarget]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      setDeleteTarget(null);
      setDeleting(false);
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  useEffect(() => {
    const toast = publishToastRef.current;
    if (!toast) return;
    if (!publishToast) {
      toast.hideToast?.();
      return;
    }
    toast.setAttribute(
      "duration",
      publishToast.phase === "publishing" ? "0" : "4500"
    );
    toast.showToast?.();
  }, [publishToast]);

  useEffect(() => {
    const toast = figmaSyncToastRef.current;
    if (!toast) return;
    if (!figmaSyncToast) {
      toast.hideToast?.();
      return;
    }
    toast.setAttribute(
      "duration",
      figmaSyncToast.phase === "syncing" ? "0" : "4500"
    );
    toast.showToast?.();
  }, [figmaSyncToast]);

  useEffect(() => {
    if (notice) noticeToastRef.current?.showToast?.();
  }, [notice]);

  useEffect(() => {
    const authError = consumeAuthCallbackError();
    if (authError) showNotice(authError, { error: true });
  }, [showNotice]);

  const setRuntimeValues = useCallback((next) => {
    valuesRef.current = next;
    setValues(next);
    if (usesCompositionHost(sessionKindRef.current, effectFillsRef.current)) {
      hostRef.current?.setCompositionLayerParams?.(
        selectedLayerIdRef.current,
        next
      );
      return;
    }
    hostRef.current?.setParams(next);
  }, []);

  const recordNavigationFirstFrame = useCallback(() => {
    const startedAt = navigationStartedAtRef.current;
    if (!startedAt) return;
    navigationStartedAtRef.current = 0;
    measurePerf("navigation.firstFrame", startedAt);
  }, []);

  const rememberResolved = useCallback((rows) => {
    if (!rows?.length) return;
    setResolvedShaders((current) => {
      let changed = false;
      const next = { ...current };
      for (const row of rows) {
        if (!row?.key) continue;
        const prev = current[row.key];
        if (
          prev &&
          prev.source === row.source &&
          prev.is_public === row.is_public &&
          prev.broken === row.broken &&
          prev.name === row.name
        ) {
          continue;
        }
        next[row.key] = row;
        changed = true;
      }
      return changed ? next : current;
    });
  }, []);

  const rememberLiveShaderSource = useCallback((entry) => {
    if (!entry?.source || entry.kind === COMPOSITION_KIND) return;
    const parsed = entry.key ? parseCompositionShaderId(entry.key) : null;
    const bare =
      (parsed?.origin === "cloud" && parsed.id) ||
      (typeof entry.id === "string" && entry.id.startsWith("draft:")
        ? entry.id.slice("draft:".length)
        : entry.id) ||
      (parsed?.id?.startsWith("draft:")
        ? parsed.id.slice("draft:".length)
        : parsed?.id) ||
      null;
    const keys = new Set(
      [entry.key, entry.id, bare, bare ? `cloud:${bare}` : null, bare ? `draft:${bare}` : null].filter(
        Boolean
      )
    );
    const previous = entry.key
      ? liveShaderSourceRef.current.get(entry.key)
      : null;
    for (const key of keys) liveShaderSourceRef.current.set(key, entry);
    if (
      previous?.source !== entry.source ||
      Boolean(previous?.features?.supportsAudio) !==
        Boolean(entry.features?.supportsAudio)
    ) {
      setLiveShaderRevision((revision) => revision + 1);
    }
  }, []);

  const hydrateCompositionRefs = useCallback(
    async (graph, { remoteOnly = routeEmbedRef.current } = {}) => {
      const keys = referencedShaderKeys(graph);
      const latest = {};
      const found = [];
      const cloudIds = [];
      const draftAliases = new Map();
      const store = (row, aliasKey) => {
        if (!row?.key) return;
        found.push(row);
        latest[row.key] = row;
        if (aliasKey && aliasKey !== row.key) {
          const aliased = { ...row, key: aliasKey };
          found.push(aliased);
          latest[aliasKey] = aliased;
        }
      };
      const rowFromLive = (key, live, id, isPublic, catalogName) => ({
        key,
        id: id || live.id || live.presetId || key,
        name: live.name || live.shaderName || catalogName,
        kind: live.kind || "effect",
        source: live.source,
        is_public: isPublic,
        features: mergeShaderFeatures(
          inferFeatures(live.source || ""),
          live.features,
        ),
        broken: live.kind === COMPOSITION_KIND || !live.source,
      });

      for (const key of keys) {
        const parsed = parseCompositionShaderId(key);
        if (!parsed) continue;
        const cloudId =
          parsed.origin === "cloud"
            ? parsed.id
            : parsed.id.startsWith("draft:")
              ? parsed.id.slice("draft:".length)
              : null;
        const cloudKey = cloudId ? `cloud:${cloudId}` : null;
        if (parsed.origin === "draft" && cloudKey) {
          draftAliases.set(cloudKey, key);
        }
        const live = remoteOnly
          ? null
          : readReferencedShader(key, {
              session: draftSessionRef.current,
              drafts,
              liveByKey: liveShaderSourceRef.current,
            });
        const liveCloud = cloudId
          ? cloudShaders.find((item) => item.id === cloudId)
          : null;
        if (live?.source) {
          store(
            rowFromLive(
              cloudKey || key,
              live,
              cloudId || live.id,
              liveCloud?.is_public ?? live.is_public ?? live.isPublic,
              liveCloud?.name
            ),
            key
          );
          continue;
        }
        if (cloudId) cloudIds.push(cloudId);
      }

      if (cloudIds.length) {
        try {
          const rows = await getShadersByIds(cloudIds);
          const byId = new Map(rows.map((row) => [row.id, row]));
          for (const id of cloudIds) {
            const key = `cloud:${id}`;
            const live = remoteOnly
              ? null
              : readReferencedShader(key, {
                  session: draftSessionRef.current,
                  drafts,
                  liveByKey: liveShaderSourceRef.current,
                });
            const row = byId.get(id);
            const source = live?.source || row?.source;
            const next =
              !row ||
              row.kind === COMPOSITION_KIND ||
              !source
                ? {
                    key,
                    id,
                    name: row?.name || live?.name || "Missing shader",
                    kind: row?.kind || live?.kind || "effect",
                    is_public: row?.is_public,
                    broken: true,
                  }
                : {
                    key,
                    id,
                    name: live?.name || live?.shaderName || row.name,
                    kind: row.kind,
                    source,
                    is_public: row.is_public,
                    features: mergeShaderFeatures(
                      inferFeatures(source),
                      live?.features || row.features,
                    ),
                    broken: false,
                  };
            store(next, draftAliases.get(key));
          }
        } catch {
          for (const id of cloudIds) {
            const key = `cloud:${id}`;
            store(
              {
                key,
                id,
                name: "Missing shader",
                kind: "effect",
                broken: true,
              },
              draftAliases.get(key)
            );
          }
        }
      }
      rememberResolved(found);
      return latest;
    },
    [cloudShaders, drafts, rememberResolved]
  );

  const compileComposition = useCallback(
    async (
      graphOverride,
      { layerSourceOverrides = null, syncEditorState = true } = {}
    ) => {
      const host = hostRef.current;
      if (!host?.ready) return false;
      let graph = normalizeComposition(
        graphOverride || compositionRef.current || emptyComposition()
      );
      const compileSessionId = draftSessionRef.current.presetId;
      const compileStartedAt = perfNow();
      const compileGeneration = ++compileGenerationRef.current;
      host.pause();
      setFillsLoading(
        hasAudioInput(graph.inputs) ||
          graph.fills.some(
            (fill) =>
              fill.enabled &&
              (fill.paint?.type === "image" ||
                fill.paint?.type === "video" ||
                fill.paint?.type === "webcam"),
          ),
      );
      const hydrationStartedAt = perfNow();
      let hydratedGraph;
      let resolved;
      try {
        [hydratedGraph, resolved] = await Promise.all([
          hydrateCompositionMediaUrls(graph),
          hydrateCompositionRefs(graph),
        ]);
      } catch (hydrateError) {
        if (compileGeneration === compileGenerationRef.current) {
          setFillsLoading(false);
          finishSessionResourceLoad(compileSessionId);
          reportAppError(hydrateError.message || String(hydrateError));
        }
        return false;
      }
      measurePerf("navigation.fillHydration", hydrationStartedAt);
      if (compileGeneration !== compileGenerationRef.current) return false;
      graph = normalizeComposition(hydratedGraph);
      const pinnedLayerSources = dependencyLayerSourceOverrides(
        graph,
        activeDependencySnapshotsRef.current
      );
      const map = new Map(Object.entries(resolved));
      const layers = [];
      const fillWarnings = [];
      let hasHtmlFill = false;
      const activeWebcamFillIds = new Set();
      for (const source of compositionMediaSourcesRef.current) {
        source.pause?.();
        if ("srcObject" in source) source.srcObject = null;
        source.close?.();
        source.remove?.();
      }
      compositionMediaSourcesRef.current = [];
      const loadLayer = (id, role, shaderId, values, enabled = true) => {
        const sourceOverride =
          layerSourceOverrides?.get?.(id) || pinnedLayerSources.get(id);
        const source =
          (typeof sourceOverride === "string" && sourceOverride) ||
          resolveReferencedShaderSource(shaderId, {
            session: routeEmbedRef.current ? null : draftSessionRef.current,
            drafts: routeEmbedRef.current ? [] : drafts,
            liveByKey: routeEmbedRef.current
              ? null
              : liveShaderSourceRef.current,
            resolvedByKey: map,
          });
        if (!source) return false;
        try {
          const loaded = loadModule(source);
          if (sourceOverride && shaderId) {
            map.set(shaderId, {
              ...(map.get(shaderId) || {}),
              key: shaderId,
              source,
              kind: role,
              features: mergeShaderFeatures(
                inferFeatures(source),
                map.get(shaderId)?.features,
              ),
              broken: false,
            });
          }
          layers.push({
            id,
            role,
            enabled,
            setup: loaded.setup,
            render: loaded.render,
            props: loaded.props,
            params: mergeValues(loaded.props, values),
          });
          return true;
        } catch (loadError) {
          rememberResolved([
            {
              key: shaderId,
              source,
              broken: true,
              name: loadError.message,
            },
          ]);
          return false;
        }
      };
      const retainLiveWebcamStream = async (fillId, fillPaint) => {
        activeWebcamFillIds.add(fillId);
        const wantedDevice = fillPaint?.webcam?.deviceId || "";
        let cached = compositionWebcamStreamsRef.current.get(fillId);
        const cachedDevice = webcamDeviceId(cached?.stream);
        if (
          !isLiveMediaStream(cached?.stream) ||
          (wantedDevice && cachedDevice && wantedDevice !== cachedDevice)
        ) {
          if (cached?.owned) {
            cached.stream?.getTracks?.().forEach((track) => track.stop());
          }
          compositionWebcamStreamsRef.current.delete(fillId);
          cached = null;
        }
        let stream = cached?.stream || null;
        if (!stream) {
          const pickerStream = readFillWebcamStream();
          const pickerDevice = webcamDeviceId(pickerStream);
          if (
            pickerStream &&
            (!wantedDevice || !pickerDevice || pickerDevice === wantedDevice)
          ) {
            stream =
              typeof pickerStream.clone === "function"
                ? pickerStream.clone()
                : pickerStream;
            cached = {
              stream,
              owned: stream !== pickerStream,
            };
          } else if (navigator.mediaDevices?.getUserMedia) {
            stream = await navigator.mediaDevices.getUserMedia({
              video: wantedDevice
                ? { deviceId: { exact: wantedDevice } }
                : true,
              audio:
                experimentalAudioRef.current && supportsAudioRef.current,
            });
            cached = { stream, owned: true };
          }
          if (stream) {
            compositionWebcamStreamsRef.current.set(fillId, cached);
          }
        }
        return stream;
      };
      const addFallbackFill = async (fill, fillError) => {
        fillWarnings.push(fillLoadErrorMessage(fill, fillError));
        try {
          const { width, height } = paintSize(host);
          const bitmap = await rasterizePaintFill(
            sampleFallbackPaint(defaultInputUrl),
            width,
            height,
          );
          if (compileGeneration !== compileGenerationRef.current) {
            bitmap.close?.();
            return false;
          }
          compositionMediaSourcesRef.current.push(bitmap);
          layers.push({
            id: fill.id,
            role: "fill",
            enabled: true,
            source: bitmap,
            sourceType: "image",
            props: {},
            params: {},
          });
          return true;
        } catch {
          return false;
        }
      };
      for (const fill of graph.fills.slice().reverse()) {
        if (!fill.enabled) {
          if (isLiveWebcamFill(fill)) {
            await retainLiveWebcamStream(fill.id, fill.paint);
            if (compileGeneration !== compileGenerationRef.current) {
              return false;
            }
          }
          continue;
        }
        if (fill.type === "html") {
          const element = htmlInputRef.current;
          if (!element) {
            await addFallbackFill(fill);
            continue;
          }
          hasHtmlFill = true;
          layers.push({
            id: fill.id,
            role: "fill",
            enabled: true,
            source: element,
            sourceType: "html",
            sourceScaleMode: "fill",
            sourceOpacity: 1,
            props: {},
            params: {},
          });
          continue;
        }
        if (fill.type === "shader" && fill.shaderId) {
          const loaded = loadLayer(
            fill.id,
            "fill",
            fill.shaderId,
            fill.values,
            true
          );
          if (!loaded) await addFallbackFill(fill);
          continue;
        }
        const fillPaint = resolvePaintFill(fill.paint, {
          defaultImageUrl: defaultInputUrl,
          defaultVectorUrl,
          defaultVideoUrl,
        });
        if (!isPaintFillType(fillPaint?.type)) continue;
        try {
          if (fillPaint.type === "video") {
            const assetUrl =
              !fillPaint.video?.url && fillPaint.video?.assetPath
                ? await getAssetUrl(fillPaint.video.assetPath)
                : "";
            const resolvedPaint = resolvePaintFill(
              assetUrl
                ? {
                    ...fillPaint,
                    video: { ...fillPaint.video, url: assetUrl },
                  }
                : fillPaint,
              {
                defaultVideoUrl,
              }
            );
            const video = createHiddenVideoElement();
            video.src = resolvedPaint.video?.url || defaultVideoUrl;
            await waitForVideoFrame(video, "Could not load video fill.");
            if (compileGeneration !== compileGenerationRef.current) {
              video.remove();
              return false;
            }
            compositionMediaSourcesRef.current.push(video);
            layers.push({
              id: fill.id,
              role: "fill",
              enabled: true,
              source: video,
              sourceType: "video",
              sourceScaleMode: resolvedPaint.video?.scaleMode || "fill",
              sourceOpacity:
                resolvedPaint.video?.opacity ?? resolvedPaint.opacity ?? 1,
              props: {},
              params: {},
            });
            continue;
          }
          if (fillPaint.type === "webcam" && fillPaint.webcam?.live !== false) {
            const stream = await retainLiveWebcamStream(fill.id, fillPaint);
            if (compileGeneration !== compileGenerationRef.current) {
              return false;
            }
            if (stream) {
              const webcamSettings = paintImageSource(fillPaint);
              const video = createHiddenVideoElement();
              video.srcObject = stream;
              await waitForVideoFrame(video, "Could not load webcam fill.");
              if (compileGeneration !== compileGenerationRef.current) {
                video.srcObject = null;
                video.remove();
                return false;
              }
              compositionMediaSourcesRef.current.push(video);
              layers.push({
                id: fill.id,
                role: "fill",
                enabled: true,
                source: video,
                sourceType: "webcam",
                sourceScaleMode: webcamSettings.scaleMode || "fill",
                sourceOpacity: webcamSettings.opacity ?? 1,
                props: {},
                params: {},
              });
              continue;
            }
          }
          const { width, height } = paintSize(host);
          const assetPath = fillPaint.image?.assetPath;
          const assetUrl =
            !fillPaint.image?.url && assetPath
              ? await getAssetUrl(assetPath)
              : "";
          const paint = assetUrl
            ? {
                ...fillPaint,
                image: { ...fillPaint.image, url: assetUrl },
              }
            : fillPaint;
          const bitmap = await rasterizePaintFill(paint, width, height);
          if (compileGeneration !== compileGenerationRef.current) {
            bitmap.close?.();
            return false;
          }
          compositionMediaSourcesRef.current.push(bitmap);
          layers.push({
            id: fill.id,
            role: "fill",
            enabled: true,
            source: bitmap,
            sourceType: "image",
            props: {},
            params: {},
          });
        } catch (paintError) {
          await addFallbackFill(fill, paintError);
        }
      }
      for (const [fillId, cached] of compositionWebcamStreamsRef.current) {
        if (activeWebcamFillIds.has(fillId)) continue;
        if (cached?.owned) {
          cached.stream?.getTracks?.().forEach((track) => track.stop());
        }
        compositionWebcamStreamsRef.current.delete(fillId);
      }
      for (const effect of graph.effects) {
        loadLayer(
          effect.id,
          "effect",
          effect.shaderId,
          effect.values,
          effect.enabled
        );
      }
      const missingEffect = graph.effects.find(
        (effect) =>
          effect.enabled &&
          !layers.some(
            (layer) => layer.role === "effect" && layer.id === effect.id,
          ),
      );
      if (missingEffect) {
        setFillsLoading(false);
        finishSessionResourceLoad(compileSessionId);
        reportAppError(`Effect ${missingEffect.id} could not be loaded.`);
        return false;
      }
      const features = collectCompositionFeatures(graph, map);
      const audioGated =
        experimentalAudioRef.current &&
        (Boolean(features.supportsAudio) || supportsAudioRef.current);
      let ok;
      try {
        ok = await host.setComposition(layers, {
          isFill: layers.some((layer) => layer.role === "fill"),
          isAnimated: features.isAnimated || hasHtmlFill || audioGated,
          usesMouse: features.usesMouse,
          supportsRenderScale: false,
          supportsAudio: audioGated,
        });
      } catch (compositionError) {
        if (compileGeneration === compileGenerationRef.current) {
          setFillsLoading(false);
          finishSessionResourceLoad(compileSessionId);
          setError(compositionError.message || String(compositionError));
        }
        return false;
      }
      if (
        compileGeneration !== compileGenerationRef.current ||
        hostRef.current !== host
      ) {
        return false;
      }
      if (!ok) {
        setFillsLoading(false);
        finishSessionResourceLoad(compileSessionId);
        setRunning(false);
        return false;
      }
      setFillsLoading(false);
      finishSessionResourceLoad(compileSessionId);
      if (fillWarnings.length) reportAppError(fillWarnings.join(" "));
      else setError(null);
      measurePerf("navigation.compositionCompile", compileStartedAt);
      if (syncEditorState) {
        const selected =
          (sessionKindRef.current === "effect"
            ? layers.find((layer) => layer.id === EFFECT_PREVIEW_LAYER_ID)
            : layers.find((layer) => layer.id === selectedLayerIdRef.current)) ||
          layers[0] ||
          null;
        if (selected) {
          setSelectedLayerId(selected.id);
          setProps(selected.props);
          setRuntimeValues(selected.params);
        } else {
          setProps({});
          setRuntimeValues({});
        }
        setError(null);
        setThumbnailRefreshRevision((revision) => revision + 1);
      }
      if (
        presentSessionId ||
        (playPreferenceRef.current &&
          (features.isAnimated || hasHtmlFill || audioGated))
      ) {
        if (presentWindowOpenRef.current) {
          host.pause();
          host.setActive(false);
        } else {
          host.setActive(true);
          host.play();
        }
        setRunning(true);
      } else {
        host.pause();
        setRunning(false);
      }
      recordNavigationFirstFrame();
      return true;
    },
    [
      drafts,
      finishSessionResourceLoad,
      hydrateCompositionRefs,
      recordNavigationFirstFrame,
      rememberResolved,
      reportAppError,
      setRuntimeValues,
      presentSessionId,
    ]
  );
  compileCompositionRef.current = compileComposition;

  const compile = useCallback(
    (nextSource, { force = false } = {}) => {
      if (sessionKindRef.current === COMPOSITION_KIND) {
        compileCompositionRef.current?.();
        return;
      }
      const compileSessionId = draftSessionRef.current.presetId;
      const fillKey = effectFillPreviewKey(effectFillsRef.current);
      if (sessionKindRef.current === "effect" && fillKey) {
        if (
          !force &&
          lastSuccessfulCompileRef.current.presetId ===
            draftSessionRef.current.presetId &&
          lastSuccessfulCompileRef.current.source === nextSource &&
          lastSuccessfulCompileRef.current.effectFillKey === fillKey
        ) {
          finishSessionResourceLoad(compileSessionId);
          return;
        }
        let loaded;
        try {
          loaded = loadModule(nextSource);
        } catch (compileError) {
          setError(compileError.message);
          setRunning(false);
          finishSessionResourceLoad(compileSessionId);
          return;
        }
        const compilePresetId = draftSessionRef.current.presetId;
        const preferred = pendingValuesRef.current ?? valuesRef.current;
        pendingValuesRef.current = null;
        const nextValues = mergeValues(loaded.props, preferred);
        selectedLayerIdRef.current = EFFECT_PREVIEW_LAYER_ID;
        setProps(loaded.props);
        setRuntimeValues(nextValues);
        setError(null);
        const compilePromise = compileCompositionRef.current?.({
          fills: effectFillsRef.current,
          effects: [
            {
              id: EFFECT_PREVIEW_LAYER_ID,
              shaderId: compilePresetId,
              values: nextValues,
              enabled: true,
            },
          ],
        });
        compilePromise
          ?.then((ok) => {
            if (
              !ok ||
              draftSessionRef.current.presetId !== compilePresetId ||
              sourceRef.current !== nextSource ||
              effectFillPreviewKey(effectFillsRef.current) !== fillKey
            ) {
              return;
            }
            lastSuccessfulCompileRef.current = {
              presetId: compilePresetId,
              source: nextSource,
              values: nextValues,
              effectFillKey: fillKey,
            };
            promotePendingAgentCheckpoint(
              pendingAgentCheckpointRef,
              setPendingAgentCheckpoint,
              {
                presetId: compilePresetId,
                source: nextSource,
                values: nextValues,
              }
            );
          })
          .catch(() => {
            /* Destroyed hosts / GPU teardown can reject; allow a later retry. */
          });
        return compilePromise;
      }
      const host = hostRef.current;
      if (!host?.ready) return;
      if (
        !force &&
        lastSuccessfulCompileRef.current.presetId ===
          draftSessionRef.current.presetId &&
        lastSuccessfulCompileRef.current.source === nextSource &&
        !lastSuccessfulCompileRef.current.effectFillKey
      ) {
        finishSessionResourceLoad(compileSessionId);
        return;
      }
      const compileGeneration = ++compileGenerationRef.current;
      host.pause();

      let loaded;
      try {
        loaded = loadModule(nextSource);
      } catch (compileError) {
        if (compileGeneration !== compileGenerationRef.current) return;
        setError(compileError.message);
        host.pause();
        setRunning(false);
        finishSessionResourceLoad(compileSessionId);
        return;
      }

      const preferred = pendingValuesRef.current ?? valuesRef.current;
      pendingValuesRef.current = null;
      const nextValues = mergeValues(loaded.props, preferred);
      const nextFeatures = inferFeatures(nextSource);
      setProps(loaded.props);
      setRuntimeValues(nextValues);
      setError(null);

      const moduleCompileStartedAt = perfNow();
      host
        .setModule(
          { setup: loaded.setup, render: loaded.render },
          {
            isFill: detectKind(nextSource) === "fill",
            isAnimated:
              nextFeatures.isAnimated ||
              (experimentalAudioRef.current && supportsAudioRef.current),
            usesMouse: nextFeatures.usesMouse,
            supportsRenderScale: supportsRenderScale(nextSource),
            supportsAudio:
              experimentalAudioRef.current && supportsAudioRef.current,
          }
        )
        .then((ok) => {
          // A newer compile or host remount owns playback now.
          if (
            compileGeneration !== compileGenerationRef.current ||
            hostRef.current !== host
          ) {
            return;
          }
          if (!ok) {
            setRunning(false);
            finishSessionResourceLoad(compileSessionId);
            return;
          }
          lastSuccessfulCompileRef.current = {
            presetId: draftSessionRef.current.presetId,
            source: nextSource,
            values: nextValues,
            effectFillKey: "",
          };
          measurePerf("navigation.moduleCompile", moduleCompileStartedAt);
          promotePendingAgentCheckpoint(
            pendingAgentCheckpointRef,
            setPendingAgentCheckpoint,
            {
              presetId: draftSessionRef.current.presetId,
              source: nextSource,
              values: nextValues,
            }
          );
          // Capture code edits only after the new module has compiled,
          // validated, and presented successfully.
          setThumbnailRefreshRevision((revision) => revision + 1);
          // Restore the user's play/pause preference after shader switches.
          if (presentSessionId || playPreferenceRef.current) {
            if (presentWindowOpenRef.current) {
              host.pause();
              host.setActive(false);
            } else {
              host.setActive(true);
              host.play();
            }
            setRunning(true);
          } else {
            host.pause();
            setRunning(false);
          }
          recordNavigationFirstFrame();
          finishSessionResourceLoad(compileSessionId);
        })
        .catch(() => {
          /* Destroyed hosts / GPU teardown can reject; ignore stale work. */
          if (compileGeneration === compileGenerationRef.current) {
            finishSessionResourceLoad(compileSessionId);
          }
        });
    },
    [
      finishSessionResourceLoad,
      presentSessionId,
      recordNavigationFirstFrame,
      setRuntimeValues,
    ]
  );
  compileRef.current = compile;

  const syncEffectFillFromCanvasInput = useCallback(
    (paint) => {
      if (sessionKindRef.current !== "effect") return;
      if (!isPaintFillType(paint?.type)) return;
      const current = effectFillRef.current;
      if (current?.type === "shader") return;
      const type = graphTypeForPaint(paint.type);
      if (
        current?.type === type &&
        current?.paint?.type === paint.type &&
        JSON.stringify(current.paint) === JSON.stringify(paint)
      ) {
        return;
      }
      let next = {
        id: current?.id || COMPOSITION_FILL_ID,
        type,
        shaderId: current?.shaderId ?? null,
        values: current?.values || {},
        enabled: current?.enabled !== false,
        paint,
      };
      const draftId = draftSessionRef.current.presetId;
      if (!user && isDraftId(draftId)) {
        [next] = annotateLocalDraftMediaKeys(draftId, [next]);
      }
      const graph = normalizeComposition({
        fills: effectFillsRef.current,
      });
      const fills = normalizeComposition({
        fills: [
          next,
          ...graph.fills.filter((fill) => fill.id !== next.id),
        ],
      }).fills;
      effectFillRef.current = fills[0] || null;
      effectFillsRef.current = fills;
      setEffectFill(fills[0] || null);
      setEffectFills(fills);
    },
    [user],
  );

  const setImagePreviewUrl = useCallback((url) => {
    const next = url || defaultInputUrl;
    const prev = inputImageUrlRef.current;
    if (prev && prev !== next && prev.startsWith("blob:")) {
      URL.revokeObjectURL(prev);
    }
    inputImageUrlRef.current = next;
    setInputImageUrl(next);
  }, []);

  const clearVersionPreviewMedia = useCallback(() => {
    const cleanup = versionPreviewMediaCleanupRef.current;
    versionPreviewMediaCleanupRef.current = null;
    try {
      cleanup?.();
    } catch {
      // Preview resource cleanup must never block restoring the live editor.
    }
  }, []);

  const applyMediaBlob = useCallback(
    async (
      blob,
      mimeType = blob.type,
      generation = null,
      { previewOnly = false } = {}
    ) => {
      const host = hostRef.current;
      if (!host?.ready) return false;
      if (!isInputApplyCurrent(generation)) return false;
      if (previewOnly) clearVersionPreviewMedia();
      else {
        clearVersionPreviewMedia();
        clearObjectUrl();
      }
      let appliedPaint = null;

      if (mimeType.startsWith("video/")) {
        const video = document.createElement("video");
        // WebGPU can only import frames from a video that is in the document
        // and has a decoded backing resource.
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "auto";
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.setAttribute("muted", "");
        Object.assign(video.style, {
          position: "fixed",
          left: "-9999px",
          top: "0",
          width: "1px",
          height: "1px",
          opacity: "0",
          pointerEvents: "none",
        });
        document.body.appendChild(video);

        const url = URL.createObjectURL(blob);
        const disposeVideo = () => {
          video.pause();
          video.removeAttribute("src");
          video.load();
          video.remove();
          URL.revokeObjectURL(url);
        };
        if (previewOnly) {
          versionPreviewMediaCleanupRef.current = disposeVideo;
        } else {
          mediaUrlRef.current = url;
          videoRef.current = video;
        }
        video.src = url;

        await new Promise((resolve, reject) => {
          video.addEventListener("loadeddata", resolve, { once: true });
          video.addEventListener(
            "error",
            () => reject(new Error("Failed to load video input.")),
            { once: true }
          );
        });
        if (!isInputApplyCurrent(generation)) {
          disposeVideo();
          if (!previewOnly && mediaUrlRef.current === url) {
            mediaUrlRef.current = null;
            videoRef.current = null;
          } else if (previewOnly) {
            versionPreviewMediaCleanupRef.current = null;
          }
          return false;
        }
        await video.play();

        if (typeof video.requestVideoFrameCallback === "function") {
          await new Promise((resolve) => {
            video.requestVideoFrameCallback(() => resolve());
          });
        } else if (!video.videoWidth) {
          await new Promise((resolve) => {
            const start = performance.now();
            const tick = () => {
              if (video.videoWidth > 0 || performance.now() - start > 2000) {
                resolve();
                return;
              }
              requestAnimationFrame(tick);
            };
            tick();
          });
        }

        if (!isInputApplyCurrent(generation)) {
          disposeVideo();
          if (!previewOnly && mediaUrlRef.current === url) {
            mediaUrlRef.current = null;
            videoRef.current = null;
          } else if (previewOnly) {
            versionPreviewMediaCleanupRef.current = null;
          }
          return false;
        }

        if (!video.videoWidth || !video.videoHeight) {
          throw new Error("Video input has no decoded frames yet.");
        }

        host.setVideoInput(video);
        if (!previewOnly) setInputSource("video");
        const videoPaint = {
          type: "video",
          video: { url, scaleMode: "fit" },
        };
        appliedPaint = videoPaint;
        if (!previewOnly) syncEffectFillFromCanvasInput(videoPaint);
      } else {
        const bitmap =
          mimeType === "image/svg+xml"
            ? await rasterizeSvgBlob(blob)
            : await imageBitmapForInput(blob, host.maxDimension);
        if (!isInputApplyCurrent(generation)) {
          bitmap.close?.();
          return false;
        }
        host.setImageInput(bitmap);
        bitmap.close?.();
        if (!previewOnly) setInputSource("image");
        const previewUrl = previewOnly ? "" : URL.createObjectURL(blob);
        if (!previewOnly) setImagePreviewUrl(previewUrl);
        const imagePaint = {
          type: "image",
          image: { url: previewUrl, scaleMode: "fit" },
        };
        appliedPaint = imagePaint;
        if (!previewOnly) syncEffectFillFromCanvasInput(imagePaint);
      }
      setPreviewRevision((revision) => revision + 1);
      return appliedPaint;
    },
    [
      clearObjectUrl,
      clearVersionPreviewMedia,
      isInputApplyCurrent,
      setImagePreviewUrl,
      syncEffectFillFromCanvasInput,
    ]
  );

  const applyWebcamFill = useCallback(
    async (generation = null, detail = null) => {
      const host = hostRef.current;
      if (!host?.ready) return false;
      if (!isInputApplyCurrent(generation)) return false;

      const wantedDevice = detail?.webcam?.deviceId || "";
      if (hasLiveWebcamStream(videoRef.current)) {
        const currentDevice = webcamDeviceId(videoRef.current.srcObject);
        if (!wantedDevice || wantedDevice === currentDevice) {
          host.setVideoInput(videoRef.current);
          setInputSource("video");
          syncEffectFillFromCanvasInput({
            type: "webcam",
            webcam: {
              ...(detail?.webcam || {}),
              live: true,
              ...(currentDevice ? { deviceId: currentDevice } : {}),
            },
          });
          setPreviewRevision((revision) => revision + 1);
          return true;
        }
      }

      const pickerStream = readFillWebcamStream();
      let stream = null;
      let ownsStream = false;
      if (pickerStream) {
        stream =
          typeof pickerStream.clone === "function"
            ? pickerStream.clone()
            : pickerStream;
        ownsStream = stream !== pickerStream;
      } else {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Webcam is not available in this browser.");
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: wantedDevice
              ? { deviceId: { exact: wantedDevice } }
              : true,
            audio: experimentalAudioRef.current && supportsAudioRef.current,
          });
          ownsStream = true;
        } catch (cameraError) {
          if (cameraError.name === "NotAllowedError") {
            throw new Error("Allow camera access to use a webcam fill.");
          }
          throw new Error(cameraError.message || "Could not start the webcam.");
        }
      }
      if (!isInputApplyCurrent(generation)) {
        if (ownsStream) stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      clearObjectUrl();
      const video = createHiddenVideoElement();
      video.srcObject = stream;
      try {
        await waitForVideoFrame(video, "Failed to start the webcam.");
      } catch (error) {
        if (ownsStream) stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
        video.remove();
        throw error;
      }
      if (!isInputApplyCurrent(generation)) {
        if (ownsStream) stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
        video.remove();
        return false;
      }
      if (!video.videoWidth || !video.videoHeight) {
        if (ownsStream) stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
        video.remove();
        throw new Error("Webcam has no video frames yet.");
      }

      videoRef.current = video;
      host.setVideoInput(video);
      setInputSource("video");
      const activeDevice = webcamDeviceId(stream) || wantedDevice;
      syncEffectFillFromCanvasInput({
        type: "webcam",
        webcam: {
          ...(detail?.webcam || {}),
          live: true,
          ...(activeDevice ? { deviceId: activeDevice } : {}),
        },
      });
      setPreviewRevision((revision) => revision + 1);
      return true;
    },
    [
      clearObjectUrl,
      isInputApplyCurrent,
      setInputSource,
      syncEffectFillFromCanvasInput,
    ]
  );

  const restoreSample = useCallback(
    async (generation = null) => {
      const host = hostRef.current;
      if (!host?.ready) return false;
      if (!isInputApplyCurrent(generation)) return false;
      clearObjectUrl();
      const bitmap = await makeSampleBitmap();
      if (!isInputApplyCurrent(generation)) {
        bitmap.close?.();
        return false;
      }
      host.setImageInput(bitmap);
      setInputSource("image");
      setImagePreviewUrl(defaultInputUrl);
      setPreviewRevision((revision) => revision + 1);
      return true;
    },
    [clearObjectUrl, isInputApplyCurrent, setImagePreviewUrl]
  );

  const applyVectorSample = useCallback(
    async (generation = null) => {
      const host = hostRef.current;
      if (!host?.ready) return false;
      if (!isInputApplyCurrent(generation)) return false;
      clearObjectUrl();
      setPendingMedia(null);
      const bitmap = await makeSampleVectorBitmap();
      if (!isInputApplyCurrent(generation)) {
        bitmap.close?.();
        return false;
      }
      host.setImageInput(bitmap);
      setInputSource("image");
      setImagePreviewUrl(defaultVectorUrl);
      syncEffectFillFromCanvasInput({
        type: "image",
        image: { url: defaultVectorUrl, scaleMode: "fit" },
      });
      setPreviewRevision((revision) => revision + 1);
      return true;
    },
    [clearObjectUrl, isInputApplyCurrent, setImagePreviewUrl, syncEffectFillFromCanvasInput]
  );

  // Re-apply the toolbar input preference when switching shaders.
  // Keeps Image/Video/HTML/Vector across effects; no-ops fall back safely.
  const reapplyPreferredInput = useCallback(async () => {
    const host = hostRef.current;
    if (!host?.ready) return;
    const preferred = inputSourceRef.current;
    // Every path takes a generation so a superseded load can neither apply a
    // stale bitmap nor leave the "Loading input…" overlay stuck on screen.
    const generation = ++inputApplyGenRef.current;

    if (preferred === "html") {
      if (
        !supportsHtmlInCanvas() ||
        !supportsCopyElementImageToTexture(host.device)
      ) {
        reportAppError(HTML_IN_CANVAS_SETUP);
        clearObjectUrl();
        const bitmap = await makeSampleBitmap();
        if (!isInputApplyCurrent(generation)) {
          bitmap.close?.();
          return;
        }
        host.setImageInput(bitmap);
        setInputSource("image");
        setPreviewRevision((revision) => revision + 1);
        return;
      }
      clearObjectUrl();
      setPendingMedia(null);
      setUploading(false);
      setInputSource("html");
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
      if (!isInputApplyCurrent(generation)) return;
      const element = htmlInputRef.current;
      if (!element) return;
      host.setHtmlInput(element, HTML_INPUT_WIDTH, HTML_INPUT_HEIGHT);
      setPreviewRevision((revision) => revision + 1);
      return;
    }

    setUploading(true);
    try {
      if (preferred === "video") {
        setPendingMedia(null);
        const blob = await makeSampleVideoBlob();
        if (!isInputApplyCurrent(generation)) return;
        await applyMediaBlob(blob, blob.type || "video/mp4", generation);
        return;
      }

      if (preferred === "vector") {
        await applyVectorSample(generation);
        return;
      }

      clearObjectUrl();
      setPendingMedia(null);
      const bitmap = await makeSampleBitmap();
      if (!isInputApplyCurrent(generation)) {
        bitmap.close?.();
        return;
      }
      host.setImageInput(bitmap);
      setInputSource("image");
      setImagePreviewUrl(defaultInputUrl);
      setPreviewRevision((revision) => revision + 1);
    } catch (inputError) {
      if (isInputApplyCurrent(generation)) {
        reportAppError(inputError.message || String(inputError));
      }
    } finally {
      if (isInputApplyCurrent(generation)) setUploading(false);
    }
  }, [applyMediaBlob, applyVectorSample, clearObjectUrl, isInputApplyCurrent, setImagePreviewUrl]);

  const applyInputSource = useCallback(
    async (next) => {
      const host = hostRef.current;

      // The host may still be initializing (slow WebGPU start, or a pane that
      // just remounted). Remember the choice instead of dropping it.
      if (!host?.ready) {
        // Supersede the bootstrap image load even if it has not started yet.
        inputApplyGenRef.current += 1;
        pendingInputSourceRef.current = next;
        setInputSource(next);
        return;
      }

      // HTML unsupported: keep the current source. Snap the select back —
      // React won't re-set `value` if state never changed, so the control
      // would otherwise stay on HTML and block switching "back" to video.
      if (next === "html") {
        if (
          !supportsHtmlInCanvas() ||
          !supportsCopyElementImageToTexture(host.device)
        ) {
          reportAppError(HTML_IN_CANVAS_SETUP);
          return;
        }
        ++inputApplyGenRef.current;
        clearObjectUrl();
        setPendingMedia(null);
        // This supersedes any in-flight load, whose own cleanup will bail out.
        setUploading(false);
        setInputSource("html");
        return;
      }

      const generation = ++inputApplyGenRef.current;
      setInputSource(next);
      // Whichever branch runs owns the overlay. A superseded load skips its own
      // cleanup, so the newest switch must always be the one to clear it.
      setUploading(true);
      try {
        if (next === "image") {
          setPendingMedia(null);
          await restoreSample(generation);
          return;
        }

        if (next === "vector") {
          await applyVectorSample(generation);
          return;
        }

        if (next === "video") {
          setPendingMedia(null);
          const blob = await makeSampleVideoBlob();
          if (!isInputApplyCurrent(generation)) return;
          await applyMediaBlob(blob, blob.type || "video/mp4", generation);
        }
      } catch (sourceError) {
        if (isInputApplyCurrent(generation)) {
          reportAppError(sourceError.message || String(sourceError));
        }
      } finally {
        if (isInputApplyCurrent(generation)) setUploading(false);
      }
    },
    [
      applyMediaBlob,
      applyVectorSample,
      clearObjectUrl,
      isInputApplyCurrent,
      restoreSample,
    ]
  );

  const applyPaintFill = useCallback(
    (detail) => {
      if (!isPaintFillType(detail?.type)) return Promise.resolve(false);
      const generation = ++inputApplyGenRef.current;
      const showsLoading =
        detail.type === "image" ||
        detail.type === "video" ||
        detail.type === "webcam";
      if (showsLoading) setUploading(true);
      if (paintFillRafRef.current) {
        cancelAnimationFrame(paintFillRafRef.current.id);
        paintFillRafRef.current.resolve?.(false);
      }
      return new Promise((resolve) => {
        const id = requestAnimationFrame(() => {
          paintFillRafRef.current = 0;
          (async () => {
            const host = hostRef.current;
            if (!host?.ready || !isInputApplyCurrent(generation)) {
              resolve(false);
              return;
            }

            if (detail.type === "webcam") {
              const snapshotUrl = paintImageSource(detail).url;
              const live = detail.webcam?.live !== false;
              if (live || !snapshotUrl) {
                await applyWebcamFill(generation, detail);
                resolve(true);
                return;
              }
            }

            if (detail.type === "video") {
              const resolved = resolvePaintFill(detail, { defaultVideoUrl });
              const url =
                typeof resolved.video?.url === "string" ? resolved.video.url : "";
              const blob =
                !url || url === defaultVideoUrl
                  ? await makeSampleVideoBlob()
                  : await fetch(url).then((response) => {
                      if (!response.ok) {
                        throw new Error("Could not load video fill.");
                      }
                      return response.blob();
                    });
              if (!isInputApplyCurrent(generation)) {
                resolve(false);
                return;
              }
              await applyMediaBlob(blob, blob.type || "video/mp4", generation);
              if (url && url !== defaultVideoUrl && url.startsWith("blob:")) {
                const file = await fileFromBlobUrl(url, "input.mp4");
                if (file && isInputApplyCurrent(generation)) {
                  if (file.size > MAX_MEDIA_BYTES) {
                    reportAppError("Input media must be 25 MB or smaller.");
                  } else {
                    setPendingMedia(file);
                  }
                }
              }
              resolve(true);
              return;
            }

            const media = paintImageSource(detail);
            if (detail.type === "image" && !media.url) {
              await restoreSample(generation);
              resolve(true);
              return;
            }

            clearObjectUrl();
            const { width, height } = paintSize(host);
            const bitmap = await rasterizePaintFill(detail, width, height);
            if (!isInputApplyCurrent(generation)) {
              bitmap.close?.();
              resolve(false);
              return;
            }
            const canUpdate =
              host.inputTexture &&
              !host.video &&
              host.inputTexture.width === width &&
              host.inputTexture.height === height;
            if (canUpdate && host.updateImageInput(bitmap)) {
              if (!host.running) host.redraw();
            } else {
              host.setImageInput(bitmap);
            }
            setInputSource("image");
            if (
              detail.type === "image" &&
              typeof media.url === "string" &&
              media.url &&
              !media.url.startsWith("data:")
            ) {
              setImagePreviewUrl(media.url);
              if (media.url.startsWith("blob:")) {
                const file = await fileFromBlobUrl(media.url);
                if (file && isInputApplyCurrent(generation)) {
                  if (file.size > MAX_MEDIA_BYTES) {
                    reportAppError("Input media must be 25 MB or smaller.");
                  } else {
                    setPendingMedia(file);
                  }
                }
              }
            }
            setPreviewRevision((revision) => revision + 1);
            resolve(true);
          })().catch((paintError) => {
            if (isInputApplyCurrent(generation)) {
              reportAppError(paintError.message || String(paintError));
            }
            resolve(false);
          });
        });
        paintFillRafRef.current = { id, resolve };
      }).finally(() => {
        if (showsLoading && isInputApplyCurrent(generation)) {
          setUploading(false);
        }
      });
    },
    [
      applyMediaBlob,
      applyWebcamFill,
      isInputApplyCurrent,
      restoreSample,
      setImagePreviewUrl,
      setInputSource,
      setPendingMedia,
    ]
  );
  applyPaintFillRef.current = applyPaintFill;

  // Apply an input choice that arrived before the host was ready.
  useEffect(() => {
    if (!runtimeReady || !hostRef.current?.ready) return;
    const pending = pendingInputSourceRef.current;
    if (!pending) return;
    pendingInputSourceRef.current = null;
    applyInputSource(pending).catch((sourceError) =>
      reportAppError(sourceError.message || String(sourceError))
    );
  }, [applyInputSource, runtimeReady]);

  // A remounted host starts visible, so re-apply the toggle the panel shows.
  useEffect(() => {
    if (!runtimeReady) return;
    hostRef.current?.setEffectVisible?.(effectVisible);
  }, [effectVisible, runtimeReady]);

  // Bind HTML-in-Canvas input after the canvas child mounts.
  useEffect(() => {
    if (inputSource !== "html" || !runtimeReady) return;
    const host = hostRef.current;
    const element = htmlInputRef.current;
    if (!host?.ready || !element) return;
    try {
      if (
        !supportsHtmlInCanvas() ||
        !supportsCopyElementImageToTexture(host.device)
      ) {
        reportAppError(HTML_IN_CANVAS_SETUP);
        return;
      }
      host.setHtmlInput(element, HTML_INPUT_WIDTH, HTML_INPUT_HEIGHT);
      setPreviewRevision((revision) => revision + 1);
    } catch (htmlError) {
      reportAppError(htmlError.message || String(htmlError));
    }
  }, [inputSource, runtimeReady]);

  // When live-editing toggles effect ↔ fill, keep the input preference but
  // clear/reapply the host input as needed.
  const previousKindRef = useRef(kind);
  useEffect(() => {
    const previous = previousKindRef.current;
    previousKindRef.current = kind;
    if (!runtimeReady || !hostRef.current?.ready || previous === kind) return;
    if (kind === "fill") {
      clearObjectUrl();
      hostRef.current.clearInput();
      return;
    }
    if (kind === COMPOSITION_KIND) {
      const fill = compositionRef.current?.fill;
      if (fill?.type === "shader") {
        clearObjectUrl();
        hostRef.current.clearInput();
        return;
      }
      const paint = compositionPaintFill(fill ? { fill } : null);
      if (paint) {
        applyPaintFill(paint);
        return;
      }
    }
    if (kind === "effect" && isPaintFillType(effectFillRef.current?.paint?.type)) {
      applyPaintFill(effectFillRef.current.paint);
      return;
    }
    reapplyPreferredInput().catch((inputError) =>
      reportAppError(inputError.message || String(inputError))
    );
  }, [kind, runtimeReady, applyPaintFill, clearObjectUrl, reapplyPreferredInput]);

  useEffect(
    () =>
      subscribePreviewPixelRatioMode((mode) => {
        hostRef.current?.setPreviewPixelRatioMode(mode);
      }),
    []
  );

  useEffect(() => {
    if (
      viewMode === "home" ||
      viewMode === "profile" ||
      initedRef.current ||
      !canvasRef.current
    ) {
      return;
    }
    let cancelled = false;
    initedRef.current = true;
    const host = new ShaderHost(canvasRef.current, {
      onError: (message) => {
        setError(message);
        // Host stops its RAF loop on render errors — pause the current
        // preview, but keep the user's play preference for the next shader.
        if (message) {
          setRunning(false);
        }
      },
    });
    hostRef.current = host;
    const audioBus = new AudioInputBus();
    audioBusRef.current = audioBus;
    host.setAudioBus(audioBus);
    host.setPreviewZoom(previewZoom);
    // The overlay mounts before this effect runs, so adopt the surface it reported.
    host.setPointerSurface(pointerSurfaceRef.current);
    // The initial image load must be cancellable by a source selection made
    // while WebGPU is initializing or while that image is decoding.
    const initialInputGeneration = ++inputApplyGenRef.current;

    // Pause ordinary hidden views, but keep a Present window active while the
    // editor has focus so it can continue driving the GPU and video decoder.
    const onVisibilityChange = () => {
      host.setActive(
        Boolean(presentSessionId) || document.visibilityState === "visible",
      );
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    (async () => {
      try {
        await host.init();
        if (cancelled) return;
        // Present is allowed to keep rendering behind the focused editor.
        host.setActive(
          Boolean(presentSessionId) || document.visibilityState === "visible",
        );
        await restoreSample(initialInputGeneration);
        if (cancelled) return;
        // Compile via the source/preset effect once runtimeReady flips — avoids
        // racing a stale sourceRef when opening a shader from the home page.
        setRuntimeReady(true);
      } catch (initError) {
        setFatal(initError.message || String(initError));
        finishSessionResourceLoad(draftSessionRef.current.presetId);
      }
    })();
    return () => {
      cancelled = true;
      // Bumping the generation orphans any in-flight load, so clear the overlay
      // here rather than leaving it spinning for the next mount.
      inputApplyGenRef.current += 1;
      setUploading(false);
      compileGenerationRef.current += 1;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (hostRef.current === host) {
        host.destroy();
        hostRef.current = null;
      }
      audioBusRef.current?.dispose();
      audioBusRef.current = null;
      ownedAudioElementRef.current?.pause?.();
      ownedAudioElementRef.current?.remove?.();
      ownedAudioElementRef.current = null;
      dedicatedMicStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      dedicatedMicStreamRef.current = null;
      audioSourceKeyRef.current = "";
      initedRef.current = false;
      setRuntimeReady(false);
      clearObjectUrl();
    };
  }, [
    clearObjectUrl,
    finishSessionResourceLoad,
    restoreSample,
    viewMode,
    isComposerView,
    presentSessionId,
  ]);

  useEffect(() => {
    if (!runtimeReady || !hostRef.current?.ready) return;
    if (sessionResourcesLoading && !source && !composition) return;
    clearTimeout(compileTimer.current);
    const switchedShader = lastCompiledPresetRef.current !== presetId;
    lastCompiledPresetRef.current = presetId;
    if (switchedShader) {
      compileRef.current(source);
      return;
    }
    compileTimer.current = setTimeout(() => compileRef.current(source), 350);
    return () => clearTimeout(compileTimer.current);
  }, [
    source,
    composition && sessionKind === COMPOSITION_KIND
      ? compositionStructureKey(composition)
      : "",
    sessionKind === "effect"
      ? compositionStructureKey({ fills: effectFills, effects: [] })
      : "",
    sessionKind === COMPOSITION_KIND ? liveShaderRevision : 0,
    presetId,
    runtimeReady,
    sessionResourcesLoading,
  ]);

  useEffect(() => {
    return subscribeExperimentalAudio(setExperimentalAudio);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const bus = audioBusRef.current;
    if (!host?.ready || !bus) return undefined;
    const gated = experimentalAudio && supportsAudio;
    host.supportsAudio = gated;
    let cancelled = false;
    const inputs =
      sessionKind === COMPOSITION_KIND
        ? normalizeDocumentInputs(composition?.inputs)
        : documentInputs;
    const graph =
      sessionKind === COMPOSITION_KIND
        ? composition
        : { fills: effectFills, inputs };
    const audioFile = enabledAudioFileInput(inputs);
    const videoFill = enabledVideoFillSoundtrack(graph);
    const webcamLive = liveWebcamFillCount(graph) > 0;
    const webcamStream =
      [...compositionWebcamStreamsRef.current.values()].find((entry) =>
        isLiveMediaStream(entry?.stream),
      )?.stream ||
      (hasLiveWebcamStream(videoRef.current)
        ? videoRef.current.srcObject
        : null);
    const micInput = enabledMicrophoneInput(inputs);
    const previousInputs =
      audioInputsPresetRef.current === presetId
        ? audioInputsSnapshotRef.current
        : [];
    const removedInputs = removedDocumentInputs(previousInputs, inputs);
    audioInputsPresetRef.current = presetId;
    audioInputsSnapshotRef.current = inputs;

    const stopDedicatedMic = () => {
      dedicatedMicStreamRef.current
        ?.getTracks?.()
        .forEach((track) => track.stop());
      dedicatedMicStreamRef.current = null;
    };
    const releaseOwnedAudio = () => {
      const el = ownedAudioElementRef.current;
      if (!el) return;
      el.pause?.();
      el.removeAttribute?.("src");
      el.load?.();
      el.remove?.();
      ownedAudioElementRef.current = null;
    };
    const revokeRemovedAudioUrls = () => {
      for (const input of removedInputs) {
        const url = input.audio?.url;
        if (typeof url === "string" && url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      }
    };
    const resetDeletedAudioInputs = () => {
      if (!removedInputs.length) return;
      revokeRemovedAudioUrls();
      host.resetShaderState();
    };
    const detachLiveAudio = () => {
      stopDedicatedMic();
      releaseOwnedAudio();
      host.clearAudio();
      audioSourceKeyRef.current = "";
    };

    (async () => {
      if (!gated) {
        bus.suspend();
        detachLiveAudio();
        resetDeletedAudioInputs();
        return;
      }
      try {
        await bus.resume();
        if (cancelled) return;
        if (audioFile?.audio?.url) {
          const key = `file:${audioFile.id}:${audioFile.audio.url}`;
          if (audioSourceKeyRef.current !== key || !bus.sourceNode) {
            stopDedicatedMic();
            releaseOwnedAudio();
            const playback = audioPlaybackSettings(audioFile.audio);
            const el = document.createElement("audio");
            el.crossOrigin = "anonymous";
            el.loop = playback.loop;
            el.preload = "auto";
            el.src = audioFile.audio.url;
            ownedAudioElementRef.current = el;
            if (cancelled) {
              releaseOwnedAudio();
              host.clearAudio();
              return;
            }
            await bus.attachElement(el, {
              gain: playback.gain,
              monitor: playback.monitor,
            });
            if (cancelled) {
              host.clearAudio();
              return;
            }
            audioSourceKeyRef.current = key;
          }
          const playback = audioPlaybackSettings(audioFile.audio);
          const el = ownedAudioElementRef.current;
          if (el) el.loop = playback.loop;
          bus.setGain(playback.gain);
          bus.setMonitor(playback.monitor);
          await bus.syncPlayback({ running });
          resetDeletedAudioInputs();
          return;
        }
        releaseOwnedAudio();
        const videoEl =
          compositionMediaSourcesRef.current.find(
            (node) => node?.tagName === "VIDEO" && node.src && !node.srcObject,
          ) ||
          (videoRef.current?.src && !videoRef.current.srcObject
            ? videoRef.current
            : null);
        if (videoFill && videoEl) {
          const key = `video:${videoFill.id}`;
          if (audioSourceKeyRef.current !== key) {
            stopDedicatedMic();
            await bus.attachElement(videoEl);
            if (cancelled) {
              host.clearAudio();
              return;
            }
            audioSourceKeyRef.current = key;
          }
          resetDeletedAudioInputs();
          return;
        }
        if (!micInput && webcamLive && webcamStream) {
          const hasMic = webcamStream
            .getAudioTracks?.()
            .some((track) => track.readyState === "live");
          if (hasMic) {
            const key = `webcam:${webcamDeviceId(webcamStream)}`;
            if (audioSourceKeyRef.current !== key) {
              stopDedicatedMic();
              await bus.attachStream(webcamStream);
              if (cancelled) {
                host.clearAudio();
                return;
              }
              audioSourceKeyRef.current = key;
            }
            resetDeletedAudioInputs();
            return;
          }
          try {
            const deviceId = webcamDeviceId(webcamStream);
            const upgraded = await navigator.mediaDevices.getUserMedia({
              video: deviceId ? { deviceId: { exact: deviceId } } : true,
              audio: true,
            });
            if (cancelled) {
              upgraded.getTracks().forEach((track) => track.stop());
              return;
            }
            await bus.attachStream(upgraded, { owned: true });
            if (cancelled) {
              host.clearAudio();
              return;
            }
            audioSourceKeyRef.current = `webcam-upgraded:${deviceId}`;
            resetDeletedAudioInputs();
            return;
          } catch {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });
            if (cancelled) {
              micStream.getTracks().forEach((track) => track.stop());
              return;
            }
            stopDedicatedMic();
            dedicatedMicStreamRef.current = micStream;
            await bus.attachStream(micStream, { owned: true });
            if (cancelled) {
              host.clearAudio();
              return;
            }
            audioSourceKeyRef.current = "mic-fallback";
            resetDeletedAudioInputs();
            return;
          }
        }
        if (micInput) {
          if (audioSourceKeyRef.current !== "mic") {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });
            if (cancelled) {
              micStream.getTracks().forEach((track) => track.stop());
              return;
            }
            stopDedicatedMic();
            dedicatedMicStreamRef.current = micStream;
            await bus.attachStream(micStream, { owned: true });
            if (cancelled) {
              host.clearAudio();
              return;
            }
            audioSourceKeyRef.current = "mic";
          }
          resetDeletedAudioInputs();
          return;
        }
        detachLiveAudio();
        resetDeletedAudioInputs();
        if (!host.running && host.ready && host.renderFn) host.redraw();
      } catch (audioError) {
        if (!cancelled) reportAppError(audioError.message || String(audioError));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    composition,
    documentInputs,
    effectFills,
    experimentalAudio,
    presetId,
    previewRevision,
    running,
    sessionKind,
    supportsAudio,
  ]);

  useEffect(
    () => () => {
      window.clearTimeout(thumbnailPreviewTimerRef.current);
      for (const source of compositionMediaSourcesRef.current) {
        source.pause?.();
        if ("srcObject" in source) source.srcObject = null;
        source.close?.();
        source.remove?.();
      }
      compositionMediaSourcesRef.current = [];
      for (const cached of compositionWebcamStreamsRef.current.values()) {
        if (cached?.owned) {
          cached.stream?.getTracks?.().forEach((track) => track.stop());
        }
      }
      compositionWebcamStreamsRef.current.clear();
      clearVersionPreviewMedia();
      clearObjectUrl();
    },
    [clearObjectUrl, clearVersionPreviewMedia]
  );

  const loadMediaForShader = useCallback(
    async (shader, { previewOnly = false } = {}) => {
      if (shader.kind !== "effect" && shader.kind !== COMPOSITION_KIND) {
        if (previewOnly) clearVersionPreviewMedia();
        else clearObjectUrl();
        hostRef.current?.clearInput();
        return;
      }
      if (!shader.input_path) {
        if (previewOnly) {
          clearVersionPreviewMedia();
          hostRef.current?.clearInput();
          return;
        }
        const paint =
          shader.kind === COMPOSITION_KIND
            ? compositionPaintFill(shader.composition)
            : effectFillRef.current?.paint;
        if (isPaintFillType(paint?.type)) {
          applyPaintFill(paint);
          return;
        }
        await reapplyPreferredInput();
        return;
      }
      const generation = previewOnly ? null : ++inputApplyGenRef.current;
      if (!previewOnly) setUploading(true);
      const isVideo = String(shader.input_mime_type || "").startsWith("video/");
      if (!previewOnly) {
        getAssetUrl(shader.input_path)
          .then((url) => {
            if (!url || !isInputApplyCurrent(generation)) return;
            const paint = isVideo
              ? { type: "video", video: { url, scaleMode: "fit" } }
              : { type: "image", image: { url, scaleMode: "fill" } };
            syncEffectFillFromCanvasInput(paint);
            if (!isVideo) setImagePreviewUrl(url);
          })
          .catch(() => {});
      }
      try {
        const blob = await downloadAsset(shader.input_path);
        await applyMediaBlob(
          blob,
          shader.input_mime_type || blob.type,
          generation,
          { previewOnly }
        );
      } finally {
        if (!previewOnly && isInputApplyCurrent(generation)) setUploading(false);
      }
    },
    [
      applyMediaBlob,
      applyPaintFill,
      clearObjectUrl,
      clearVersionPreviewMedia,
      isInputApplyCurrent,
      reapplyPreferredInput,
      setImagePreviewUrl,
      syncEffectFillFromCanvasInput,
    ]
  );

  useEffect(() => {
    if (!runtimeReady || !hostRef.current?.ready) return;
    if (sessionInputAppliedRef.current === presetId) return;
    sessionInputAppliedRef.current = presetId;
    if (sessionKind === COMPOSITION_KIND) {
      const paint = compositionPaintFill(compositionRef.current);
      if (paint) applyPaintFill(paint);
      return;
    }
    if (sessionKind === "effect" && effectFillsRef.current.length) {
      // The composition host owns stacked effect fills, including their
      // per-layer uploaded assets. Do not reapply the legacy row input.
      return;
    }
    if (sessionKind === "effect" && currentShader?.input_path) {
      loadMediaForShader(currentShader);
      return;
    }
    const paint =
      sessionKind === "effect" &&
      isPaintFillType(effectFillRef.current?.paint?.type)
        ? effectFillRef.current.paint
        : null;
    if (paint) applyPaintFill(paint);
  }, [
    applyPaintFill,
    currentShader,
    loadMediaForShader,
    presetId,
    runtimeReady,
    sessionKind,
  ]);

  const persistActiveDraft = useCallback(() => {
    const session = draftSessionRef.current;
    const documentSnapshot = captureDocumentSnapshot();
    rememberLiveShaderSource({
      key: session.presetId,
      id: session.presetId,
      name: session.shaderName,
      kind: documentSnapshot.kind,
      source: documentSnapshot.source,
      is_public: session.isPublic,
      features: documentSnapshot.features,
    });
    if (!isDraftId(session.presetId)) return;
    const nextDrafts = draftsRef.current.map((draft) =>
        draft.id === session.presetId
          ? {
              ...draft,
              name: session.shaderName,
              description: session.shaderDescription,
              source: documentSnapshot.source,
              kind: documentSnapshot.kind,
              values: documentSnapshot.parameterValues,
              composition: documentSnapshot.composition,
              effectFills:
                documentSnapshot.kind === "effect"
                  ? documentSnapshot.composition.effectFills
                  : [],
              effectFill:
                documentSnapshot.kind === "effect"
                  ? documentSnapshot.composition.effectFill
                  : null,
              dependencySnapshots: documentSnapshot.dependencySnapshots,
              features: documentSnapshot.features,
              isPublic: session.isPublic,
              pendingMedia: session.pendingMedia,
            }
          : draft
    );
    draftsRef.current = nextDrafts;
    setDrafts(nextDrafts);
    writeDrafts(nextDrafts, thumbnailDataUrlsRef.current);
  }, [captureDocumentSnapshot, rememberLiveShaderSource]);

  const persistBeforeSessionChange = useCallback(async () => {
    persistActiveDraft();
    const sessionId = draftSessionRef.current.presetId;
    if (isDraftId(sessionId)) {
      const session = draftSessionRef.current;
      const currentFills =
        session.kind === COMPOSITION_KIND
          ? normalizeComposition(compositionRef.current).fills
          : session.kind === "effect"
            ? effectFillsRef.current
            : [];
      const keyedFills = annotateLocalDraftMediaKeys(
        sessionId,
        currentFills,
      );
      if (JSON.stringify(keyedFills) !== JSON.stringify(currentFills)) {
        if (session.kind === COMPOSITION_KIND) {
          const next = normalizeComposition({
            ...compositionRef.current,
            fills: keyedFills,
          });
          compositionRef.current = next;
          setComposition(next);
        } else if (session.kind === "effect") {
          effectFillsRef.current = keyedFills;
          effectFillRef.current = keyedFills[0] || null;
          setEffectFills(keyedFills);
          setEffectFill(keyedFills[0] || null);
        }
      }
      const currentInputs = liveSessionInputs(
        session.kind,
        compositionRef.current,
        documentInputsRef.current,
      );
      let pendingPersistence = draftMediaPersistenceRef.current;
      if (
        !pendingPersistence &&
        (fillMediaEntries(keyedFills).length ||
          session.pendingMedia ||
          hasDraftAudioMedia(currentInputs))
      ) {
        pendingPersistence = persistLocalDraftMedia(
          sessionId,
          keyedFills,
          session.pendingMedia,
          currentInputs,
        );
      }
      if (pendingPersistence) {
        await pendingPersistence;
      }
      if (hasDraftAudioMedia(currentInputs)) {
        await persistDraftAudioInputs(
          sessionId,
          currentInputs,
          draftMediaStore,
          { downloadAsset },
        );
      }
      if (draftMediaPersistenceErrorRef.current) {
        const message =
          draftMediaPersistenceErrorRef.current.message ||
          "Local media could not be saved for browser reload.";
        showNotice(message, { error: true });
        throw new Error(message);
      }
      persistActiveDraft();
      return;
    }
    if (
      !dirty ||
      !isOwner ||
      !currentShader?.id
    ) {
      return;
    }
    if (conflictBlockedShaderRef.current === currentShader.id) {
      const message =
        "Review and explicitly save or duplicate your local edits before leaving this shader.";
      showNotice(message, { error: true });
      throw new Error(message);
    }
    if (
      pendingAgentCheckpointRef.current ||
      agentCheckpointSavingRef.current
    ) {
      const message = "Wait for the AI checkpoint to finish saving.";
      showNotice(message, { error: true });
      throw new Error(message);
    }
    await saveBeforeSessionChangeRef.current?.();
  }, [
    currentShader?.id,
    dirty,
    isOwner,
    persistActiveDraft,
    showNotice,
  ]);

  useEffect(() => {
    if (sessionKind === COMPOSITION_KIND) return;
    rememberLiveShaderSource({
      key: presetId,
      id: currentShader?.id || presetId,
      name: shaderName,
      kind: sessionKind,
      source,
      is_public: isPublic,
      features: mergeShaderFeatures(inferFeatures(source), { supportsAudio }),
    });
  }, [
    currentShader?.id,
    isPublic,
    presetId,
    rememberLiveShaderSource,
    sessionKind,
    shaderName,
    source,
    supportsAudio,
  ]);

  const activateShaderSession = useShaderSession({
    persistActiveDraft: persistBeforeSessionChange,
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
    effectPaintRef: effectFillRef,
    effectFillsRef,
    effectFillStoreRef: effectFillByPresetRef,
    sessionRef: draftSessionRef,
    activeDependencySnapshotsRef,
    setEffectFill,
    setEffectFills,
    setSupportsAudio,
    setDocumentInputs,
    inputApplyGenRef,
    sessionInputAppliedRef,
    navigationStartedAtRef,
    sessionRequestRef,
    onSessionLoadStart: beginSessionResourceLoad,
  });

  const buildPresentState = useCallback(() => {
    const nextKind = sessionKindRef.current;
    const nextValues = valuesRef.current;
    const nextInputs = normalizeDocumentInputs(documentInputsRef.current);
    const nextComposition =
      nextKind === COMPOSITION_KIND
        ? compositionWithLayerValues(
            compositionRef.current,
            selectedLayerIdRef.current,
            nextValues,
          )
        : {
            effectFills: effectFillsRef.current,
            effectFill: effectFillsRef.current[0] || null,
            inputs: nextInputs,
          };
    const document = captureDocumentSnapshot({
      source: sourceRef.current,
      kind: nextKind,
      parameterValues: nextValues,
      composition: nextComposition,
      effectFills: effectFillsRef.current,
      inputs: nextInputs,
    });
    const liveDependencies = new Map([
      ...Object.entries(resolvedShadersRef.current),
      ...liveShaderSourceRef.current,
    ]);
    const dependencySnapshots = { ...document.dependencySnapshots };
    for (const key of referencedShaderKeys(nextComposition)) {
      const dependency = liveDependencies.get(key);
      if (dependency?.source) dependencySnapshots[key] = dependency;
    }
    const itemId =
      routeId ||
      currentShader?.id ||
      (presetId.startsWith("cloud:")
        ? presetId.slice("cloud:".length)
        : presetId);

    return {
      id: itemId,
      sessionId: presetId,
      name: shaderName,
      description: shaderDescription,
      document: {
        ...document,
        composition: nextComposition,
        effectFills: effectFillsRef.current,
        dependencySnapshots,
      },
      pendingMedia,
      running,
      time: hostRef.current?.frame?.time || 0,
      canvasTheme,
    };
  }, [
    canvasTheme,
    captureDocumentSnapshot,
    composition,
    currentShader?.id,
    documentInputs,
    effectFills,
    pendingMedia,
    presetId,
    routeId,
    running,
    shaderDescription,
    shaderName,
    source,
    values,
  ]);
  presentStateRef.current = buildPresentState;

  const postPresentState = useCallback(() => {
    const channel = presentChannelRef.current;
    if (!channel || !presentReadyRef.current) return;
    try {
      channel.postMessage(
        presentMessage("state", presentStateRef.current?.()),
      );
    } catch (presentError) {
      reportAppError(
        presentError?.message || "Could not update the Present window.",
      );
    }
  }, [reportAppError]);

  const queuePresentState = useCallback(() => {
    if (
      presentSessionId ||
      !presentReadyRef.current ||
      presentSendTimerRef.current
    ) {
      return;
    }
    presentSendTimerRef.current = requestAnimationFrame(() => {
      presentSendTimerRef.current = 0;
      postPresentState();
    });
  }, [postPresentState, presentSessionId]);

  useEffect(() => {
    queuePresentState();
  }, [buildPresentState, queuePresentState]);

  const syncPresentPlayback = useCallback((playback) => {
    const host = hostRef.current;
    if (!host?.ready) return;
    if (playback) host.seek(playback.time, { present: "frame" });
    host.setActive(true);
    host.play();
    setRunning(true);
  }, []);

  const applyPresentState = useCallback(
    async (payload) => {
      const documentState = payload?.document;
      if (
        !presentSessionId ||
        !documentState ||
        typeof documentState !== "object" ||
        typeof documentState.source !== "string" ||
        !payload.id
      ) {
        return;
      }
      const generation = ++presentApplyGenerationRef.current;
      const nextKind =
        documentState.kind === COMPOSITION_KIND
          ? COMPOSITION_KIND
          : documentState.kind === "fill"
            ? "fill"
            : "effect";
      presentPlaybackRef.current = {
        running: Boolean(payload.running),
        time: Number.isFinite(payload.time) ? Math.max(0, payload.time) : 0,
      };
      playPreferenceRef.current = Boolean(payload.running);
      if (payload.canvasTheme === "dark" || payload.canvasTheme === "light") {
        setCanvasTheme(payload.canvasTheme);
      }
      document.title = `${payload.name || "Shader"} — Present`;
      setEmbedStatus("loading");
      await activateShaderSession({
        sessionId: `present:${presentSessionId}`,
        routeId: payload.id,
        name: payload.name || "Present",
        description: payload.description || "",
        source: documentState.source,
        kind: nextKind,
        composition: documentState.composition,
        values: documentState.parameterValues || {},
        public: false,
        media: payload.pendingMedia || null,
        dirty: false,
        cloudShader: {
          id: payload.id,
          name: payload.name || "Present",
          description: payload.description || "",
          source: documentState.source,
          kind: nextKind,
          composition: documentState.composition,
          parameter_values: documentState.parameterValues || {},
          features: documentState.features,
          dependency_snapshots: documentState.dependencySnapshots,
          is_public: false,
        },
        features: documentState.features,
        dependencySnapshots: documentState.dependencySnapshots,
        persistPrevious: false,
      });
      if (generation !== presentApplyGenerationRef.current) return;
      syncPresentPlayback(presentPlaybackRef.current);
      setEmbedStatus("ready");
    },
    [activateShaderSession, presentSessionId, syncPresentPlayback],
  );

  useEffect(() => {
    if (!presentSessionId) return undefined;
    if (typeof BroadcastChannel !== "function") {
      setEmbedStatus("unavailable");
      return undefined;
    }
    const channel = new BroadcastChannel(
      presentChannelName(presentSessionId),
    );
    presentChannelRef.current = channel;
    let disposed = false;
    let receivedState = false;
    const announceReady = () => {
      if (!receivedState) channel.postMessage(presentMessage("ready"));
    };
    const announcePopupClosed = () => {
      channel.postMessage(presentMessage("popup-closed"));
    };
    window.addEventListener("pagehide", announcePopupClosed);
    channel.addEventListener("message", (event) => {
      if (isPresentMessage(event.data, "closed")) {
        presentApplyGenerationRef.current += 1;
        hostRef.current?.pause();
        setRunning(false);
        setEmbedStatus("unavailable");
        return;
      }
      if (!isPresentMessage(event.data, "state")) return;
      receivedState = true;
      window.clearInterval(readyTimer);
      window.clearTimeout(unavailableTimer);
      applyPresentState(event.data.payload).catch((presentError) => {
        if (disposed) return;
        setError(presentError?.message || String(presentError));
        setEmbedStatus("unavailable");
      });
    });
    announceReady();
    const readyTimer = window.setInterval(announceReady, 250);
    const unavailableTimer = window.setTimeout(() => {
      if (!receivedState) setEmbedStatus("unavailable");
    }, 5000);
    return () => {
      disposed = true;
      window.removeEventListener("pagehide", announcePopupClosed);
      window.clearInterval(readyTimer);
      window.clearTimeout(unavailableTimer);
      channel.close();
      if (presentChannelRef.current === channel) {
        presentChannelRef.current = null;
      }
    };
  }, [applyPresentState, presentSessionId]);

  useEffect(() => {
    if (
      !presentSessionId ||
      embedStatus !== "ready" ||
      !runtimeReady ||
      sessionResourcesLoading
    ) {
      return;
    }
    const playback = presentPlaybackRef.current;
    syncPresentPlayback(playback);
  }, [
    embedStatus,
    presentSessionId,
    runtimeReady,
    sessionResourcesLoading,
    source,
    syncPresentPlayback,
  ]);

  useEffect(
    () => {
      const announceClosed = () => {
        if (!presentSessionId) {
          presentChannelRef.current?.postMessage(presentMessage("closed"));
        }
      };
      window.addEventListener("pagehide", announceClosed);
      return () => {
        window.removeEventListener("pagehide", announceClosed);
        announceClosed();
        if (presentSendTimerRef.current) {
          cancelAnimationFrame(presentSendTimerRef.current);
        }
        if (presentWindowPollRef.current) {
          window.clearInterval(presentWindowPollRef.current);
        }
        if (presentRestoreFrameRef.current) {
          cancelAnimationFrame(presentRestoreFrameRef.current);
        }
        presentChannelRef.current?.close();
      };
    },
    [presentSessionId],
  );

  const setEditorPreviewSuspended = useCallback((suspended) => {
    if (presentRestoreFrameRef.current) {
      cancelAnimationFrame(presentRestoreFrameRef.current);
      presentRestoreFrameRef.current = 0;
    }
    presentWindowOpenRef.current = suspended;
    setPresentWindowOpen(suspended);
    const host = hostRef.current;
    if (!host) return;
    if (suspended) {
      host.pause();
      host.setActive(false);
      return;
    }
    presentRestoreFrameRef.current = requestAnimationFrame(() => {
      presentRestoreFrameRef.current = 0;
      if (presentWindowOpenRef.current) return;
      const currentHost = hostRef.current;
      if (!currentHost) return;
      const stage = visualizerRef.current?.getBoundingClientRect();
      if (stage?.width > 0 && stage?.height > 0) {
        currentHost.setStageCssSize(stage.width, stage.height);
      }
      currentHost.setActive(true);
      if (playPreferenceRef.current) {
        currentHost.play();
        setRunning(true);
      } else {
        currentHost.redraw();
        setRunning(false);
      }
    });
  }, []);

  useLayoutEffect(() => {
    if (!presentWindowOpen) return;
    const host = hostRef.current;
    host?.pause();
    host?.setActive(false);
  }, [
    composition,
    documentInputs,
    effectFills,
    presentWindowOpen,
    runtimeReady,
    source,
    values,
  ]);

  const stopPresentWindow = useCallback(
    (channel = presentChannelRef.current) => {
      if (presentWindowPollRef.current) {
        window.clearInterval(presentWindowPollRef.current);
        presentWindowPollRef.current = 0;
      }
      presentReadyRef.current = false;
      channel?.close();
      if (presentChannelRef.current === channel) {
        presentChannelRef.current = null;
      }
      presentWindowRef.current = null;
      setEditorPreviewSuspended(false);
    },
    [setEditorPreviewSuspended],
  );

  const openPresentWindow = useCallback(() => {
    if (presentSessionId) return;
    if (typeof BroadcastChannel !== "function") {
      reportAppError("This browser cannot open a live Present window.");
      return;
    }
    const existing = presentWindowRef.current;
    if (existing && !existing.closed && presentChannelRef.current) {
      setEditorPreviewSuspended(true);
      existing.focus();
      postPresentState();
      return;
    }

    presentChannelRef.current?.close();
    presentReadyRef.current = false;
    const sessionId = createPresentSessionId();
    const channel = new BroadcastChannel(presentChannelName(sessionId));
    presentChannelRef.current = channel;
    channel.addEventListener("message", (event) => {
      if (isPresentMessage(event.data, "popup-closed")) {
        stopPresentWindow(channel);
        return;
      }
      if (!isPresentMessage(event.data, "ready")) return;
      presentReadyRef.current = true;
      postPresentState();
    });
    const currentState = buildPresentState();
    const url = makePresentUrl(
      makeEmbedUrl(currentState.id, currentState.document.kind),
      sessionId,
    );
    const popup = window.open(
      url,
      "shader-studio-present",
      "popup=yes,width=1280,height=800",
    );
    if (!popup) {
      channel.close();
      presentChannelRef.current = null;
      reportAppError(
        "The Present window was blocked. Allow popups and try again.",
      );
      return;
    }
    presentWindowRef.current = popup;
    setEditorPreviewSuspended(true);
    if (presentWindowPollRef.current) {
      window.clearInterval(presentWindowPollRef.current);
    }
    presentWindowPollRef.current = window.setInterval(() => {
      if (popup.closed) stopPresentWindow(channel);
    }, 500);
    popup.focus();
  }, [
    buildPresentState,
    postPresentState,
    presentSessionId,
    reportAppError,
    setEditorPreviewSuspended,
    stopPresentWindow,
  ]);

  const openDraft = useCallback(
    async (draft) => {
      setShaderRoute(draft.id, draft.kind);
      if (draftSessionRef.current.presetId === draft.id) return;
      beginSessionResourceLoad(draft.id);
      let hydratedDraft;
      try {
        hydratedDraft = await hydrateLocalDraftMedia(draft);
      } catch (error) {
        finishSessionResourceLoad(draft.id);
        throw error;
      }
      setShaderRoute(hydratedDraft.id, hydratedDraft.kind);
      await activateShaderSession({
        sessionId: hydratedDraft.id,
        name: hydratedDraft.name,
        description: hydratedDraft.description || "",
        source: hydratedDraft.source,
        kind: hydratedDraft.kind,
        composition: hydratedDraft.composition,
        values: hydratedDraft.values || {},
        public: hydratedDraft.isPublic,
        media: hydratedDraft.pendingMedia || null,
        dependencySnapshots: hydratedDraft.dependencySnapshots,
        features: hydratedDraft.features,
        dirty: true,
      });
    },
    [
      activateShaderSession,
      beginSessionResourceLoad,
      finishSessionResourceLoad,
      setShaderRoute,
    ],
  );

  const createDraft = useCallback(
    async (starterId) => {
      await persistBeforeSessionChange();
      const preset = getPreset(starterId);
      const id = `draft:${crypto.randomUUID()}`;
      const draft = {
        id,
        name: preset.name,
        description: "",
        kind: preset.kind,
        source: preset.source,
        values: {},
        isPublic: false,
        pendingMedia: null,
      };
      if (user) {
        const documentSnapshot = buildShaderDocumentSnapshot({
          source: draft.source,
          kind: draft.kind,
          parameterValues: draft.values,
          effectFills:
            draft.kind === "effect" ? [fillFromInputSource("image")] : [],
        });
        const saved = await createShader({
          id: cloudIdForDraft(id),
          owner_id: user.id,
          name: draft.name,
          description: draft.description,
          ...buildShaderDocumentPayload(documentSnapshot),
          is_public: false,
        });
        setCloudShaders((current) => [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
        lastSavedFingerprintRef.current = editorPersistenceFingerprint(
          buildShaderDocumentSnapshot(saved),
          { name: saved.name, description: saved.description }
        );
        await activateShaderSession({
          sessionId: cloudChoiceId(saved.id),
          routeId: saved.id,
          name: saved.name,
          description: saved.description || "",
          source: saved.source,
          kind: saved.kind,
          composition: saved.composition,
          values: saved.parameter_values || {},
          dirty: false,
          cloudShader: saved,
          persistPrevious: false,
        });
        return;
      }
      setDrafts((current) => [draft, ...current]);
      await activateShaderSession({
        sessionId: id,
        name: draft.name,
        description: draft.description,
        source: draft.source,
        kind: draft.kind,
        dirty: true,
        persistPrevious: false,
      });
    },
    [activateShaderSession, persistBeforeSessionChange, user],
  );

  const createCompositionDraft = useCallback(async () => {
    await persistBeforeSessionChange();
    const graph = emptyComposition();
    const id = `draft:${crypto.randomUUID()}`;
    const draft = {
      id,
      name: "New Composer",
      description: "",
      kind: COMPOSITION_KIND,
      source: "",
      values: {},
      composition: graph,
      isPublic: false,
      pendingMedia: null,
    };
    const openLocal = async () => {
      setDrafts((current) => [draft, ...current.filter((item) => item.id !== id)]);
      await activateShaderSession({
        sessionId: id,
        name: draft.name,
        description: draft.description,
        source: "",
        kind: COMPOSITION_KIND,
        composition: graph,
        dirty: true,
        persistPrevious: false,
      });
    };
    try {
      if (user) {
        try {
          const documentSnapshot = buildShaderDocumentSnapshot({
            kind: COMPOSITION_KIND,
            composition: graph,
            features: { isAnimated: false, usesMouse: false },
          });
          const saved = await createShader({
            id: cloudIdForDraft(id),
            owner_id: user.id,
            name: draft.name,
            description: draft.description,
            ...buildShaderDocumentPayload(documentSnapshot),
            is_public: false,
          });
          setCloudShaders((current) => [
            saved,
            ...current.filter((item) => item.id !== saved.id),
          ]);
          lastSavedFingerprintRef.current = editorPersistenceFingerprint(
            buildShaderDocumentSnapshot(saved),
            { name: saved.name, description: saved.description }
          );
          await activateShaderSession({
            sessionId: cloudChoiceId(saved.id),
            routeId: saved.id,
            name: saved.name,
            description: saved.description || "",
            source: "",
            kind: COMPOSITION_KIND,
            composition: saved.composition || graph,
            values: {},
            dirty: false,
            cloudShader: saved,
            persistPrevious: false,
          });
          return;
        } catch (cloudError) {
          await openLocal();
          showNotice(
            formatSupabaseError(
              cloudError,
              "Created a local composition. Apply the compositions database migration to save it to the cloud."
            ),
            { error: true }
          );
          return;
        }
      }
      await openLocal();
    } catch (error) {
      const message = error.message || "Could not create composition";
      showNotice(message, { error: true });
    }
  }, [activateShaderSession, persistBeforeSessionChange, showNotice, user]);

  const openFigmaShader = useCallback(
    async (id) => {
      const detail = await getFigmaShader(id);
      const sourceText = detail.mainTs;
      const name = detail.name || "Figma Shader";
      const description =
        typeof detail.description === "string" ? detail.description : "";
      const shaderKind = detail.kind === "fill" ? "fill" : "effect";
      const documentSnapshot = buildShaderDocumentSnapshot({
        source: sourceText,
        kind: shaderKind,
        parameterValues: {},
        effectFills: [],
        features: inferFeatures(sourceText),
      });
      const isWritableFigmaShader = detail.owner !== "figma";
      const link = isWritableFigmaShader
        ? {
            figma_shader_id: detail.id,
            figma_shader_kind: shaderKind,
            figma_shader_version: detail.version || null,
          }
        : {};

      await persistBeforeSessionChange();
      pendingValuesRef.current = {};
      hostRef.current?.pause();
      setRunning(playPreferenceRef.current);
      setError(null);
      setIsPublic(false);
      setPendingMedia(null);
      setDirty(true);
      setShaderName(name);
      setShaderDescription(description);
      setSource(sourceText);
      setSessionKind(shaderKind);
      setComposition(null);

      if (user) {
        const existing = isWritableFigmaShader
          ? cloudShaders.find(
              (item) =>
                item.owner_id === user.id &&
                item.figma_shader_id === detail.id &&
                item.figma_shader_kind === shaderKind
            )
          : null;
        let saved;
        if (existing) {
          const current = existing.source
            ? existing
            : { ...existing, ...(await getShader(existing.id)) };
          saved = await shaderSaveQueue.enqueue(existing.id, async () => {
            const result = await withExclusiveShaderSave(existing.id, async () => {
              const stateSaved = await saveShaderState({
                shaderId: existing.id,
                expectedStateRevision: expectedStateRevision(
                  committedStateRevisionsRef.current,
                  current,
                ),
                ...buildShaderStateSavePayload(documentSnapshot),
                checkpointKind: "manual",
                summary: `Imported ${name} from Figma`,
              });
              rememberStateRevision(
                committedStateRevisionsRef.current,
                stateSaved,
              );
              setCloudShaders((rows) =>
                rows.map((row) =>
                  row.id === stateSaved.id
                    ? { ...row, ...stateSaved }
                    : row,
                ),
              );
              return updateShader(
                existing.id,
                {
                  name,
                  description,
                  ...link,
                },
                { expectedStateRevision: stateSaved.state_revision },
              );
            });
            return result.value;
          });
        } else {
          saved = await createShader({
            owner_id: user.id,
            name,
            description,
            ...buildShaderDocumentPayload(documentSnapshot),
            is_public: false,
            ...link,
          });
        }
        setCloudShaders((current) => [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
        lastSavedFingerprintRef.current = editorPersistenceFingerprint(
          buildShaderDocumentSnapshot(saved),
          { name: saved.name, description: saved.description }
        );
        await activateShaderSession({
          sessionId: cloudChoiceId(saved.id),
          routeId: saved.id,
          name: saved.name,
          description: saved.description || "",
          source: saved.source,
          kind: saved.kind,
          values: saved.parameter_values || {},
          cloudShader: saved,
          dirty: false,
          persistPrevious: false,
        });
        return;
      }

      const draftId = `draft:${crypto.randomUUID()}`;
      const draft = {
        id: draftId,
        name,
        description,
        kind: shaderKind,
        source: sourceText,
        values: {},
        isPublic: false,
        pendingMedia: null,
        ...link,
      };
      setDrafts((current) => [draft, ...current]);
      await activateShaderSession({
        sessionId: draftId,
        name,
        description,
        source: sourceText,
        kind: shaderKind,
        dirty: true,
        persistPrevious: false,
      });
    },
    [
      activateShaderSession,
      cloudShaders,
      persistBeforeSessionChange,
      user,
    ]
  );

  const openCloudShader = useCallback(
    async (
      shader,
      { requireAccessible = false, expectedKind = undefined } = {}
    ) => {
      if (
        !requireAccessible &&
        draftSessionRef.current.presetId === cloudChoiceId(shader.id)
      ) {
        setEditorRouteError((current) =>
          current?.id === shader.id ? null : current
        );
        setShaderRoute(shader.id, shader.kind);
        return;
      }
      const requestId = ++sessionRequestRef.current;
      const loadingSessionId = cloudChoiceId(shader.id);
      beginSessionResourceLoad(loadingSessionId);
      navigationStartedAtRef.current = perfNow();
      try {
        const fetchStartedAt = perfNow();
        recordPerf(
          shader.source
            ? "navigation.getShader.cacheHit"
            : "navigation.getShader.request",
        );
        let fullShader = shader;
        if (requireAccessible || !shader.source) {
          const fetchedShader = await getShaderMaybe(shader.id);
          if (!fetchedShader) {
            throw new Error("This shader is private, missing, or unavailable.");
          }
          fullShader = { ...shader, ...fetchedShader };
        }
        measurePerf("navigation.getShader", fetchStartedAt);
        if (requestId !== sessionRequestRef.current) return;
        if (requireAccessible) {
          const expectedComposition = expectedKind === COMPOSITION_KIND;
          const actualComposition = fullShader.kind === COMPOSITION_KIND;
          if (
            (expectedKind !== undefined &&
              expectedComposition !== actualComposition) ||
            (!actualComposition && !fullShader.source)
          ) {
            throw new Error("The requested embed is unavailable.");
          }
          if (actualComposition) {
            const dependencyIds = compositionCloudIds(fullShader.composition);
            if (!dependencyIds) {
              throw new Error("The requested embed is unavailable.");
            }
            const refs = referencedShaderKeys(
              normalizeComposition(fullShader.composition)
            );
            const allRefsPinned = refs.every(
              (key) =>
                typeof dependencySnapshotForKey(
                  fullShader.dependency_snapshots,
                  key
                )?.source === "string"
            );
            if (!allRefsPinned) {
              const dependencies = dependencyIds.length
                ? await getShadersByIds(dependencyIds)
                : [];
              const dependenciesById = new Map(
                dependencies.map((row) => [row.id, row])
              );
              if (
                dependencyIds.some((id) => {
                  const row = dependenciesById.get(id);
                  return (
                    !row ||
                    row.kind === COMPOSITION_KIND ||
                    !row.source
                  );
                })
              ) {
                throw new Error("The requested embed is unavailable.");
              }
            }
          }
        }
        activeDependencySnapshotsRef.current =
          fullShader.dependency_snapshots &&
          typeof fullShader.dependency_snapshots === "object"
            ? structuredClone(fullShader.dependency_snapshots)
            : {};
        setCloudShaders((current) => cacheFullShaderRow(current, fullShader));
        const savedDocument = buildShaderDocumentSnapshot(fullShader);
        lastSavedFingerprintRef.current = editorPersistenceFingerprint(
          savedDocument,
          {
            name: fullShader.name,
            description: fullShader.description,
          }
        );
        const sessionComposition = cloudSessionComposition(fullShader, {
          defaultImageUrl: defaultInputUrl,
        });
        const hydratedComposition = await activateBeforeHydration({
          session: {
            sessionId: cloudChoiceId(fullShader.id),
            routeId: fullShader.id,
            name: fullShader.name,
            description: fullShader.description || "",
            source: fullShader.source || "",
            kind: fullShader.kind,
            composition: sessionComposition,
            values: fullShader.parameter_values || {},
            public: fullShader.is_public,
            cloudShader: fullShader,
            requestId,
          },
          activate: activateShaderSession,
          hydrate: hydrateCompositionMediaUrls,
          isCurrent: () => requestId === sessionRequestRef.current,
        });
        if (!hydratedComposition || requestId !== sessionRequestRef.current) {
          return;
        }
        setEditorRouteError((current) =>
          current?.id === fullShader.id ? null : current
        );
        if (fullShader.kind === COMPOSITION_KIND) {
          const nextComposition = normalizeComposition(hydratedComposition);
          compositionRef.current = nextComposition;
          setComposition(nextComposition);
          setDocumentInputs(normalizeDocumentInputs(nextComposition.inputs));
        } else {
          const nextEffectFills =
            readEffectFillsFromComposition(hydratedComposition);
          effectFillsRef.current = nextEffectFills;
          setEffectFills(nextEffectFills);
          setDocumentInputs(readDocumentInputs(hydratedComposition));
        }
        setSupportsAudio(Boolean(fullShader.features?.supportsAudio));
      } catch (openError) {
        if (requestId !== sessionRequestRef.current) return;
        finishSessionResourceLoad(loadingSessionId);
        navigationStartedAtRef.current = 0;
        if (requireAccessible) throw openError;
        const message = openError.message || String(openError);
        if (message === "This shader is private, missing, or unavailable.") {
          setEditorRouteError({ id: shader.id, message });
        } else {
          reportAppError(message);
        }
      }
    },
    [
      activateShaderSession,
      beginSessionResourceLoad,
      finishSessionResourceLoad,
      setShaderRoute,
    ],
  );

  const cloudThumbnailPathsRef = useRef({});
  const cloudThumbnailBucketsRef = useRef({});
  const cloudThumbnailExpiriesRef = useRef({});
  const hydratedLibraryScopeRef = useRef(null);
  const skipNextLibraryCacheWriteRef = useRef(false);
  const libraryRefreshRef = useRef(null);
  const thumbnailRecoveryAttemptsRef = useRef(new Map());
  const libraryScope = libraryCacheScope(userId);

  const refreshLibrary = useCallback(async () => {
    if (!authConfigured) {
      cloudThumbnailPathsRef.current = {};
      cloudThumbnailBucketsRef.current = {};
      cloudThumbnailExpiriesRef.current = {};
      setCloudShadersState([]);
      setCloudThumbnails({});
      setCloudSmallThumbnails({});
      return;
    }
    const refreshEpoch = libraryMutationEpochRef.current;
    try {
      // Row-level security returns public shaders to everyone and adds the
      // current user's private drafts when signed in.
      const shaders = await listShaders();
      const now = Date.now();
      const rowsToRefresh = [];
      for (const shader of shaders) {
        const id = shader.id;
        const path = shader.thumbnail_path || null;
        const bucket = shader.thumbnail_bucket || ASSET_BUCKET;
        const publicThumbnail = bucket === THUMBNAIL_BUCKET;
        const reusable =
          path &&
          cloudThumbnailPathsRef.current[id] === path &&
          cloudThumbnailBucketsRef.current[id] === bucket &&
          cloudThumbnailsRef.current[id] &&
          cloudThumbnailExpiriesRef.current[id] > now;
        if (path && (publicThumbnail || !reusable)) rowsToRefresh.push(shader);
      }
      const { full: urlsById, small: smallUrlsById } =
        await getThumbnailUrls(rowsToRefresh);
      if (
        !libraryRefreshIsCurrent(
          refreshEpoch,
          libraryMutationEpochRef.current,
        )
      ) {
        window.setTimeout(() => libraryRefreshRef.current?.(), 0);
        return;
      }
      setCloudShadersState((current) =>
        reconcileLibraryShaders(current, shaders),
      );
      const previous = cloudThumbnailsRef.current;
      const previousSmall = cloudSmallThumbnailsRef.current;
      const nextPathById = {};
      const nextBucketById = {};
      const nextExpiryById = {};
      const next = {};
      const nextSmall = {};
      let thumbnailsChanged =
        Object.keys(previous).length !== shaders.length;
      for (const shader of shaders) {
        const path = shader.thumbnail_path || null;
        const bucket = shader.thumbnail_bucket || ASSET_BUCKET;
        nextPathById[shader.id] = path;
        nextBucketById[shader.id] = bucket;
        if (
          path &&
          cloudThumbnailPathsRef.current[shader.id] === path &&
          cloudThumbnailBucketsRef.current[shader.id] === bucket &&
          previous[shader.id] &&
          cloudThumbnailExpiriesRef.current[shader.id] > now
        ) {
          next[shader.id] = previous[shader.id];
          nextSmall[shader.id] =
            previousSmall[shader.id] || previous[shader.id];
          nextExpiryById[shader.id] =
            cloudThumbnailExpiriesRef.current[shader.id];
          continue;
        }
        const url = path
          ? urlsById[shader.id] ||
            (cloudThumbnailPathsRef.current[shader.id] === path
              ? previous[shader.id] || null
              : null)
          : null;
        next[shader.id] = url;
        nextSmall[shader.id] =
          smallUrlsById[shader.id] ||
          (cloudThumbnailPathsRef.current[shader.id] === path
            ? previousSmall[shader.id] || url
            : url);
        if (url) {
          nextExpiryById[shader.id] =
            bucket === THUMBNAIL_BUCKET
              ? Number.MAX_SAFE_INTEGER
              : Date.now() + LIBRARY_THUMBNAIL_URL_TTL_MS;
        }
        if (url !== previous[shader.id]) thumbnailsChanged = true;
      }
      for (const id of Object.keys(previous)) {
        if (!(id in next)) thumbnailsChanged = true;
      }
      const nextThumbnails = thumbnailsChanged ? next : previous;
      cloudThumbnailsRef.current = nextThumbnails;
      cloudSmallThumbnailsRef.current = nextSmall;
      cloudThumbnailPathsRef.current = nextPathById;
      cloudThumbnailBucketsRef.current = nextBucketById;
      cloudThumbnailExpiriesRef.current = nextExpiryById;
      setCloudThumbnails(nextThumbnails);
      setCloudSmallThumbnails(nextSmall);
      writeLibrarySessionCache({
        scope: libraryScope,
        shaders,
        thumbnails: nextThumbnails,
        smallThumbnails: nextSmall,
        thumbnailPaths: nextPathById,
        thumbnailExpiries: nextExpiryById,
      });
    } catch (libraryError) {
      const message = formatSupabaseError(
        libraryError,
        "Could not load shaders from the server."
      );
      showNotice(message, { error: true });
    }
  }, [authConfigured, libraryScope, showNotice]);
  libraryRefreshRef.current = refreshLibrary;

  const recoverCloudThumbnail = useCallback((shaderId) => {
    if (!shaderId) return;
    const now = Date.now();
    const previousAttempt =
      thumbnailRecoveryAttemptsRef.current.get(shaderId) || 0;
    if (now - previousAttempt < 15_000) return;
    thumbnailRecoveryAttemptsRef.current.set(shaderId, now);
    cloudThumbnailExpiriesRef.current[shaderId] = 0;
    libraryRefreshRef.current?.();
  }, []);

  useEffect(() => {
    if (routeEmbed || authLoading) return undefined;
    const now = Date.now();
    const expiries = Object.values(cloudThumbnailExpiriesRef.current).filter(
      (expiry) => Number.isFinite(expiry) && expiry < Number.MAX_SAFE_INTEGER,
    );
    if (!expiries.length) return undefined;
    const earliestExpiry = Math.min(...expiries);
    const delay = Math.max(30_000, earliestExpiry - now - 60_000);
    const timer = window.setTimeout(
      () => libraryRefreshRef.current?.(),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [authLoading, cloudShaders, cloudThumbnails, routeEmbed]);

  useEffect(() => {
    if (routeEmbed || authLoading) return undefined;
    const timer = window.setInterval(
      () => libraryRefreshRef.current?.(),
      LIBRARY_ROW_CACHE_FRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, [authLoading, routeEmbed]);

  useLayoutEffect(() => {
    if (routeEmbed || authLoading) return;
    let cacheIsFresh = false;
    if (hydratedLibraryScopeRef.current !== libraryScope) {
      const cached = readLibrarySessionCache({ scope: libraryScope });
      const cacheHasMissingThumbnails = (cached?.shaders || []).some(
        (shader) => shader.thumbnail_path && !cached?.thumbnails?.[shader.id],
      );
      cacheIsFresh =
        libraryCacheIsFresh(cached?.savedAt) && !cacheHasMissingThumbnails;
      hydratedLibraryScopeRef.current = libraryScope;
      skipNextLibraryCacheWriteRef.current = true;
      setCloudShadersState(cached?.shaders || []);
      setCloudThumbnails(cached?.thumbnails || {});
      setCloudSmallThumbnails(
        cached?.smallThumbnails || cached?.thumbnails || {},
      );
      cloudSmallThumbnailsRef.current =
        cached?.smallThumbnails || cached?.thumbnails || {};
      cloudThumbnailPathsRef.current = cached?.thumbnailPaths || {};
      cloudThumbnailBucketsRef.current = Object.fromEntries(
        (cached?.shaders || []).map((shader) => [
          shader.id,
          shader.thumbnail_bucket || ASSET_BUCKET,
        ]),
      );
      cloudThumbnailExpiriesRef.current = cached?.thumbnailExpiries || {};
    }
    if (!cacheIsFresh) refreshLibrary();
  }, [authLoading, libraryScope, refreshLibrary, routeEmbed]);

  useEffect(() => {
    if (
      routeEmbed ||
      authLoading ||
      hydratedLibraryScopeRef.current !== libraryScope
    ) {
      return;
    }
    if (skipNextLibraryCacheWriteRef.current) {
      skipNextLibraryCacheWriteRef.current = false;
      return;
    }
    writeLibrarySessionCache({
      scope: libraryScope,
      shaders: cloudShaders,
      thumbnails: cloudThumbnails,
      smallThumbnails: cloudSmallThumbnails,
      thumbnailPaths: cloudThumbnailPathsRef.current,
      thumbnailExpiries: cloudThumbnailExpiriesRef.current,
    });
  }, [
    authLoading,
    cloudShaders,
    cloudSmallThumbnails,
    cloudThumbnails,
    libraryScope,
    routeEmbed,
  ]);

  useEffect(() => {
    if (routeEmbed) return;
    if (!user) {
      migratedUserRef.current = null;
      migrationInFlightUserRef.current = null;
      migrationRetryAttemptRef.current = 0;
      window.clearTimeout(migrationRetryTimerRef.current);
      return;
    }
    const migrationDrafts = draftsRef.current;
    if (
      authLoading ||
      migratedUserRef.current === user.id ||
      migrationInFlightUserRef.current === user.id ||
      migrationDrafts.length === 0
    ) {
      if (!authLoading && migrationDrafts.length === 0) {
        migratedUserRef.current = user.id;
      }
      return;
    }
    migrationInFlightUserRef.current = user.id;
    let cancelled = false;
    const scheduleRetry = () => {
      window.clearTimeout(migrationRetryTimerRef.current);
      const attempt = migrationRetryAttemptRef.current;
      const delay = Math.min(30000, 3000 * 2 ** attempt);
      migrationRetryAttemptRef.current = attempt + 1;
      migrationRetryTimerRef.current = window.setTimeout(() => {
        migrationRetryTimerRef.current = 0;
        setMigrationRetryRevision((revision) => revision + 1);
      }, delay);
    };

    const migrate = async () => {
      const remaining = [];
      const migrated = [];
      let activeMigration = null;
      let lastError = null;
      const activeRouteId = getShaderRouteId();

      for (const draft of orderDraftsForMigration(migrationDrafts)) {
        const editorActive = draft.id === draftSessionRef.current.presetId;
        const active =
          editorActive || draft.id === activeRouteId;
        try {
          const hydratedDraft = await hydrateLocalDraftMedia(draft);
          const session = editorActive
            ? {
                ...hydratedDraft,
                ...draftSessionRef.current,
                pendingMedia:
                  draftSessionRef.current.pendingMedia ||
                  hydratedDraft.pendingMedia ||
                  null,
                dependencySnapshots: structuredClone(
                  activeDependencySnapshotsRef.current || {},
                ),
              }
            : hydratedDraft;
          const cloudId = cloudIdForDraft(draft.id);
          const isComposition =
            resolvedLibraryKind({
              kind: session.kind || draft.kind,
              composition: session.composition || draft.composition,
            }) === COMPOSITION_KIND;
          const source = isComposition
            ? ""
            : session.source || draft.source || "";
          const graph = isComposition
            ? promoteCompositionRefs(
                normalizeComposition(session.composition || draft.composition),
                [...cloudShadersRef.current, ...migrated]
              )
            : null;
          const draftEffectFills =
            !isComposition && detectKind(source) === "effect"
              ? session.effectFills ||
                draft.effectFills ||
                readEffectFillsFromComposition(
                  session.composition || draft.composition
                )
              : [];
          const effectFills =
            draftEffectFills.length > 0
              ? promoteCompositionRefs(
                  normalizeComposition({
                    fills: draftEffectFills,
                    effects: [],
                  }),
                  [...cloudShadersRef.current, ...migrated]
                ).fills
              : [];
          const liveFills = isComposition ? graph.fills : effectFills;
          assertLocalFillMediaAvailable(
            liveFills,
            `Could not recover local media for ${draft.name}. Choose the media again before syncing.`,
          );
          const stackedMedia = fillMediaEntries(liveFills);
          let durableFills = persistableEffectFills(liveFills);
          let durableInput = { path: null, name: null, mimeType: null };
          for (const { fill, url } of stackedMedia) {
            const file = await fileFromBlobUrl(url);
            if (!file) {
              throw new Error(
                `Could not recover local media for ${draft.name}.`
              );
            }
            const contentType = mediaType(file);
            const roleId = String(fill.id || "fill").replace(
              /[^a-zA-Z0-9_-]/g,
              "-"
            );
            const assetPath = await uploadAsset({
              ownerId: user.id,
              shaderId: cloudId,
              role: `fill-${roleId}`,
              blob: file,
              fileName: file.name,
              contentType,
            });
            durableFills = durableFills.map((item) =>
              item.id === fill.id ? withFillAssetPath(item, assetPath) : item
            );
            if (!durableInput.path) {
              durableInput = {
                path: assetPath,
                name: file.name,
                mimeType: contentType,
              };
            }
          }
          const media =
            !stackedMedia.length && detectKind(source) === "effect"
              ? session.pendingMedia
              : null;
          if (media) {
            const contentType = mediaType(media);
            const assetPath = await uploadAsset({
              ownerId: user.id,
              shaderId: cloudId,
              role: "input",
              blob: media,
              fileName: media.name,
              contentType,
            });
            durableInput = {
              path: assetPath,
              name: media.name,
              mimeType: contentType,
            };
          }
          const migratedKind = isComposition
            ? COMPOSITION_KIND
            : detectKind(source);
          const liveInputs = editorActive
            ? liveSessionInputs(
                migratedKind,
                compositionRef.current,
                documentInputsRef.current,
              )
            : readDocumentInputs(
                hydratedDraft.composition ||
                  session.composition ||
                  draft.composition,
              );
          const durableInputs = await uploadDocumentInputAudio({
            inputs: liveInputs,
            ownerId: user.id,
            shaderId: cloudId,
            fileFromUrl: fileFromBlobUrl,
            downloadAsset,
            uploadAsset,
            mediaType,
            maxBytes: MAX_MEDIA_BYTES,
          });
          const durableComposition = compositionWithDocumentInputs(
            migratedKind,
            graph || {},
            durableFills,
            durableInputs,
          );
          const dependencyGraph = isComposition
            ? durableComposition
            : normalizeComposition({ fills: durableFills, effects: [] });
          const dependencySnapshots = buildCompositionDependencySnapshots({
            graph: dependencyGraph,
            resolvedByKey: new Map(
              Object.entries(resolvedShadersRef.current),
            ),
            liveByKey: liveShaderSourceRef.current,
            cloudRows: [...cloudShadersRef.current, ...migrated],
            existingSnapshots:
              session.dependencySnapshots ||
              draft.dependencySnapshots ||
              {},
          });
          const documentSnapshot = buildShaderDocumentSnapshot({
            source,
            kind: isComposition ? COMPOSITION_KIND : detectKind(source),
            parameterValues: session.values || draft.values || {},
            composition: durableComposition,
            effectFills: durableFills,
            input: durableInput,
            features: mergeShaderFeatures(
              isComposition
                ? collectCompositionFeatures(
                    graph,
                    resolvedByKeyWithDependencySnapshots(
                      new Map(Object.entries(resolvedShadersRef.current)),
                      dependencySnapshots,
                    ),
                  )
                : inferFeatures(source),
              {
                supportsAudio: Boolean(
                  session.features?.supportsAudio || draft.features?.supportsAudio,
                ),
              },
            ),
            dependencySnapshots,
          });
          const payload = {
            id: cloudId,
            owner_id: user.id,
            name:
              (typeof session.shaderName === "string"
                ? session.shaderName.trim()
                : draft.name) || "Untitled Shader",
            description:
              typeof session.shaderDescription === "string"
                ? session.shaderDescription
                : draft.description || "",
            ...buildShaderDocumentPayload(documentSnapshot),
            is_public: false,
            ...figmaShaderLink(editorActive ? session : draft),
          };
          const existing = await getShaderMaybe(cloudId);
          let saved;
          if (existing) {
            saved = await shaderSaveQueue.enqueue(existing.id, async () => {
              const result = await withExclusiveShaderSave(existing.id, async () => {
                const stateSaved = await saveShaderState({
                  shaderId: existing.id,
                  expectedStateRevision: existing.state_revision,
                  ...buildShaderStateSavePayload(documentSnapshot),
                  checkpointDependencySnapshots: dependencySnapshots,
                  checkpointKind: "manual",
                  summary: "Migrated local draft",
                });
                return updateShader(
                  existing.id,
                  {
                    name: payload.name,
                    description: payload.description,
                    ...figmaShaderLink(editorActive ? session : draft),
                  },
                  { expectedStateRevision: stateSaved.state_revision },
                );
              });
              return result.value;
            });
          } else {
            saved = await createShader(payload);
          }
          const assetChanges = {};
          const thumbnailData =
            thumbnailDataUrlsRef.current[draft.id] || draft.thumbnail;
          if (thumbnailData?.startsWith("data:image/")) {
            const thumbnailBlob = await fetch(thumbnailData).then((response) =>
              response.blob()
            );
            Object.assign(assetChanges, await uploadThumbnailVariants({
              ownerId: user.id,
              shaderId: saved.id,
              blob: thumbnailBlob,
              public: false,
            }));
          }

          if (Object.keys(assetChanges).length) {
            saved = await updateShader(saved.id, assetChanges, {
              expectedStateRevision: saved.state_revision,
            });
          }
          if (cancelled) continue;
          const sourceThreadKey = `preset:${draft.id}`;
          const targetThreadKey = `cloud:${saved.id}`;
          const plan = loadLocalPlan(sourceThreadKey);
          await copyPlanToCloud(
            targetThreadKey,
            plan,
            user.id,
            saved.id,
          );
          if (cancelled) continue;
          migrateChatThreadKey(sourceThreadKey, targetThreadKey);
          migrateCursorAgentThreadKey(sourceThreadKey, targetThreadKey);
          removeLocalPlan(sourceThreadKey);
          migrated.push(saved);
          if (active) activeMigration = saved;
          await removePromotedDraftState({
            draftId: draft.id,
            drafts: draftsRef.current,
            thumbnailDataUrls: thumbnailDataUrlsRef.current,
            writeDrafts,
            activeDraftStorageKey: ACTIVE_DRAFT_STORAGE_KEY,
            onStateRemoved: (nextDrafts) => {
              draftsRef.current = nextDrafts;
              setDrafts(nextDrafts);
            },
            removeMedia: (draftId) =>
              removeLocalDraftMedia(draftId).catch(() => {}),
          });
          setThumbnails((current) => {
            if (!(draft.id in current)) return current;
            revokeThumbnailUrl(current[draft.id]);
            const next = { ...current };
            delete next[draft.id];
            return next;
          });
        } catch (migrationError) {
          remaining.push(draft);
          lastError = migrationError;
        }
      }

      if (cancelled) return;
      setCloudShaders((current) => [
        ...migrated,
        ...current.filter(
          (item) => !migrated.some((saved) => saved.id === item.id)
        ),
      ]);

      if (activeMigration) {
        lastSavedFingerprintRef.current = editorPersistenceFingerprint(
          buildShaderDocumentSnapshot(activeMigration),
          {
            name: activeMigration.name,
            description: activeMigration.description,
          }
        );
        await activateShaderSession({
          sessionId: cloudChoiceId(activeMigration.id),
          routeId: activeMigration.id,
          name: activeMigration.name,
          description: activeMigration.description || "",
          source: activeMigration.source,
          kind: activeMigration.kind,
          composition: activeMigration.composition,
          values: activeMigration.parameter_values || {},
          public: false,
          media: null,
          dirty: false,
          cloudShader: activeMigration,
          persistPrevious: false,
        });
      }
      if (lastError) {
        migratedUserRef.current = null;
        reportAppError(
          `Some drafts could not sync: ${
            lastError.message || String(lastError)
          }`
        );
      } else {
        migratedUserRef.current = user.id;
        migrationRetryAttemptRef.current = 0;
      }
      await refreshLibrary();
      if (lastError && !cancelled) scheduleRetry();
    };

    migrate()
      .catch((migrationError) => {
        migratedUserRef.current = null;
        reportAppError(migrationError.message || String(migrationError));
        if (!cancelled) scheduleRetry();
      })
      .finally(() => {
        if (migrationInFlightUserRef.current === user.id) {
          migrationInFlightUserRef.current = null;
        }
      });
    return () => {
      cancelled = true;
      window.clearTimeout(migrationRetryTimerRef.current);
    };
  }, [
    authLoading,
    migrationRetryRevision,
    routeEmbed,
    user?.id,
  ]);

  const choosePreset = useCallback(
    async (id, { syncUrl = true } = {}) => {
      const preset = getPreset(id);
      if (syncUrl) setShaderRoute(preset.id, preset.kind);
      if (draftSessionRef.current.presetId === preset.id) return;
      await activateShaderSession({
        sessionId: preset.id,
        routeId: syncUrl ? preset.id : routeId,
        name: preset.name,
        description:
          typeof preset.description === "string" ? preset.description : "",
        source: preset.source,
        kind: preset.kind,
      });
    },
    [activateShaderSession, routeId, setShaderRoute],
  );

  const selectAfterLibraryDelete = useCallback(
    (deletedKey) => {
      if (draftSessionRef.current.presetId !== deletedKey) return;
      const nextKey = nextLibraryCardKey(editorCardsRef.current, deletedKey);
      if (nextKey) {
        chooseItemRef.current(nextKey);
        return;
      }
      setShaderRoute();
    },
    [setShaderRoute]
  );

  const removeDraft = useCallback(
    (draft) => {
      removeLocalDraftMedia(draft.id).catch(() => {});
      setDrafts((current) => current.filter((item) => item.id !== draft.id));
      setThumbnails((current) => {
        if (!(draft.id in current)) return current;
        revokeThumbnailUrl(current[draft.id]);
        const next = { ...current };
        delete next[draft.id];
        return next;
      });
      delete thumbnailDataUrlsRef.current[draft.id];
      selectAfterLibraryDelete(draft.id);
    },
    [selectAfterLibraryDelete]
  );

  const openRouteId = useCallback(
    (id) => {
      if (!id) return;
      if (isDraftId(id)) {
        const draft = drafts.find((item) => item.id === id);
        if (draft) {
          openDraft(draft).catch((draftError) =>
            reportAppError(draftError.message || String(draftError))
          );
        } else {
          reportAppError("This draft is missing or was deleted.");
          setShaderRoute();
        }
        return;
      }
      if (getPreset(id).id === id) {
        choosePreset(id).catch((presetError) =>
          reportAppError(presetError.message || String(presetError))
        );
        return;
      }
      const local = cloudShaders.find((item) => item.id === id);
      if (local) {
        openCloudShader(local).catch((cloudError) =>
          reportAppError(cloudError.message || String(cloudError))
        );
        return;
      }
      openCloudShader({ id }).catch(() =>
        reportAppError("This shader is private, missing, or unavailable.")
      );
    },
    [
      choosePreset,
      cloudShaders,
      drafts,
      openCloudShader,
      openDraft,
      setShaderRoute,
    ]
  );

  const openSharedRouteId = useCallback(
    async (id, expectedKind) => {
      if (!id) return;
      setEmbedStatus("loading");
      setError(null);
      try {
        await openCloudShader(
          { id },
          { requireAccessible: true, expectedKind }
        );
        const activeRoute = getAppRoute();
        if ((activeRoute.embed || activeRoute.view) && activeRoute.id === id) {
          setEmbedStatus("ready");
        }
      } catch {
        const activeRoute = getAppRoute();
        if ((activeRoute.embed || activeRoute.view) && activeRoute.id === id) {
          setError(null);
          setEmbedStatus("unavailable");
        }
      }
    },
    [openCloudShader]
  );

  const openViewRoute = useCallback(
    (id, kind) => {
      if (!id) return;
      persistActiveDraft();
      window.history.pushState({}, "", makeViewUrl(id, kind));
      routeEmbedRef.current = false;
      routeViewRef.current = true;
      setRouteId(id);
      setRouteKind(kind === COMPOSITION_KIND ? COMPOSITION_KIND : null);
      setRouteProfile(null);
      setRouteEmbed(false);
      setRouteView(true);
      openSharedRouteId(id, kind);
    },
    [openSharedRouteId, persistActiveDraft],
  );
  const openReferencedShaderInView = useCallback(
    (key) => {
      if (typeof key !== "string" || !key.startsWith("cloud:")) return;
      openViewRoute(key.slice("cloud:".length), null);
    },
    [openViewRoute],
  );

  useEffect(() => {
    const initialRoute = getAppRoute();
    if (
      authLoading ||
      sharedLoadedRef.current
    ) {
      return;
    }
    sharedLoadedRef.current = true;
    const {
      id,
      kind: nextKind,
      embed,
      view,
      profile: nextProfile,
    } = initialRoute;
    routeEmbedRef.current = Boolean(embed);
    routeViewRef.current = Boolean(view);
    setRouteId(id);
    setRouteKind(nextKind);
    setRouteProfile(nextProfile || null);
    setRouteEmbed(Boolean(embed));
    setRouteView(Boolean(view));
    if (nextProfile) {
      setEmbedStatus("idle");
    } else if (id && (embed || view)) {
      if (embed && presentSessionId) setEmbedStatus("loading");
      else openSharedRouteId(id, nextKind);
    } else if (id) {
      setEmbedStatus("idle");
      openRouteId(id);
    }
  }, [
    authLoading,
    openSharedRouteId,
    openRouteId,
    presentSessionId,
  ]);

  useEffect(() => {
    const onPopState = () => {
      const {
        id,
        kind: nextKind,
        embed,
        view,
        profile: nextProfile,
      } = getAppRoute();
      if (id && embed) {
        window.location.reload();
        return;
      }
      if (routeViewRef.current && !view) {
        window.location.reload();
        return;
      }
      routeEmbedRef.current = Boolean(embed);
      routeViewRef.current = Boolean(view);
      setRouteId(id);
      setRouteKind(nextKind);
      setRouteProfile(nextProfile || null);
      setRouteEmbed(Boolean(embed));
      setRouteView(Boolean(view));
      if (nextProfile) {
        setEmbedStatus("idle");
      } else if (id && view) {
        openSharedRouteId(id, nextKind);
      } else if (id) {
        setEmbedStatus("idle");
        openRouteId(id);
      } else {
        setEmbedStatus("idle");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [openRouteId, openSharedRouteId]);

  const chooseItem = useCallback(
    (id) => {
      if (isDraftId(id)) {
        const draft = drafts.find((item) => item.id === id);
        if (draft) {
          openDraft(draft).catch((navigationError) =>
            reportAppError(navigationError.message || String(navigationError)),
          );
        }
      } else if (id.startsWith("cloud:")) {
        const cloudId = id.slice("cloud:".length);
        const shader = cloudShaders.find((item) => item.id === cloudId);
        if (shader) {
          openCloudShader(shader).catch((navigationError) =>
            reportAppError(navigationError.message || String(navigationError)),
          );
        } else openRouteId(cloudId);
      } else {
        choosePreset(id).catch((presetError) =>
          reportAppError(presetError.message || String(presetError))
        );
      }
    },
    [
      choosePreset,
      cloudShaders,
      drafts,
      openCloudShader,
      openDraft,
      openRouteId,
    ]
  );
  chooseItemRef.current = chooseItem;

  const onShaderContextMenu = useCallback(
    (card, event) => {
      if (!card?.key) return;
      event.preventDefault();
      event.stopPropagation();
      setShaderContextRequest({
        key: card.key,
        x: event.clientX,
        y: event.clientY,
      });
      if (card.key !== presetId) chooseItem(card.key);
    },
    [chooseItem, presetId]
  );

  useEffect(() => {
    if (!shaderContextRequest || shaderContextRequest.key !== presetId) return;
    const menu = shaderContextMenuRef.current;
    if (!menu?.showAt) return;
    return afterPointerRelease(() => {
      shaderContextMenuRef.current?.showAt(
        shaderContextRequest.x,
        shaderContextRequest.y,
      );
      setShaderContextRequest((current) =>
        current === shaderContextRequest ? null : current,
      );
    });
  }, [presetId, shaderContextRequest]);

  const openHomeChoice = useCallback(
    (id) => {
      if (typeof id !== "string") return;
      const nextRouteId = id.startsWith("cloud:")
        ? id.slice("cloud:".length)
        : id;
      let kind;
      if (isDraftId(id)) {
        kind = drafts.find((item) => item.id === id)?.kind;
      } else if (id.startsWith("cloud:")) {
        kind = cloudShaders.find((item) => item.id === nextRouteId)?.kind;
      }
      pushShaderUrl(nextRouteId, kind);
      routeEmbedRef.current = false;
      routeViewRef.current = false;
      setRouteId(nextRouteId);
      setRouteKind(kind === COMPOSITION_KIND ? COMPOSITION_KIND : null);
      setRouteProfile(null);
      setRouteEmbed(false);
      setRouteView(false);
      chooseItem(id);
    },
    [chooseItem, cloudShaders, drafts]
  );

  const openProfile = useCallback(
    (identifier) => {
      if (!identifier) return;
      const profileUrl = makeProfileUrl(identifier);
      if (routeViewRef.current) {
        window.location.assign(profileUrl);
        return;
      }
      persistActiveDraft();
      window.history.pushState({}, "", profileUrl);
      routeEmbedRef.current = false;
      routeViewRef.current = false;
      setRouteId(null);
      setRouteKind(null);
      setRouteEmbed(false);
      setRouteView(false);
      setRouteProfile(identifier);
      setEmbedStatus("idle");
    },
    [persistActiveDraft],
  );

  const openUserProfile = useCallback(
    async (userId, knownHandle = null) => {
      if (!userId) return;
      if (knownHandle) {
        openProfile(knownHandle);
        return;
      }
      try {
        const profile = await getProfile(userId);
        openProfile(profile?.handle || userId);
      } catch {
        openProfile(userId);
      }
    },
    [openProfile],
  );

  const openHome = useCallback(() => {
    window.history.pushState({}, "", makeHomeUrl());
    routeEmbedRef.current = false;
    routeViewRef.current = false;
    setRouteId(null);
    setRouteKind(null);
    setRouteEmbed(false);
    setRouteView(false);
    setRouteProfile(null);
    setEmbedStatus("idle");
  }, []);

  const canonicalizeProfileRoute = useCallback((identifier) => {
    if (!identifier) return;
    window.history.replaceState({}, "", makeProfileUrl(identifier));
  }, []);

  const updateControl = useCallback(
    (name, value) => {
      clearShaderVersionPreviewRef.current?.();
      if (previewParamsRafRef.current) {
        cancelAnimationFrame(previewParamsRafRef.current);
        previewParamsRafRef.current = 0;
      }
      if (thumbnailPreviewTimerRef.current) {
        window.clearTimeout(thumbnailPreviewTimerRef.current);
        thumbnailPreviewTimerRef.current = 0;
      }
      hostRef.current?.setActive(true);
      const nextValues = { ...valuesRef.current, [name]: value };
      setRuntimeValues(nextValues);
      if (sessionKindRef.current === COMPOSITION_KIND) {
        const next = compositionWithLayerValues(
          compositionRef.current,
          selectedLayerIdRef.current,
          nextValues
        );
        compositionRef.current = next;
        setComposition(next);
      }
      setError(null);
      if (!protectedPreview) setDirty(true);
    },
    [protectedPreview, setRuntimeValues]
  );

  const previewControl = useCallback((name, value) => {
    clearShaderVersionPreviewRef.current?.();
    hostRef.current?.setActive(true);
    valuesRef.current = { ...valuesRef.current, [name]: value };
    // Coalesce live preview redraws to one present per frame. Synchronous
    // WebGPU redraws on every pointermove hitch the main thread and cancel
    // native range-slider drags in the properties panel.
    if (previewParamsRafRef.current) return;
    previewParamsRafRef.current = requestAnimationFrame(() => {
      previewParamsRafRef.current = 0;
      const next = valuesRef.current;
      if (usesCompositionHost(sessionKindRef.current, effectFillsRef.current)) {
        hostRef.current?.setCompositionLayerParams?.(
          selectedLayerIdRef.current,
          next
        );
      } else {
        hostRef.current?.setParams(next);
      }
      // Canvas handles read React `values`; keep them live while scrubbing
      // spatial props from the panel (sliders stay ref-only to avoid hitch).
      const def = propsRef.current?.[name];
      if (def && CANVAS_PROP_TYPES.has(def.type)) {
        setValues(next);
      }
      queuePresentState();
    });
  }, [queuePresentState]);

  const resetProperties = useCallback((targetLayerId = null) => {
    if (protectedPreview && viewMode !== "view") return;
    clearShaderVersionPreviewRef.current?.();
    if (sessionKindRef.current === COMPOSITION_KIND) {
      const graph = normalizeComposition(compositionRef.current);
      const layerId = targetLayerId || selectedLayerIdRef.current;
      const layerShaderId = compositionLayerShaderId(graph, layerId);
      const layerSource =
        dependencySourceForKey(
          activeDependencySnapshotsRef.current,
          layerShaderId,
        ) ||
        resolveReferencedShaderSource(layerShaderId, {
          session: draftSessionRef.current,
          drafts,
          liveByKey: liveShaderSourceRef.current,
          resolvedByKey: new Map(Object.entries(resolvedShaders)),
        });
      if (!layerSource) return;
      try {
        const layer =
          graph.fills.find((fill) => fill.id === layerId) ||
          graph.effects.find((effect) => effect.id === layerId);
        if (!layer) return;
        const reset = resetPropertiesForTarget({
          source: layerSource,
          values: layer.values,
          target: { type: "composition-layer", layerId },
          readOnly: protectedPreview,
        });
        if (!reset.changed) return;
        const next = reset.values;
        const nextGraph = compositionWithLayerValues(graph, layerId, next);
        compositionRef.current = nextGraph;
        setComposition(nextGraph);
        setProps(reset.props);
        setRuntimeValues(next);
        setLayerControlsEpoch((epoch) => epoch + 1);
        setError(null);
        setDirty(true);
        compileCompositionRef.current?.(nextGraph);
      } catch (resetError) {
        reportAppError(resetError.message || String(resetError));
      }
      return;
    }
    try {
      const reset = resetPropertiesForTarget({
        source: sourceRef.current,
        values: valuesRef.current,
        target: { type: "document" },
        readOnly: protectedPreview,
      });
      if (!reset.changed) return;
      const next = reset.values;
      setProps(reset.props);
      setRuntimeValues(next);
      setLayerControlsEpoch((epoch) => epoch + 1);
      setError(null);
      setDirty(true);
      if (usesCompositionHost(sessionKindRef.current, effectFillsRef.current)) {
        compile(sourceRef.current, { force: true });
      } else {
        hostRef.current?.setParams(next);
        hostRef.current?.redraw();
      }
    } catch (resetError) {
      reportAppError(resetError.message || String(resetError));
    }
  }, [
    compile,
    drafts,
    protectedPreview,
    resolvedShaders,
    setRuntimeValues,
  ]);

  const resetEffectFillProperties = useCallback(
    (fillId) => {
      if (protectedPreview || !fillId) return;
      clearShaderVersionPreviewRef.current?.();
      const graph = normalizeComposition({
        fills: effectFillsRef.current,
        effects: [],
      });
      const fill = graph.fills.find((item) => item.id === fillId);
      const layerSource =
        dependencySourceForKey(
          activeDependencySnapshotsRef.current,
          fill?.shaderId,
        ) ||
        resolveReferencedShaderSource(fill?.shaderId, {
          session: draftSessionRef.current,
          drafts,
          liveByKey: liveShaderSourceRef.current,
          resolvedByKey: new Map(Object.entries(resolvedShaders)),
        });
      if (!fill || !layerSource) return;
      try {
        const reset = resetPropertiesForTarget({
          source: layerSource,
          values: fill.values,
          target: { type: "effect-fill", layerId: fillId },
          readOnly: protectedPreview,
        });
        if (!reset.changed) return;
        const nextValues = reset.values;
        const fills = graph.fills.map((item) =>
          item.id === fillId ? { ...item, values: nextValues } : item
        );
        effectFillsRef.current = fills;
        setEffectFills(fills);
        effectFillRef.current = fills[0] || null;
        setEffectFill(fills[0] || null);
        hostRef.current?.setCompositionLayerParams?.(fillId, nextValues);
        compile(sourceRef.current, { force: true });
        setDirty(true);
        setError(null);
      } catch (resetError) {
        reportAppError(resetError.message || String(resetError));
      }
    },
    [compile, drafts, protectedPreview, resolvedShaders, viewMode]
  );

  const savePropertiesAsDefault = useCallback(() => {
    if (protectedPreview) return;
    clearShaderVersionPreviewRef.current?.();
    const currentValues = valuesRef.current;
    try {
      const nextSource = applyDefaultValuesToSource(
        sourceRef.current,
        currentValues
      );
      setRuntimeValues(currentValues);
      if (nextSource === sourceRef.current) return;
      setSource(nextSource);
      setDirty(true);
      setProps((current) => applyDefaultValuesToProps(current, currentValues));
      setError(null);
    } catch (saveError) {
      reportAppError(saveError.message || String(saveError));
    }
  }, [protectedPreview, setRuntimeValues]);

  const propertiesMoreMenuRef = useFigMenuChange((value) => {
    if (value === "reset") resetProperties();
    else if (value === "save-defaults") savePropertiesAsDefault();
  });

  const startRename = useCallback(() => {
    if (protectedPreview) return;
    setRenaming(true);
    requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.input?.select();
    });
  }, [protectedPreview]);

  const finishRename = useCallback(() => {
    const input = nameInputRef.current?.input;
    if (input) {
      const end = input.value?.length ?? 0;
      input.setSelectionRange?.(end, end);
      input.blur();
    }
    window.getSelection()?.removeAllRanges?.();
    setRenaming(false);
  }, []);

  const play = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    playPreferenceRef.current = true;
    localStorage.setItem(PLAY_STORAGE_KEY, "true");
    host.setActive(true);
    host.play();
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    playPreferenceRef.current = false;
    localStorage.setItem(PLAY_STORAGE_KEY, "false");
    host.pause();
    setRunning(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (running) pause();
    else play();
  }, [pause, play, running]);

  const pickFile = useCallback(
    async (file) => {
      if (file.size > MAX_MEDIA_BYTES) {
        throw new Error("Input media must be 25 MB or smaller.");
      }
      const mimeType = mediaType(file);
      if (!mimeType) {
        throw new Error("Choose a supported image, SVG, or video file.");
      }
      clearShaderVersionPreviewRef.current?.();
      const generation = ++inputApplyGenRef.current;
      setUploading(true);
      try {
        const paint = await applyMediaBlob(file, mimeType, generation);
        if (!paint) return;
        setPendingMedia(file);
        if (sessionKindRef.current === COMPOSITION_KIND && !protectedPreview) {
          const fillType = fillTypeForDroppedMedia(mimeType);
          if (fillType) {
            const graph = replacePrimaryCompositionFill(
              compositionRef.current,
              {
                type: fillType,
                shaderId: null,
                values: {},
                paint,
              }
            );
            compositionRef.current = graph;
            setComposition(graph);
          }
        }
        if (!protectedPreview) setDirty(true);
        const draftId = draftSessionRef.current.presetId;
        if (!user && isDraftId(draftId)) {
          const fills =
            sessionKindRef.current === COMPOSITION_KIND
              ? normalizeComposition(compositionRef.current).fills
              : sessionKindRef.current === "effect"
                ? effectFillsRef.current
                : [];
          if (fills.length > 0) {
            draftMediaPersistenceErrorRef.current = null;
            const persistence = persistLocalDraftMedia(
              draftId,
              fills,
              file,
              liveSessionInputs(
                sessionKindRef.current,
                compositionRef.current,
                documentInputsRef.current,
              ),
            );
            draftMediaPersistenceRef.current = persistence;
            try {
              const annotatedFills = await persistence;
              if (sessionKindRef.current === COMPOSITION_KIND) {
                const graph = normalizeComposition(compositionRef.current);
                const next = normalizeComposition({
                  ...graph,
                  fills: graph.fills.map(
                    (fill) =>
                      annotatedFills.find((item) => item.id === fill.id) ||
                      fill,
                  ),
                });
                compositionRef.current = next;
                setComposition(next);
              } else if (sessionKindRef.current === "effect") {
                effectFillsRef.current = annotatedFills;
                effectFillRef.current = annotatedFills[0] || null;
                setEffectFills(annotatedFills);
                setEffectFill(annotatedFills[0] || null);
              }
              persistActiveDraft();
            } catch (mediaError) {
              draftMediaPersistenceErrorRef.current = mediaError;
              throw mediaError;
            } finally {
              if (draftMediaPersistenceRef.current === persistence) {
                draftMediaPersistenceRef.current = null;
              }
            }
          }
        }
      } finally {
        if (isInputApplyCurrent(generation)) setUploading(false);
      }
    },
    [
      applyMediaBlob,
      isInputApplyCurrent,
      persistActiveDraft,
      protectedPreview,
      user,
    ]
  );

  const onFileInput = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (file) {
        pickFile(file).catch((fileError) =>
          reportAppError(fileError.message || String(fileError))
        );
      }
      event.target.value = "";
    },
    [pickFile]
  );

  const onSourceChange = useCallback(
    (nextSource) => {
      if (protectedPreview) return;
      clearShaderVersionPreviewRef.current?.();
      setSource(nextSource);
      setDirty(true);
    },
    [protectedPreview]
  );
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const onPreviewFile = useCallback(
    (file) =>
      pickFile(file).catch((dropError) => {
        reportAppError(dropError.message || String(dropError));
      }),
    [pickFile]
  );

  const exportFiles = useCallback(async () => {
    try {
      await exportFigmaFiles(sourceRef.current, shaderName || "Shader", {
        supportsAudio: supportsAudioRef.current,
      });
    } catch (exportError) {
      reportAppError(exportError.message || String(exportError));
    }
  }, [shaderName]);

  const downloadPreviewImage = useCallback(async () => {
    const host = hostRef.current;
    const canvas = host?.canvas;
    if (!host?.ready || !canvas?.width || !canvas?.height) {
      reportAppError("Preview image is not ready to download.");
      return;
    }

    const imageType = resolveImageExportFormat(videoExportSettings.imageFormat);
    const resolvedSize = resolveVideoExportSize(
      videoExportSettings.resolution,
      videoExportSettings.aspect,
      host.logicalOutputSize?.width || canvas.width,
      host.logicalOutputSize?.height || canvas.height
    );
    const { width, height } = resolvedSize;
    setExportOpen(false);

    let blob;
    try {
      blob = await host.captureThumbnailBlob({
        width,
        height,
        type: imageType,
        quality: imageExportQualityFactor(
          videoExportSettings.imageQuality,
          imageType
        ),
        shouldResume: () => playPreferenceRef.current,
      });
    } catch (captureError) {
      reportAppError(
        captureError?.message || "Could not capture the preview image."
      );
      return;
    }
    if (!blob) {
      reportAppError("Could not capture the preview image.");
      return;
    }

    const baseName =
      (shaderName || "shader")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "shader";
    const extension =
      blob.type === "image/png"
        ? "png"
        : blob.type === "image/jpeg"
          ? "jpg"
          : "webp";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [shaderName, videoExportSettings]);

  const currentExportSize = useMemo(() => {
    if (!exportOpen) return null;
    const host = hostRef.current;
    const width = Math.max(
      1,
      Math.round(host?.logicalOutputSize?.width || host?.canvas?.width || 0)
    );
    const height = Math.max(
      1,
      Math.round(host?.logicalOutputSize?.height || host?.canvas?.height || 0)
    );
    return width && height ? { width, height } : null;
  }, [exportOpen, previewRevision]);

  const resolutionOptions = useMemo(
    () => videoResolutionOptions(currentExportSize?.width, currentExportSize?.height),
    [currentExportSize]
  );
  const exportSoundtrackAvailable = Boolean(
    resolveExportSoundtrack({
      kind,
      composition,
      effectFills,
      documentInputs,
    })?.url,
  );

  const exportPreviewVideo = useCallback(async () => {
    const host = hostRef.current;
    const canvas = host?.canvas;
    if (!host?.ready || !canvas?.width || !canvas?.height) {
      reportAppError("Preview video is not ready to export.");
      return;
    }

    const duration = Math.min(
      30,
      Math.max(1, Number(videoExportSettings.duration) || 5)
    );
    const frameRate = Math.min(
      60,
      Math.max(12, Number(videoExportSettings.frameRate) || 30)
    );
    const bitrate = Math.min(
      32,
      Math.max(1, Number(videoExportSettings.bitrate) || 8)
    );
    const format = resolveVideoExportFormat(videoExportSettings.format);
    const resolvedSize = resolveVideoExportSize(
      videoExportSettings.resolution,
      videoExportSettings.aspect,
      host.logicalOutputSize?.width || canvas.width,
      host.logicalOutputSize?.height || canvas.height
    );
    const { width, height } =
      format === "mp4" ? evenExportSize(resolvedSize.width, resolvedSize.height) : resolvedSize;

    setExportOpen(false);
    setVideoExportProgress({ progress: 0 });

    try {
      const compositionExport = serializeVideoExportComposition({
        kind,
        composition,
        effectFills,
        presetId,
        source: sourceRef.current,
        values: valuesRef.current,
        resolvedByKey: pinAwareResolvedByKey,
      });
      const needsMediaInput = compositionExport
        ? !compositionExport.isFill
        : kind === "effect";
      const inputVideo = needsMediaInput
        ? host.compositionExportVideo?.() || host.video
        : null;
      let inputBitmap =
        needsMediaInput && !inputVideo
          ? await host.captureInputBitmap({ width, height })
          : null;
      if (needsMediaInput && !inputBitmap && !inputVideo) {
        const paintGraph =
          kind === COMPOSITION_KIND ? composition : { fills: effectFills };
        const fill = normalizeComposition(paintGraph).fills.find(
          (item) => item.enabled,
        );
        const paint = resolvePaintFill(fill?.paint, {
          defaultImageUrl: defaultInputUrl,
          defaultVideoUrl,
        });
        if (
          paint &&
          isPaintFillType(paint.type) &&
          paint.type !== "video" &&
          paint.type !== "webcam"
        ) {
          inputBitmap = await rasterizePaintFill(paint, width, height);
        }
      }
      if (needsMediaInput && !inputBitmap && !inputVideo) {
        throw new Error("Could not snapshot the current shader input.");
      }
      const soundtrack =
        videoExportSettings.includeAudio !== false
          ? resolveExportSoundtrack({
              kind,
              composition,
              effectFills,
              documentInputs,
            })
          : null;
      let exportAudio = null;
      if (soundtrack?.url) {
        const decoded = await decodeExportPcm(soundtrack.url);
        const fileInput =
          soundtrack.source === "audio"
            ? enabledAudioFileInput(
                kind === COMPOSITION_KIND ? composition?.inputs : documentInputs,
              )
            : null;
        exportAudio = applyAudioPlayback(decoded, {
          ...audioPlaybackSettings(fileInput?.audio),
          durationSec: duration,
        });
      }
      const blob = await renderVideoInWorker({
        source: compositionExport ? "" : sourceRef.current,
        values: compositionExport ? {} : valuesRef.current,
        isFill: compositionExport
          ? compositionExport.isFill
          : kind === "fill",
        composition: compositionExport,
        inputBitmap,
        inputVideo,
        audio: exportAudio,
        supportsAudio: Boolean(exportAudio),
        width,
        height,
        duration,
        frameRate,
        bitrate,
        format,
        onProgress: (progress) =>
          setVideoExportProgress({ progress }),
      });

      setVideoExportProgress({ progress: 1 });
      const baseName =
        (shaderName || "shader")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "shader";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${baseName}.${videoExportFileExtension(format, blob.type)}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      videoExportedToastRef.current?.showToast?.();
    } catch (videoError) {
      reportAppError(videoError.message || String(videoError));
    } finally {
      setVideoExportProgress(null);
    }
  }, [
    composition,
    documentInputs,
    effectFills,
    kind,
    pinAwareResolvedByKey,
    presetId,
    shaderName,
    videoExportSettings,
  ]);

  const saveShader = useCallback(
    async (options = {}) => {
      if (protectedPreview) {
        if (options.background !== true) {
          showNotice("Duplicate this shader to make changes.");
        }
        return null;
      }
      if (!user) {
        setAuthOpen(true);
        return null;
      }
      const makePublic = options.makePublic === true;
      const makePrivate = options.makePrivate === true;
      const background = options.background === true;
      if (
        !background &&
        currentShader?.id &&
        conflictBlockedShaderRef.current === currentShader.id
      ) {
        conflictBlockedShaderRef.current = null;
      }
      const checkpointKind =
        options.checkpointKind ||
        (!background ? (makePublic ? "publish" : "manual") : null);
      const publicFlag = makePrivate ? false : makePublic || isPublic;
      const capturedVisibility = isPublic;
      const saveTargetId = presetId;
      const requestedSource =
        typeof options.sourceOverride === "string"
          ? options.sourceOverride
          : sourceRef.current;
      const requestedValues = options.valuesOverride || valuesRef.current;
      const saveDescription =
        typeof options.descriptionOverride === "string"
          ? options.descriptionOverride.slice(0, 1000)
          : shaderDescription;
      const saveName = shaderName.trim() || "Untitled Shader";
      const noticeMessage =
        "notice" in options ? options.notice : "Shader saved";
      const requestedKind =
        sessionKindRef.current === COMPOSITION_KIND
          ? COMPOSITION_KIND
          : detectKind(requestedSource);
      const isComposition = requestedKind === COMPOSITION_KIND;
      const capturedGraph = isComposition
        ? promoteCompositionRefs(
            compositionWithLayerValues(
              compositionRef.current,
              selectedLayerIdRef.current,
              requestedValues
            ),
            cloudShaders
          )
        : null;
      const capturedEffectFills =
        requestedKind === "effect"
          ? normalizeComposition({
              fills: effectFillsRef.current,
              effects: [],
            }).fills
          : [];
      const capturedPins = structuredClone(
        activeDependencySnapshotsRef.current || {}
      );
      const capturedDocument = captureDocumentSnapshot({
        source: requestedSource,
        kind: requestedKind,
        parameterValues: requestedValues,
        composition: capturedGraph,
        effectFills: capturedEffectFills,
        dependencySnapshots: capturedPins,
      });
      const capturedEditorFingerprint = editorPersistenceFingerprint(
        capturedDocument,
        { name: saveName, description: saveDescription }
      );
      const capturedPendingMedia = pendingMedia;
      const shaderId =
        isOwner && currentShader?.id ? currentShader.id : null;
      const targetShaderId =
        shaderId ||
        (isDraftId(saveTargetId)
          ? cloudIdForDraft(saveTargetId)
          : crypto.randomUUID());
      const draftLink = isDraftId(saveTargetId)
        ? drafts.find((item) => item.id === saveTargetId)
        : null;
      const runSave = async () => {
      if (!background) setSaving(true);
      setError(null);
      try {
        const graph = capturedGraph || {};
        if (
          isComposition &&
          referencedShaderKeys(graph).join() !==
            referencedShaderKeys(compositionRef.current).join()
        ) {
          compositionRef.current = graph;
          setComposition(graph);
        }
        const publicationGraph = isComposition
          ? graph
          : requestedKind === "effect"
            ? normalizeComposition({ fills: capturedEffectFills })
            : null;
        if (publicFlag && !background && publicationGraph) {
          let unpublished = unpublishedCompositionRefs(
            publicationGraph,
            new Map(Object.entries(resolvedShaders)),
            cloudShaders
          );
          let dependencyRows = cloudShaders;
          if (unpublished.length) {
            const ids = unpublished
              .map((key) => parseCompositionShaderId(key)?.id)
              .map((id) =>
                typeof id === "string" && id.startsWith("draft:")
                  ? id.slice("draft:".length)
                  : id
              )
              .filter(Boolean);
            const fresh = ids.length ? await getShadersByIds(ids) : [];
            dependencyRows = [...cloudShaders, ...fresh];
            unpublished = unpublishedCompositionRefs(
              publicationGraph,
              new Map(Object.entries(resolvedShaders)),
              dependencyRows
            );
          }
          if (unpublished.length) {
            const byId = new Map(
              dependencyRows.map((dependency) => [dependency.id, dependency])
            );
            const publishable = new Map();
            const blocked = [];
            for (const key of unpublished) {
              const parsed = parseCompositionShaderId(key);
              const id = String(parsed?.id || "").replace(/^draft:/, "");
              const dependency = byId.get(id);
              if (
                dependency &&
                dependency.owner_id === user.id &&
                dependency.is_public !== true
              ) {
                publishable.set(id, dependency);
              } else {
                blocked.push(key);
              }
            }
            if (blocked.length) {
              const names = unpublishedCompositionLabels(
                blocked,
                new Map(Object.entries(resolvedShaders)),
                dependencyRows
              );
              throw new Error(
                `These referenced fills or effects are unavailable for publishing: ${names.join(", ")}.`
              );
            }
            const publishedDependencies = await Promise.all(
              [...publishable.keys()].map((id) =>
                updateShader(id, { is_public: true })
              )
            );
            if (publishedDependencies.length) {
              setCloudShaders((current) =>
                current.map((item) => {
                  const published = publishedDependencies.find(
                    (dependency) => dependency.id === item.id
                  );
                  return published ? { ...item, ...published } : item;
                })
              );
            }
          }
        }
        const liveFills = isComposition
          ? graph.fills
          : requestedKind === "effect"
            ? capturedEffectFills
            : [];
        assertLocalFillMediaAvailable(
          liveFills,
          "A saved local fill could not be recovered. Choose the media again before saving.",
        );
        const stackedMedia = fillMediaEntries(liveFills);
        let durableFills = persistableEffectFills(liveFills);
        const existingFillAssetPath = durableFills
          .map(
            (fill) =>
              fill?.paint?.image?.assetPath ||
              fill?.paint?.video?.assetPath ||
              null
          )
          .find(Boolean);
        let durableInput = existingFillAssetPath
          ? {
              path: existingFillAssetPath,
              name: capturedDocument.input.name,
              mimeType: capturedDocument.input.mimeType,
            }
          : { path: null, name: null, mimeType: null };
        for (const { fill, url } of stackedMedia) {
          const file = await fileFromBlobUrl(url);
          if (!file) {
            throw new Error(
              "A local fill could not be read. Choose the media again before saving."
            );
          }
          if (file.size > MAX_MEDIA_BYTES) {
            throw new Error("Input media must be 25 MB or smaller.");
          }
          const contentType = mediaType(file);
          const roleId = String(fill.id || "fill").replace(
            /[^a-zA-Z0-9_-]/g,
            "-"
          );
          const assetPath = await uploadAsset({
            ownerId: user.id,
            shaderId: targetShaderId,
            role: `fill-${roleId}`,
            blob: file,
            fileName: file.name,
            contentType,
          });
          durableFills = durableFills.map((item) =>
            item.id === fill.id ? withFillAssetPath(item, assetPath) : item
          );
          if (!durableInput.path) {
            durableInput = {
              path: assetPath,
              name: file.name,
              mimeType: contentType,
            };
          }
        }

        let mediaToUpload =
          requestedKind === "effect" && !stackedMedia.length
            ? capturedPendingMedia
            : null;
        if (!mediaToUpload && requestedKind === "effect") {
          const paint = liveFills.find((fill) =>
            isPaintFillType(fill.paint?.type)
          )?.paint;
          const url = paint?.image?.url || paint?.video?.url || "";
          if (url.startsWith("blob:") || url.startsWith("data:")) {
            mediaToUpload = await fileFromBlobUrl(url);
          }
        }
        if (mediaToUpload) {
          if (mediaToUpload.size > MAX_MEDIA_BYTES) {
            throw new Error("Input media must be 25 MB or smaller.");
          }
          const inputMimeType = mediaType(mediaToUpload);
          const inputPath = await uploadAsset({
            ownerId: user.id,
            shaderId: targetShaderId,
            role: "input",
            blob: mediaToUpload,
            fileName: mediaToUpload.name,
            contentType: inputMimeType,
          });
          durableInput = {
            path: inputPath,
            name: mediaToUpload.name,
            mimeType: inputMimeType,
          };
        }

        const liveInputs = liveSessionInputs(
          requestedKind,
          graph,
          documentInputsRef.current,
        );
        const durableInputs = await uploadDocumentInputAudio({
          inputs: liveInputs,
          ownerId: user.id,
          shaderId: targetShaderId,
          fileFromUrl: fileFromBlobUrl,
          downloadAsset,
          uploadAsset,
          mediaType,
          maxBytes: MAX_MEDIA_BYTES,
        });
        const durableComposition = compositionWithDocumentInputs(
          requestedKind,
          graph,
          durableFills,
          durableInputs,
        );
        const dependencyGraph = isComposition
          ? durableComposition
          : requestedKind === "effect"
            ? normalizeComposition({ fills: durableFills, effects: [] })
            : emptyComposition();
        const dependencySnapshots = buildCompositionDependencySnapshots({
          graph: dependencyGraph,
          resolvedByKey: new Map(Object.entries(resolvedShaders)),
          liveByKey: liveShaderSourceRef.current,
          cloudRows: cloudShaders,
          existingSnapshots: capturedPins,
        });
        const durableDocument = buildShaderDocumentSnapshot({
          ...capturedDocument,
          composition: durableComposition,
          effectFills: durableFills,
          input: durableInput,
          dependencySnapshots,
        });
        const documentPayload = buildShaderDocumentPayload(durableDocument);
        const payload = {
          id: targetShaderId,
          owner_id: user.id,
          name: saveName,
          description: saveDescription,
          ...documentPayload,
          is_public: publicFlag,
          ...figmaShaderLink(currentShader || draftLink),
        };
        const contentFingerprint = editorPersistenceFingerprint(
          durableDocument,
          { name: saveName, description: saveDescription }
        );
        if (
          background &&
          isOwner &&
          currentShader &&
          !checkpointKind &&
          !stackedMedia.length &&
          !capturedPendingMedia &&
          !hasDraftAudioMedia(liveInputs) &&
          contentFingerprint === lastSavedFingerprintRef.current
        ) {
          if (
            draftSessionRef.current.presetId === saveTargetId &&
            capturedEditorFingerprint ===
              editorPersistenceFingerprint(captureDocumentSnapshot(), {
                name: draftSessionRef.current.shaderName.trim() ||
                  "Untitled Shader",
                description: draftSessionRef.current.shaderDescription,
              })
          ) {
            setDirty(false);
          }
          return currentShader;
        }

        let saved;
        let checkpointSummary = options.checkpointSummary || null;
        if (isOwner && currentShader) {
          if (checkpointKind && !checkpointSummary) {
            const metadata = shaderVersions.length
              ? shaderVersions
              : await listShaderVersions(currentShader.id, { limit: 1 });
            const latestVersion = metadata[0]
              ? await getShaderVersion(currentShader.id, metadata[0].id)
              : null;
            checkpointSummary = summarizeManualVersion(latestVersion, payload);
          }
          saved = await saveShaderState({
            shaderId: currentShader.id,
            expectedStateRevision: expectedStateRevision(
              committedStateRevisionsRef.current,
              currentShader,
            ),
            ...buildShaderStateSavePayload(durableDocument),
            dependencySnapshots,
            checkpointDependencySnapshots: dependencySnapshots,
            checkpointKind,
            summary: checkpointSummary,
          });
          rememberStateRevision(
            committedStateRevisionsRef.current,
            saved,
          );
          const metadataPayload = {
            name: payload.name,
            description: payload.description,
            ...figmaShaderLink(currentShader || draftLink),
          };
          if (!background) metadataPayload.is_public = publicFlag;
          if (!shaderMetadataUnchanged(currentShader, metadataPayload)) {
            saved = await updateShader(currentShader.id, metadataPayload, {
              expectedStateRevision: saved.state_revision,
            });
          }
        } else {
          if (isDraftId(saveTargetId)) {
            const promoted = await createOrResumeCloudDraft({
              shaderId: targetShaderId,
              createPayload: payload,
              statePayload: {
                ...buildShaderStateSavePayload(durableDocument),
                dependencySnapshots,
                checkpointDependencySnapshots: dependencySnapshots,
                checkpointKind,
                summary: checkpointSummary || "Saved local draft",
              },
              metadataPayload: {
                name: payload.name,
                description: payload.description,
                is_public: publicFlag,
                ...figmaShaderLink(currentShader || draftLink),
              },
              getExisting: getShaderMaybe,
              create: createShader,
              saveState: saveShaderState,
              updateMetadata: updateShader,
              onStateCommitted: (committed) =>
                rememberStateRevision(
                  committedStateRevisionsRef.current,
                  committed,
                ),
            });
            saved = promoted.shader;
          } else {
            saved = await createShader(payload);
            rememberStateRevision(
              committedStateRevisionsRef.current,
              saved,
            );
          }
        }
        const planLocalKey = currentShader?.id
          ? `cloud:${currentShader.id}`
          : `preset:${saveTargetId}`;
        const targetThreadKey = `cloud:${saved.id}`;
        if (isDraftId(saveTargetId)) {
          await copyPlanToCloud(
            targetThreadKey,
            loadLocalPlan(planLocalKey),
            user.id,
            saved.id,
          );
        } else {
          await migrateLocalPlanToCloud(planLocalKey, user.id, saved.id);
        }
        const assetChanges = {};
        const previousPublicThumbnailPaths =
          saved.thumbnail_bucket === THUMBNAIL_BUCKET
            ? [saved.thumbnail_path, saved.thumbnail_small_path].filter(Boolean)
            : [];

        // Thumbnails are expensive (canvas capture + Storage RLS). Only refresh
        // them on explicit saves — background autosave only persists state.
        if (!background) {
          let thumbnailBlob = null;
          try {
            thumbnailBlob = await hostRef.current?.captureThumbnailBlob({
              width: THUMBNAIL_SIZE,
              height: THUMBNAIL_SIZE,
              shouldResume: () => playPreferenceRef.current,
            });
          } catch {
            thumbnailBlob = null;
          }
          if (!thumbnailBlob) {
            const cached =
              thumbnails[presetId] || thumbnailDataUrlsRef.current[presetId];
            if (
              typeof cached === "string" &&
              (cached.startsWith("blob:") ||
                cached.startsWith("data:image/webp") ||
                cached.startsWith("data:image/png") ||
                cached.startsWith("data:image/jpeg"))
            ) {
              try {
                const cachedBlob = await fetch(cached).then((response) =>
                  response.blob()
                );
                if (cachedBlob.type !== "image/svg+xml") {
                  thumbnailBlob = cachedBlob;
                }
              } catch {
                thumbnailBlob = null;
              }
            }
          }
          if (
            !thumbnailBlob &&
            saved.is_public &&
            saved.thumbnail_path &&
            saved.thumbnail_bucket !== THUMBNAIL_BUCKET
          ) {
            try {
              thumbnailBlob = await downloadAsset(saved.thumbnail_path);
            } catch {
              // Leave the existing private thumbnail in place until a later save.
            }
          }
          if (thumbnailBlob) {
            Object.assign(
              assetChanges,
              await uploadThumbnailVariants({
                ownerId: user.id,
                shaderId: saved.id,
                blob: thumbnailBlob,
                public:
                  saved.is_public ||
                  saved.thumbnail_bucket === THUMBNAIL_BUCKET,
              }),
            );
          }
        }

        if (Object.keys(assetChanges).length) {
          saved = await updateShader(saved.id, assetChanges, {
            expectedStateRevision: saved.state_revision,
          });
          const currentThumbnailPaths = new Set([
            saved.thumbnail_path,
            saved.thumbnail_small_path,
          ]);
          const staleThumbnailPaths = previousPublicThumbnailPaths.filter(
            (path) => !currentThumbnailPaths.has(path),
          );
          if (staleThumbnailPaths.length) {
            removeThumbnailAssets(staleThumbnailPaths).catch(() => {});
          }
        }

        if (isDraftId(saveTargetId)) {
          migrateChatThreadKey(planLocalKey, targetThreadKey);
          migrateCursorAgentThreadKey(planLocalKey, targetThreadKey);
          removeLocalPlan(planLocalKey);
          await removePromotedDraftState({
            draftId: saveTargetId,
            drafts: draftsRef.current,
            thumbnailDataUrls: thumbnailDataUrlsRef.current,
            writeDrafts,
            activeDraftStorageKey: ACTIVE_DRAFT_STORAGE_KEY,
            onStateRemoved: (nextDrafts) => {
              draftsRef.current = nextDrafts;
              setDrafts(nextDrafts);
            },
            removeMedia: (draftId) =>
              removeLocalDraftMedia(draftId).catch(() => {}),
          });
          setThumbnails((current) => {
            if (!(saveTargetId in current)) return current;
            revokeThumbnailUrl(current[saveTargetId]);
            const next = { ...current };
            delete next[saveTargetId];
            return next;
          });
        }
        setCloudShaders((current) => [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
        if (saved.thumbnail_path) {
          try {
            const { full, small } = await getThumbnailUrls([saved]);
            const url = full[saved.id];
            const smallUrl = small[saved.id] || url;
            cloudThumbnailPathsRef.current = {
              ...cloudThumbnailPathsRef.current,
              [saved.id]: saved.thumbnail_path,
            };
            cloudThumbnailBucketsRef.current = {
              ...cloudThumbnailBucketsRef.current,
              [saved.id]: saved.thumbnail_bucket || ASSET_BUCKET,
            };
            cloudThumbnailExpiriesRef.current = {
              ...cloudThumbnailExpiriesRef.current,
              [saved.id]:
                saved.thumbnail_bucket === THUMBNAIL_BUCKET
                  ? Number.MAX_SAFE_INTEGER
                  : Date.now() + LIBRARY_THUMBNAIL_URL_TTL_MS,
            };
            setCloudThumbnails((current) => ({
              ...current,
              [saved.id]: url,
            }));
            setCloudSmallThumbnails((current) => ({
              ...current,
              [saved.id]: smallUrl,
            }));
          } catch {
            // The durable thumbnail path is saved; its display URL can refresh
            // independently with the library.
          }
        }

        // A save for the previously open shader may finish after navigation.
        // Let that row finish safely, but never replace the active editor state.
        if (draftSessionRef.current.presetId !== saveTargetId) {
          return saved;
        }

        const latest = draftSessionRef.current;
        const latestDocument = captureDocumentSnapshot({
          input: capturedDocument.input,
          dependencySnapshots: capturedPins,
        });
        const unchanged =
          editorStateMatchesSnapshot(latestDocument, capturedDocument) &&
          (latest.shaderName.trim() || "Untitled Shader") === saveName &&
          latest.shaderDescription === saveDescription &&
          Boolean(latest.isPublic) === Boolean(capturedVisibility) &&
          latest.pendingMedia === capturedPendingMedia;
        if (unchanged) {
          if (isComposition) {
            const localGraph = normalizeComposition({
              ...graph,
              fills: liveFills.map((fill) => {
                const durable = durableFills.find((item) => item.id === fill.id);
                const assetPath =
                  durable?.paint?.image?.assetPath ||
                  durable?.paint?.video?.assetPath;
                return withFillAssetPath(fill, assetPath);
              }),
            });
            compositionRef.current = localGraph;
            setComposition(localGraph);
          } else if (requestedKind === "effect") {
            const localFills = liveFills.map((fill) => {
              const durable = durableFills.find((item) => item.id === fill.id);
              const assetPath =
                durable?.paint?.image?.assetPath ||
                durable?.paint?.video?.assetPath;
              return withFillAssetPath(fill, assetPath);
            });
            effectFillsRef.current = localFills;
            effectFillRef.current = localFills[0] || null;
            setEffectFills(localFills);
            setEffectFill(localFills[0] || null);
          }
          activeDependencySnapshotsRef.current = dependencySnapshots;
        }
        if (makePublic) setIsPublic(true);
        else if (makePrivate) setIsPublic(false);
        setCurrentShader(saved);
        setPresetId(cloudChoiceId(saved.id));
        setShaderRoute(saved.id, saved.kind);
        lastSavedFingerprintRef.current = contentFingerprint;
        if (unchanged) {
          setPendingMedia(null);
          setDirty(false);
        }
        if (checkpointKind || !currentShader) {
          await refreshShaderVersions(saved.id);
        }
        if (noticeMessage) showNotice(noticeMessage);
        cloudWriteBackoffUntilRef.current = 0;
        if (conflictBlockedShaderRef.current === saved.id) {
          conflictBlockedShaderRef.current = null;
        }
        return saved;
      } catch (saveError) {
        const saveStillActive =
          draftSessionRef.current.presetId === saveTargetId;
        if (isTransientCloudWriteError(saveError)) {
          cloudWriteBackoffUntilRef.current = Date.now() + CLOUD_WRITE_BACKOFF_MS;
          if (background && saveStillActive) {
            setAutosaveRetryRevision((revision) => revision + 1);
          }
        }
        if (isShaderStateConflict(saveError) && currentShader?.id) {
          if (saveStillActive) {
            conflictBlockedShaderRef.current = currentShader.id;
          }
          try {
            const latest = await getShader(currentShader.id);
            rememberStateRevision(
              committedStateRevisionsRef.current,
              latest,
            );
            setCloudShaders((current) => [
              latest,
              ...current.filter((item) => item.id !== latest.id),
            ]);
            if (saveStillActive) {
              await refreshShaderVersions();
            }
          } catch {
            // Preserve the local editor buffer even if conflict refresh fails.
          }
          showNotice(
            "This shader changed in another tab. Your local edits are still here; review and save again.",
            { error: true }
          );
        } else if (saveStillActive) {
          showNotice(
            formatSupabaseError(saveError, "Could not save shader."),
            { error: true },
          );
        }
        throw saveError;
      } finally {
        if (!background) setSaving(false);
      }
      };

      if (shaderId) {
        return shaderSaveQueue.enqueue(shaderId, async () => {
          const result = await withExclusiveShaderSave(shaderId, runSave, {
            ifAvailable:
              background &&
              !checkpointKind &&
              options.waitForLock !== true,
          });
          if (result.skipped) {
            window.setTimeout(
              () => setAutosaveRetryRevision((revision) => revision + 1),
              250
            );
            return currentShader ?? null;
          }
          return result.value;
        });
      }
      return runSave();
    },
    [
      captureDocumentSnapshot,
      currentShader,
      drafts,
      isOwner,
      isPublic,
      pendingMedia,
      presetId,
      protectedPreview,
      resolvedShaders,
      cloudShaders,
      refreshShaderVersions,
      setShaderRoute,
      shaderDescription,
      shaderName,
      shaderVersions,
      showNotice,
      thumbnails,
      user,
    ]
  );
  saveBeforeSessionChangeRef.current = () =>
    saveShader({ background: true, waitForLock: true, notice: null });

  const checkpointAgentVersion = useCallback(
    ({ source: appliedSource, summary, description }) => {
      if (!appliedSource) return;
      const nextDescription =
        typeof description === "string" && description.trim()
          ? description.trim().slice(0, 1000)
          : draftSessionRef.current.shaderDescription || "";
      if (nextDescription !== draftSessionRef.current.shaderDescription) {
        setShaderDescription(nextDescription);
        draftSessionRef.current = {
          ...draftSessionRef.current,
          shaderDescription: nextDescription,
        };
        if (isDraftId(presetId)) {
          setDrafts((current) =>
            current.map((draft) =>
              draft.id === presetId
                ? { ...draft, description: nextDescription }
                : draft
            )
          );
        }
      }
      if (!isOwner || !currentShader?.id) return;
      const checkpoint = {
        presetId,
        shaderId: currentShader.id,
        source: appliedSource,
        summary: summarizeAgentVersion(summary),
        description: nextDescription,
      };
      if (
        lastSuccessfulCompileRef.current.presetId === presetId &&
        lastSuccessfulCompileRef.current.source === appliedSource
      ) {
        setPendingAgentCheckpoint({
          ...checkpoint,
          values: lastSuccessfulCompileRef.current.values,
        });
      } else {
        pendingAgentCheckpointRef.current = checkpoint;
      }
    },
    [currentShader?.id, isOwner, presetId]
  );

  useEffect(() => {
    if (!pendingAgentCheckpoint) {
      window.clearTimeout(agentCheckpointRetryTimerRef.current);
      agentCheckpointRetryTimerRef.current = 0;
      return;
    }
    if (
      (draftSessionRef.current.presetId !== pendingAgentCheckpoint.presetId ||
        currentShader?.id !== pendingAgentCheckpoint.shaderId ||
        sourceRef.current !== pendingAgentCheckpoint.source)
    ) {
      window.clearTimeout(agentCheckpointRetryTimerRef.current);
      agentCheckpointRetryTimerRef.current = 0;
      setPendingAgentCheckpoint(null);
      return;
    }
    if (
      agentCheckpointSavingRef.current ||
      saving ||
      !isOwner ||
      !currentShader?.id ||
      currentShader.id !== pendingAgentCheckpoint.shaderId ||
      sourceRef.current !== pendingAgentCheckpoint.source
    ) {
      return;
    }
    if (conflictBlockedShaderRef.current === currentShader.id) return;
    const backoffMs = cloudWriteBackoffUntilRef.current - Date.now();
    if (backoffMs > 0) {
      window.clearTimeout(agentCheckpointRetryTimerRef.current);
      const checkpoint = pendingAgentCheckpoint;
      agentCheckpointRetryTimerRef.current = window.setTimeout(() => {
        agentCheckpointRetryTimerRef.current = 0;
        setPendingAgentCheckpoint((current) =>
          current === checkpoint ? { ...current } : current
        );
      }, backoffMs);
      return;
    }
    window.clearTimeout(agentCheckpointRetryTimerRef.current);
    agentCheckpointRetryTimerRef.current = 0;
    agentCheckpointSavingRef.current = true;
    const checkpoint = pendingAgentCheckpoint;
    saveShader({
      background: true,
      checkpointKind: "agent",
      checkpointSummary: checkpoint.summary,
      descriptionOverride: checkpoint.description,
      sourceOverride: checkpoint.source,
      valuesOverride: checkpoint.values,
      notice: null,
    })
      .then(() => {
        window.clearTimeout(agentCheckpointRetryTimerRef.current);
        agentCheckpointRetryTimerRef.current = 0;
        setPendingAgentCheckpoint((current) =>
          current === checkpoint ? null : current
        );
      })
      .catch((checkpointError) => {
        // saveShader preserves the local source and surfaces the error.
        if (!isTransientCloudWriteError(checkpointError)) return;
        const retryDelay = Math.max(
          1000,
          cloudWriteBackoffUntilRef.current - Date.now()
        );
        window.clearTimeout(agentCheckpointRetryTimerRef.current);
        agentCheckpointRetryTimerRef.current = window.setTimeout(() => {
          agentCheckpointRetryTimerRef.current = 0;
          setPendingAgentCheckpoint((current) =>
            current === checkpoint ? { ...current } : current
          );
        }, retryDelay);
      })
      .finally(() => {
        agentCheckpointSavingRef.current = false;
      });
  }, [currentShader?.id, isOwner, pendingAgentCheckpoint, saveShader, saving]);

  useEffect(
    () => () => window.clearTimeout(agentCheckpointRetryTimerRef.current),
    []
  );

  useEffect(() => {
    if (
      pendingAgentCheckpointRef.current &&
      pendingAgentCheckpointRef.current.presetId !== presetId
    ) {
      pendingAgentCheckpointRef.current = null;
    }
  }, [presetId]);

  useEffect(() => {
    clearVersionPreviewMedia();
    versionPreviewCacheRef.current.clear();
    versionPreviewStateRef.current = null;
    versionPreviewAppliedRef.current = false;
    versionPreviewSnapshotRef.current = null;
    versionPreviewRequestRef.current += 1;
  }, [clearVersionPreviewMedia, currentShader?.id]);

  useEffect(() => {
    if (
      conflictBlockedShaderRef.current &&
      conflictBlockedShaderRef.current !== currentShader?.id
    ) {
      conflictBlockedShaderRef.current = null;
    }
  }, [currentShader?.id]);

  const openShaderVersions = useCallback(() => {
    if (versionsLoading || shaderVersions.length || !versionsHasMore) return;
    loadShaderVersions({ reset: true }).catch(onPersistenceError);
  }, [
    loadShaderVersions,
    onPersistenceError,
    shaderVersions.length,
    versionsHasMore,
    versionsLoading,
  ]);

  const loadMoreShaderVersions = useCallback(() => {
    if (versionsLoading || !versionsHasMore) return;
    loadShaderVersions().catch(onPersistenceError);
  }, [
    loadShaderVersions,
    onPersistenceError,
    versionsHasMore,
    versionsLoading,
  ]);

  const clearShaderVersionPreview = useCallback(() => {
    const snapshot = versionPreviewSnapshotRef.current;
    const restoreSnapshot = versionPreviewRestoreSnapshot(
      snapshot,
      versionPreviewAppliedRef.current,
    );
    versionPreviewStateRef.current = null;
    versionPreviewAppliedRef.current = false;
    versionPreviewSnapshotRef.current = null;
    versionPreviewRequestRef.current += 1;
    setVersionPreviewLoading(false);
    compileGenerationRef.current += 1;
    clearVersionPreviewMedia();
    if (!restoreSnapshot) return;
    compile(restoreSnapshot.source, { force: true });
    if (
      restoreSnapshot.kind === "effect" &&
      !usesCompositionHost("effect", effectFillsRef.current)
    ) {
      const mediaRestore = restoreSnapshot.pendingMedia
        ? applyMediaBlob(
            restoreSnapshot.pendingMedia,
            mediaType(restoreSnapshot.pendingMedia) ||
              restoreSnapshot.pendingMedia.type,
          )
        : loadMediaForShader(restoreSnapshot.shader);
      mediaRestore.catch(() => {});
    }
  }, [
    applyMediaBlob,
    clearVersionPreviewMedia,
    compile,
    loadMediaForShader,
  ]);
  clearShaderVersionPreviewRef.current = clearShaderVersionPreview;

  const previewShaderVersion = useCallback(
    async (versionId) => {
      if (!currentShader?.id || !runtimeReady) return;

      if (!versionId) {
        clearShaderVersionPreview();
        return;
      }

      const liveVersionId = shaderVersions[0]?.id || null;
      if (
        versionId === liveVersionId &&
        !dirty &&
        !hasUncheckpointedShaderState(currentShader)
      ) {
        clearShaderVersionPreview();
        return;
      }

      if (versionPreviewStateRef.current?.versionId === versionId) return;

      const requestId = ++versionPreviewRequestRef.current;
      setVersionPreviewLoading(true);

      try {
        let target = versionPreviewCacheRef.current.get(versionId);
        if (!target) {
          target = await getShaderVersion(currentShader.id, versionId);
          versionPreviewCacheRef.current.set(versionId, target);
        }
        if (target.snapshot_schema_version !== 2) {
          clearShaderVersionPreview();
          return;
        }
        const hydratedComposition = await hydrateCompositionMediaUrls(
          target.composition
        );
        if (hydratedComposition !== target.composition) {
          target = { ...target, composition: hydratedComposition };
          versionPreviewCacheRef.current.set(versionId, target);
        }
        if (requestId !== versionPreviewRequestRef.current) return;

        const host = hostRef.current;
        if (!host?.ready) return;

        if (target.kind === COMPOSITION_KIND) {
          if (!versionPreviewSnapshotRef.current) {
            versionPreviewSnapshotRef.current = {
              source: sourceRef.current,
              kind: sessionKindRef.current,
              shader: currentShader,
              pendingMedia,
            };
          }
          versionPreviewStateRef.current = { versionId };
          versionPreviewAppliedRef.current = true;
          await compileComposition(target.composition, {
            layerSourceOverrides: dependencyLayerSourceOverrides(
              target.composition,
              target.dependency_snapshots
            ),
            syncEditorState: false,
          });
          return;
        }

        let loaded;
        try {
          loaded = loadModule(target.source);
        } catch {
          return;
        }

        const nextValues = mergeValues(
          loaded.props,
          target.parameter_values || {}
        );
        if (!versionPreviewSnapshotRef.current) {
          versionPreviewSnapshotRef.current = {
            source: sourceRef.current,
            kind: sessionKindRef.current,
            shader: currentShader,
            pendingMedia,
          };
        }
        versionPreviewStateRef.current = { versionId };
        versionPreviewAppliedRef.current = true;

        if (target.kind === "effect") {
          const previewFills = readEffectFillsFromComposition(
            target.composition,
            effectFillsRef.current
          );
          if (usesCompositionHost("effect", previewFills)) {
            const previewGraph = {
              fills: previewFills,
              effects: [
                {
                  id: EFFECT_PREVIEW_LAYER_ID,
                  shaderId: draftSessionRef.current.presetId,
                  values: nextValues,
                  enabled: true,
                },
              ],
            };
            const previewLayerSources = dependencyLayerSourceOverrides(
              previewGraph,
              target.dependency_snapshots
            );
            previewLayerSources.set(EFFECT_PREVIEW_LAYER_ID, target.source);
            await compileComposition(
              previewGraph,
              {
                layerSourceOverrides: previewLayerSources,
                syncEditorState: false,
              }
            );
            return;
          }
        }

        const nextFeatures = inferFeatures(target.source);
        const previewGeneration = ++compileGenerationRef.current;
        host.pause();
        const ok = await host.setModule(
          { setup: loaded.setup, render: loaded.render },
          {
            isFill: detectKind(target.source) === "fill",
            isAnimated: nextFeatures.isAnimated,
            usesMouse: nextFeatures.usesMouse,
            supportsRenderScale: supportsRenderScale(target.source),
            supportsAudio: false,
          }
        );
        if (
          requestId !== versionPreviewRequestRef.current ||
          previewGeneration !== compileGenerationRef.current
        ) {
          return;
        }
        if (!ok) {
          clearShaderVersionPreview();
          return;
        }
        if (target.kind === "effect") {
          await loadMediaForShader(target, { previewOnly: true });
          if (
            requestId !== versionPreviewRequestRef.current ||
            previewGeneration !== compileGenerationRef.current
          ) {
            return;
          }
        }
        host.setParams(nextValues);
        host.setActive(true);
        if (playPreferenceRef.current && nextFeatures.isAnimated) {
          host.play();
        } else {
          host.redraw();
        }
      } catch {
        // Ignore preview failures while browsing version history.
      } finally {
        if (requestId === versionPreviewRequestRef.current) {
          setVersionPreviewLoading(false);
        }
      }
    },
    [
      clearShaderVersionPreview,
      compileComposition,
      currentShader,
      dirty,
      loadMediaForShader,
      pendingMedia,
      runtimeReady,
      shaderVersions,
    ]
  );

  const restoreSelectedVersion = useCallback(
    async (versionId) => {
      if (
        !versionId ||
        versionId.startsWith("__") ||
        !isOwner ||
        !currentShader?.id ||
        restoringVersion
      ) {
        return;
      }
      versionPreviewStateRef.current = null;
      versionPreviewAppliedRef.current = false;
      versionPreviewSnapshotRef.current = null;
      versionPreviewRequestRef.current += 1;
      clearVersionPreviewMedia();
      const restoreShaderId = currentShader.id;
      const restorePresetId = cloudChoiceId(restoreShaderId);
      setRestoringVersion(true);
      setError(null);
      try {
        const target = await getShaderVersion(restoreShaderId, versionId);
        if (target.snapshot_schema_version !== 2) {
          throw new Error(
            `Version ${target.version_number} predates complete visual snapshots and cannot be restored safely.`
          );
        }
        const validation =
          target.kind === COMPOSITION_KIND
            ? { ok: true }
            : validateModuleSource(target.source);
        if (!validation.ok) {
          throw new Error(
            `Version ${target.version_number} cannot be restored: ${validation.reason}`
          );
        }

        let expectedShader = currentShader;
        if (dirty) {
          expectedShader =
            (await saveShader({
              checkpointKind: "before_restore",
              checkpointSummary: "Before restoring an earlier version",
              notice: null,
            })) || expectedShader;
        }

        const restored = await shaderSaveQueue.enqueue(
          restoreShaderId,
          async () => {
            const result = await withExclusiveShaderSave(restoreShaderId, () =>
              restoreShaderVersion({
                shaderId: restoreShaderId,
                versionId,
                expectedStateRevision: expectedStateRevision(
                  committedStateRevisionsRef.current,
                  expectedShader,
                ),
              })
            );
            return result.value;
          }
        );
        rememberStateRevision(
          committedStateRevisionsRef.current,
          restored,
        );
        setCloudShaders((current) => [
          restored,
          ...current.filter((item) => item.id !== restored.id),
        ]);
        if (draftSessionRef.current.presetId === restorePresetId) {
          const restoredComposition = await hydrateCompositionMediaUrls(
            restored.composition
          );
          if (draftSessionRef.current.presetId !== restorePresetId) return;
          const nextComposition =
            restored.kind === COMPOSITION_KIND
              ? normalizeComposition(restoredComposition)
              : null;
          activeDependencySnapshotsRef.current =
            restored.dependency_snapshots &&
            typeof restored.dependency_snapshots === "object"
              ? structuredClone(restored.dependency_snapshots)
              : {};
          sourceRef.current = restored.source || "";
          sessionKindRef.current = restored.kind;
          compositionRef.current = nextComposition;
          pendingValuesRef.current = restored.parameter_values || {};
          sessionInputAppliedRef.current = null;
          setCurrentShader(restored);
          setSource(restored.source || "");
          setSessionKind(restored.kind);
          setComposition(nextComposition);
          setSupportsAudio(Boolean(restored.features?.supportsAudio));
          setDocumentInputs(readDocumentInputs(restoredComposition));
          let restoredFills = [];
          if (restored.kind === "effect") {
            restoredFills = readEffectFillsFromComposition(
              restoredComposition,
              [],
            );
            effectFillsRef.current = restoredFills;
            effectFillRef.current = restoredFills[0] || null;
            setEffectFills(restoredFills);
            setEffectFill(restoredFills[0] || null);
          } else {
            effectFillsRef.current = [];
            effectFillRef.current = null;
            setEffectFills([]);
            setEffectFill(null);
          }
          if (
            restored.kind === "effect" &&
            restoredFills.length === 0
          ) {
            sessionInputAppliedRef.current = restorePresetId;
          }
          await refreshRestoredRuntime({
            restored,
            composition: nextComposition,
            effectFills: restoredFills,
            layerSourceOverrides: dependencyLayerSourceOverrides(
              nextComposition,
              activeDependencySnapshotsRef.current,
            ),
            compile,
            compileComposition,
            loadMedia: loadMediaForShader,
            restoreDefaultInput: () =>
              restoreSample(++inputApplyGenRef.current),
          });
          setPendingMedia(null);
          setDirty(false);
          lastSavedFingerprintRef.current = editorPersistenceFingerprint(
            buildShaderDocumentSnapshot(restored),
            {
              name: restored.name,
              description: restored.description,
            }
          );
          await refreshShaderVersions(restored.id);
          showNotice(`Restored Version ${target.version_number}.`);
        }
      } catch (restoreError) {
        if (isShaderStateConflict(restoreError)) {
          try {
            const latest = await getShader(restoreShaderId);
            rememberStateRevision(
              committedStateRevisionsRef.current,
              latest,
            );
            setCloudShaders((current) => [
              latest,
              ...current.filter((item) => item.id !== latest.id),
            ]);
            if (draftSessionRef.current.presetId === restorePresetId) {
              await refreshShaderVersions();
            }
          } catch {
            // Preserve the local editor state when refresh fails.
          }
          showNotice(
            "This shader changed in another tab. Nothing was restored.",
            { error: true }
          );
        }
        reportAppError(restoreError.message || String(restoreError));
      } finally {
        setRestoringVersion(false);
      }
    },
    [
      currentShader,
      clearVersionPreviewMedia,
      compile,
      compileComposition,
      dirty,
      isOwner,
      loadMediaForShader,
      refreshShaderVersions,
      restoreSample,
      restoringVersion,
      saveShader,
      showNotice,
    ]
  );

  useEffect(() => {
    if (
      viewMode !== "editor" ||
      !user ||
      !currentShader ||
      pendingAgentCheckpoint ||
      agentCheckpointSavingRef.current
    ) {
      return;
    }
    const documentSnapshot = captureDocumentSnapshot();
    const currentFingerprint = editorPersistenceFingerprint(documentSnapshot, {
      name: shaderName.trim() || "Untitled Shader",
      description: shaderDescription,
    });
    const liveFills =
      documentSnapshot.kind === COMPOSITION_KIND
        ? normalizeComposition(compositionRef.current).fills
        : documentSnapshot.kind === "effect"
          ? effectFillsRef.current
          : [];
    const disposition = getAutosaveDisposition({
      dirty,
      isOwner,
      visibilityMatches:
        Boolean(isPublic) === Boolean(currentShader.is_public),
      conflictBlocked:
        conflictBlockedShaderRef.current === currentShader.id,
      hasPendingMedia:
        Boolean(pendingMedia) || fillMediaEntries(liveFills).length > 0,
      mediaPersistenceReady: true,
      saveInProgress: saving,
      queueBusy: shaderSaveQueue.isBusy(currentShader.id),
      currentFingerprint,
      savedFingerprint: lastSavedFingerprintRef.current,
    });
    if (disposition.disposition === AUTOSAVE_DISPOSITION.NO_OP) {
      if (disposition.reason === "fingerprint-match" && dirty) setDirty(false);
      return;
    }
    if (disposition.disposition === AUTOSAVE_DISPOSITION.SKIP_RETRY) {
      if (
        disposition.reason === "visibility-change-requires-explicit-save" ||
        disposition.reason === "state-conflict-requires-explicit-save"
      ) {
        return;
      }
      const retry = window.setTimeout(
        () => setAutosaveRetryRevision((revision) => revision + 1),
        1000
      );
      return () => window.clearTimeout(retry);
    }
    const delay = Math.max(
      BACKGROUND_AUTOSAVE_MS,
      cloudWriteBackoffUntilRef.current - Date.now()
    );
    const timer = window.setTimeout(() => {
      if (
        pendingAgentCheckpointRef.current ||
        agentCheckpointSavingRef.current
      ) {
        return;
      }
      saveShader({ background: true, notice: null }).catch(() => {
        // The editor remains dirty so a later edit or explicit Save can retry.
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    autosaveRetryRevision,
    captureDocumentSnapshot,
    currentShader,
    dirty,
    isOwner,
    isPublic,
    pendingAgentCheckpoint,
    pendingMedia,
    saveShader,
    saving,
    shaderDescription,
    shaderName,
    user,
    viewMode,
  ]);

  const publishShader = useCallback(async () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (saving) return;
    setPublishOpen(false);
    setPublishToast({ phase: "publishing" });
    try {
      const saved = await saveShader({ makePublic: true, notice: null });
      if (!saved) {
        setPublishToast(null);
        return;
      }
      setPublishToast({
        phase: "done",
        url: makeShareUrl(saved.id, saved.kind),
        kind: saved.kind,
      });
    } catch (publishError) {
      setPublishToast(null);
      const message = formatSupabaseError(publishError, "Publish failed.");
      showNotice(message, { error: true });
    }
  }, [saveShader, saving, showNotice, user]);

  const unpublishShader = useCallback(async () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!isOwner || saving) return;
    try {
      const rows = await listPublicShaderGraphs({ limit: 500 });
      const parents = publicItemsReferencing(currentShader?.id, rows);
      if (parents.length) {
        throw new Error(
          `Unpublish the referencing ${parents.length === 1 ? "item" : "items"} first: ${parents.map((item) => item.name).join(", ")}.`
        );
      }
      const saved = await saveShader({
        makePrivate: true,
        notice: "Shader unpublished",
      });
      if (!saved) return;
    } catch (unpublishError) {
      const message = formatSupabaseError(unpublishError, "Unpublish failed.");
      showNotice(message, { error: true });
    }
  }, [currentShader?.id, isOwner, saveShader, saving, showNotice, user]);

  const duplicateShaderVersion = useCallback(
    async (versionId) => {
      if (
        !versionId ||
        versionId.startsWith("__") ||
        !user ||
        !isOwner ||
        !currentShader?.id ||
        duplicating
      ) {
        return;
      }
      setDuplicating(true);
      setError(null);
      clearShaderVersionPreview();
      try {
        persistActiveDraft();
        let target = versionPreviewCacheRef.current.get(versionId);
        if (!target) {
          target = await getShaderVersion(currentShader.id, versionId);
          versionPreviewCacheRef.current.set(versionId, target);
        }
        if (target.snapshot_schema_version !== 2) {
          throw new Error(
            `Version ${target.version_number} predates complete visual snapshots and cannot be duplicated safely.`
          );
        }
        const validation =
          target.kind === COMPOSITION_KIND
            ? { ok: true }
            : validateModuleSource(target.source);
        if (!validation.ok) {
          throw new Error(
            `Version ${target.version_number} cannot be duplicated: ${validation.reason}`
          );
        }

        const duplicateKind = target.kind;
        const targetComposition = target.composition || {};
        const versionFills =
          duplicateKind === COMPOSITION_KIND
            ? normalizeComposition(targetComposition).fills
            : duplicateKind === "effect"
              ? readEffectFillsFromComposition(targetComposition, [])
              : [];
        const documentSnapshot = buildShaderDocumentSnapshot(target);
        const sourceThreadKey = chatShaderKey;
        const copiedPlan = await readPlanForCopy({
          threadKey: sourceThreadKey,
          ownerId: currentShader.owner_id,
          shaderId: currentShader.id,
        });

        let mediaFile = null;
        if (duplicateKind === "effect" && target.input_path) {
          const blob = await downloadAsset(target.input_path);
          mediaFile = new File(
            [blob],
            target.input_name || "input",
            { type: target.input_mime_type || blob.type }
          );
        }

        const cloudId = cloudIdForDraft(`draft:${crypto.randomUUID()}`);
        const { durableFills, firstInput } =
          await uploadFillAssetsForTarget({
            fills: versionFills,
            ownerId: user.id,
            shaderId: cloudId,
            copyDurableAssets: true,
          });
        let durableInput = firstInput;
        if (!durableInput.path && mediaFile && duplicateKind === "effect") {
          if (mediaFile.size > MAX_MEDIA_BYTES) {
            throw new Error("Input media must be 25 MB or smaller.");
          }
          const contentType = mediaType(mediaFile);
          durableInput = {
            path: await uploadAsset({
              ownerId: user.id,
              shaderId: cloudId,
              role: "input",
              blob: mediaFile,
              fileName: mediaFile.name,
              contentType,
            }),
            name: mediaFile.name,
            mimeType: contentType,
          };
        }

        const durableInputs = await uploadDocumentInputAudio({
          inputs: readDocumentInputs(targetComposition),
          ownerId: user.id,
          shaderId: cloudId,
          copyDurableAssets: true,
          fileFromUrl: fileFromBlobUrl,
          downloadAsset,
          uploadAsset,
          mediaType,
          maxBytes: MAX_MEDIA_BYTES,
        });
        const durableComposition = compositionWithDocumentInputs(
          duplicateKind,
          targetComposition,
          durableFills,
          durableInputs,
        );
        const durableDocument = buildShaderDocumentSnapshot({
          ...documentSnapshot,
          composition: durableComposition,
          effectFills: durableFills,
          input: durableInput,
          // A historical duplicate must keep the dependency versions captured
          // by that checkpoint instead of resolving today's live versions.
          dependencySnapshots: documentSnapshot.dependencySnapshots,
        });
        const versionNumber = Number(target.version_number || 0);
        const name = `${shaderName || "Untitled Shader"}${
          versionNumber ? ` Version ${versionNumber}` : ""
        } Copy`;
        const saved = await createShader({
          id: cloudId,
          owner_id: user.id,
          name,
          description: shaderDescription,
          ...buildShaderDocumentPayload(durableDocument),
          is_public: false,
          ...figmaShaderLink(null),
        });
        setCloudShaders((current) => [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
        lastSavedFingerprintRef.current = editorPersistenceFingerprint(
          durableDocument,
          { name, description: shaderDescription }
        );
        const targetThreadKey = `cloud:${saved.id}`;
        await copyPlanToCloud(
          targetThreadKey,
          copiedPlan,
          user.id,
          saved.id
        );
        copyChatThreadKey(sourceThreadKey, targetThreadKey);
        copyCursorAgentThreadKey(sourceThreadKey, targetThreadKey);
        await activateShaderSession({
          sessionId: cloudChoiceId(saved.id),
          routeId: saved.id,
          name,
          description: saved.description || "",
          source: saved.source,
          kind: saved.kind,
          composition: saved.composition,
          values: saved.parameter_values || {},
          public: false,
          media: null,
          dirty: false,
          cloudShader: saved,
          persistPrevious: false,
        });
        showNotice(
          versionNumber
            ? `Duplicated Version ${versionNumber}`
            : "Version duplicated"
        );
      } catch (duplicateError) {
        const message =
          duplicateError.message || "Could not duplicate this version";
        showNotice(message, { error: true });
      } finally {
        setDuplicating(false);
      }
    },
    [
      activateShaderSession,
      chatShaderKey,
      clearShaderVersionPreview,
      currentShader,
      duplicating,
      isOwner,
      persistActiveDraft,
      shaderDescription,
      shaderName,
      showNotice,
      user,
    ]
  );

  const duplicateShader = useCallback(async () => {
    if (duplicating) return;
    setDuplicating(true);
    try {
      persistActiveDraft();
      const duplicateKind =
        sessionKindRef.current === COMPOSITION_KIND
          ? COMPOSITION_KIND
          : detectKind(sourceRef.current);
      const liveGraph =
        duplicateKind === COMPOSITION_KIND
          ? compositionWithLayerValues(
              compositionRef.current,
              selectedLayerIdRef.current,
              valuesRef.current
            )
          : null;
      const liveFills =
        duplicateKind === COMPOSITION_KIND
          ? normalizeComposition(liveGraph).fills
          : duplicateKind === "effect"
            ? normalizeComposition({
                fills: effectFillsRef.current,
                effects: [],
              }).fills
            : [];
      const documentSnapshot = captureDocumentSnapshot({
        kind: duplicateKind,
        composition: liveGraph,
        effectFills: liveFills,
      });
      const sourceThreadKey = chatShaderKey;
      const copiedPlan = await readPlanForCopy({
        threadKey: sourceThreadKey,
        ownerId:
          currentShader && user && currentShader.owner_id === user.id
            ? currentShader.owner_id
            : null,
        shaderId:
          currentShader && user && currentShader.owner_id === user.id
            ? currentShader.id
            : null,
      });
      let mediaFile = pendingMedia;
      if (!mediaFile && currentShader?.input_path) {
        try {
          const blob = await downloadAsset(currentShader.input_path);
          mediaFile = new File(
            [blob],
            currentShader.input_name || "input",
            { type: currentShader.input_mime_type || blob.type }
          );
        } catch {
          mediaFile = null;
        }
      }
      const id = `draft:${crypto.randomUUID()}`;
      const name = `${shaderName || "Untitled Shader"} Copy`;
      if (user) {
        const cloudId = cloudIdForDraft(id);
        const { durableFills, firstInput } =
          await uploadFillAssetsForTarget({
            fills: liveFills,
            ownerId: user.id,
            shaderId: cloudId,
            copyDurableAssets: true,
          });
        let durableInput = firstInput;
        if (!durableInput.path && mediaFile && duplicateKind === "effect") {
          if (mediaFile.size > MAX_MEDIA_BYTES) {
            throw new Error("Input media must be 25 MB or smaller.");
          }
          const contentType = mediaType(mediaFile);
          durableInput = {
            path: await uploadAsset({
              ownerId: user.id,
              shaderId: cloudId,
              role: "input",
              blob: mediaFile,
              fileName: mediaFile.name,
              contentType,
            }),
            name: mediaFile.name,
            mimeType: contentType,
          };
        }
        const durableInputs = await uploadDocumentInputAudio({
          inputs: liveSessionInputs(
            duplicateKind,
            liveGraph,
            documentInputsRef.current,
          ),
          ownerId: user.id,
          shaderId: cloudId,
          copyDurableAssets: true,
          fileFromUrl: fileFromBlobUrl,
          downloadAsset,
          uploadAsset,
          mediaType,
          maxBytes: MAX_MEDIA_BYTES,
        });
        const durableComposition = compositionWithDocumentInputs(
          duplicateKind,
          liveGraph || {},
          durableFills,
          durableInputs,
        );
        const dependencyGraph =
          duplicateKind === COMPOSITION_KIND
            ? durableComposition
            : duplicateKind === "effect"
              ? normalizeComposition({ fills: durableFills, effects: [] })
              : emptyComposition();
        const dependencySnapshots = buildCompositionDependencySnapshots({
          graph: dependencyGraph,
          resolvedByKey: new Map(Object.entries(resolvedShaders)),
          liveByKey: liveShaderSourceRef.current,
          cloudRows: cloudShaders,
          existingSnapshots: documentSnapshot.dependencySnapshots,
        });
        const durableDocument = buildShaderDocumentSnapshot({
          ...documentSnapshot,
          composition: durableComposition,
          effectFills: durableFills,
          input: durableInput,
          dependencySnapshots,
        });
        const saved = await createShader({
          id: cloudId,
          owner_id: user.id,
          name,
          description: shaderDescription,
          ...buildShaderDocumentPayload(durableDocument),
          is_public: false,
          ...figmaShaderLink(null),
        });
        setCloudShaders((current) => [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
        lastSavedFingerprintRef.current = editorPersistenceFingerprint(
          durableDocument,
          { name, description: shaderDescription }
        );
        const targetThreadKey = `cloud:${saved.id}`;
        await copyPlanToCloud(
          targetThreadKey,
          copiedPlan,
          user.id,
          saved.id
        );
        copyChatThreadKey(sourceThreadKey, targetThreadKey);
        copyCursorAgentThreadKey(sourceThreadKey, targetThreadKey);
        await activateShaderSession({
          sessionId: cloudChoiceId(saved.id),
          routeId: saved.id,
          name,
          description: saved.description || "",
          source: saved.source,
          kind: saved.kind,
          composition: saved.composition,
          values: saved.parameter_values || {},
          public: false,
          media: null,
          dirty: false,
          cloudShader: saved,
          persistPrevious: false,
        });
        showNotice("Private draft created");
        return;
      }
      const liveInputs = liveSessionInputs(
        duplicateKind,
        liveGraph,
        documentInputsRef.current,
      );
      const annotatedFills = await persistLocalDraftMedia(
        id,
        liveFills,
        mediaFile,
        liveInputs,
      );
      const localComposition = compositionWithDocumentInputs(
        duplicateKind,
        liveGraph || {},
        annotatedFills,
        liveInputs,
      );
      const draft = {
        id,
        name,
        description: shaderDescription,
        kind: documentSnapshot.kind,
        source: documentSnapshot.source,
        values: documentSnapshot.parameterValues,
        composition: localComposition,
        effectFills:
          documentSnapshot.kind === "effect" ? annotatedFills : undefined,
        effectFill:
          documentSnapshot.kind === "effect"
            ? annotatedFills[0] || null
            : undefined,
        dependencySnapshots: documentSnapshot.dependencySnapshots,
        isPublic: false,
        pendingMedia: mediaFile,
        // A duplicate is a new local shader, not a second writer for the same
        // remote Figma resource. Only the imported original keeps its link.
        ...figmaShaderLink(null),
      };
      setDrafts((current) => [draft, ...current]);
      const targetThreadKey = `preset:${id}`;
      if (isPlanDocument(copiedPlan)) {
        saveLocalPlan(targetThreadKey, copiedPlan);
      }
      copyChatThreadKey(sourceThreadKey, targetThreadKey);
      copyCursorAgentThreadKey(sourceThreadKey, targetThreadKey);
      await activateShaderSession({
        sessionId: id,
        routeId: id,
        name,
        description: draft.description,
        source: draft.source,
        kind: draft.kind,
        composition: draft.composition,
        values: draft.values,
        public: false,
        media: mediaFile,
        dependencySnapshots: draft.dependencySnapshots,
        dirty: true,
        persistPrevious: false,
      });
      showNotice("Unsaved copy created");
    } catch (duplicateError) {
      showNotice(duplicateError.message || "Could not duplicate shader", {
        error: true,
      });
    } finally {
      setDuplicating(false);
    }
  }, [
    activateShaderSession,
    captureDocumentSnapshot,
    chatShaderKey,
    cloudShaders,
    currentShader,
    duplicating,
    pendingMedia,
    persistActiveDraft,
    resolvedShaders,
    shaderDescription,
    shaderName,
    showNotice,
    user,
  ]);

  const removeCloudShader = useCallback(
    async (shader) => {
      if (!user || !shader || shader.owner_id !== user.id) return false;
      try {
        const rows = await listPublicShaderGraphs({ limit: 500 });
        const parents = publicItemsReferencing(shader.id, rows);
        if (parents.length) {
          throw new Error(
            `Delete or unpublish the referencing ${parents.length === 1 ? "item" : "items"} first: ${parents.map((item) => item.name).join(", ")}.`
          );
        }
        const [assetPaths, thumbnailPaths, retainedAssets] = await Promise.all([
          listShaderAssetPaths(shader.owner_id, shader.id),
          listShaderThumbnailPaths(shader.owner_id, shader.id),
          listRetainedShaderAssetPaths(shader.id),
        ]);
        const retained = new Set(retainedAssets);
        const disposableAssets = assetPaths.filter(
          (path) => !retained.has(path),
        );
        await deleteShader(shader.id);
        const cleanupResults = await Promise.allSettled([
          removeShaderPlan(shader.owner_id, shader.id),
          removeAssets(disposableAssets),
          removeThumbnailAssets(thumbnailPaths),
        ]);
        setCloudShaders((current) =>
          current.filter((item) => item.id !== shader.id)
        );
        selectAfterLibraryDelete(cloudChoiceId(shader.id));
        showNotice(
          cleanupResults.some((result) => result.status === "rejected")
            ? "Shader deleted; some stored files could not be cleaned up"
            : "Shader deleted",
          {
            error: cleanupResults.some(
              (result) => result.status === "rejected",
            ),
          },
        );
        return true;
      } catch (deleteError) {
        showNotice(deleteError.message || String(deleteError), { error: true });
        return false;
      }
    },
    [selectAfterLibraryDelete, showNotice, user]
  );

  const removeCurrentShader = useCallback(() => {
    if (!isOwner || !currentShader) return;
    setDeleteTarget({ cloud: currentShader, name: currentShader.name });
  }, [currentShader, isOwner]);

  const copyShaderCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sourceRef.current);
      showNotice("Code copied to clipboard");
    } catch (copyError) {
      showNotice(copyError.message || "Could not copy code", { error: true });
    }
  }, [showNotice]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    if (deleteTarget.draft) {
      removeDraft(deleteTarget.draft);
      showNotice("Shader deleted");
      setDeleteTarget(null);
      setDeleting(false);
      return;
    }
    const deleted = await removeCloudShader(deleteTarget.cloud);
    if (deleted) setDeleteTarget(null);
    setDeleting(false);
  }, [
    deleteTarget,
    deleting,
    removeCloudShader,
    removeDraft,
    showNotice,
  ]);

  const copyShareLink = useCallback(async () => {
    if (!currentShader || dirty) {
      showNotice("Save the shader before sharing");
      return;
    }
    if (!currentShader.is_public) {
      showNotice("Make the shader public before sharing");
      return;
    }
    await navigator.clipboard.writeText(
      makeShareUrl(currentShader.id, currentShader.kind)
    );
    showNotice("Share link copied");
  }, [currentShader, dirty, showNotice]);

  const openExportDialog = useCallback((tab = "image") => {
    if (tab === "image" || tab === "video" || tab === "embed") {
      setExportTab(tab);
    }
    setExportOpen(true);
  }, []);

  const iframeEmbedSelected =
    videoExportSettings.embedFormat === "iframe";
  const iframeEmbedAvailable = Boolean(currentShader?.id && !dirty);
  const iframeEmbedUnavailableMessage = !currentShader
    ? "Save this item before creating an iframe embed."
    : dirty
      ? "Save your changes before creating an iframe embed."
      : "";
  const embedUrl = currentShader
    ? makeEmbedUrl(currentShader.id, currentShader.kind)
    : "";
  const iframeEmbedCode = iframeEmbedAvailable
    ? `<iframe src="${embedUrl}" title="${
        currentShader.kind === COMPOSITION_KIND
          ? "Composition preview"
          : "Shader preview"
      }" width="800" height="600" style="border: 0;" loading="lazy" allow="webgpu; camera" allowfullscreen></iframe>`
    : "";
  const standaloneEmbedCode = useMemo(() => {
    if (!exportOpen) return "";
    if (kind === COMPOSITION_KIND) {
      return buildStandaloneEmbedCode({
        composition: serializeCompositionExport(
          composition,
          pinAwareResolvedByKey,
          null
        ),
      });
    }
    return buildStandaloneEmbedCode({
      source,
      values,
      kind,
    });
  }, [composition, exportOpen, kind, pinAwareResolvedByKey, source, values]);
  const embedCode =
    iframeEmbedSelected
      ? iframeEmbedCode
      : standaloneEmbedCode;

  const copyEmbedLink = useCallback(async () => {
    if (!embedUrl) {
      showNotice("Save this item before copying an embed link.");
      return;
    }
    try {
      await navigator.clipboard.writeText(embedUrl);
      showNotice("Embed link copied");
    } catch (copyError) {
      showNotice(copyError.message || "Could not copy embed link", {
        error: true,
      });
    }
  }, [embedUrl, showNotice]);

  const copyEmbedCode = useCallback(async () => {
    if (iframeEmbedSelected && !iframeEmbedAvailable) {
      showNotice(iframeEmbedUnavailableMessage);
      return;
    }
    try {
      await navigator.clipboard.writeText(embedCode);
      showNotice("Embed code copied");
    } catch (copyError) {
      showNotice(copyError.message || "Could not copy embed code", {
        error: true,
      });
    }
  }, [
    embedCode,
    iframeEmbedAvailable,
    iframeEmbedSelected,
    iframeEmbedUnavailableMessage,
    showNotice,
  ]);

  const downloadEmbedCode = useCallback(() => {
    if (iframeEmbedSelected && !iframeEmbedAvailable) {
      showNotice(iframeEmbedUnavailableMessage);
      return;
    }
    const fileName = shaderModuleFileName(presetId, shaderName).replace(
      /\.ts$/,
      ".html"
    );
    const url = URL.createObjectURL(
      new Blob([embedCode], { type: "text/html;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [
    embedCode,
    iframeEmbedAvailable,
    iframeEmbedSelected,
    iframeEmbedUnavailableMessage,
    presetId,
    shaderName,
    showNotice,
  ]);

  const resizeAppNav = useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const handle = event.currentTarget;
    const nav = handle.previousElementSibling;
    if (!nav) return;

    const startX = event.clientX;
    const startWidth = nav.getBoundingClientRect().width;
    const maxWidth = Math.max(
      MIN_APP_NAV_WIDTH,
      Math.min(MAX_APP_NAV_WIDTH, window.innerWidth - 420)
    );
    let finalWidth = startWidth;
    const cssWriter = createRafCssWriter(nav, "--app-nav-width");
    handle.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent) => {
      const next = Math.min(
        maxWidth,
        Math.max(
          MIN_APP_NAV_WIDTH,
          startWidth + moveEvent.clientX - startX
        )
      );
      finalWidth = next;
      cssWriter.write(next);
    };

    const onPointerUp = (upEvent) => {
      if (handle.hasPointerCapture(upEvent.pointerId)) {
        handle.releasePointerCapture(upEvent.pointerId);
      }
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerUp);
      cssWriter.flush();
      saveAppNavWidth(finalWidth);
    };

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
  }, [saveAppNavWidth]);

  const resizeCodePane = useCallback(
    (event) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const handle = event.currentTarget;
      const viewer = viewerRef.current;
      if (!viewer) return;

      if (stacked) {
        const visualizer = visualizerRef.current;
        if (!visualizer) return;

        const startY = event.clientY;
        const startHeight = visualizer.getBoundingClientRect().height;
        const available =
          viewer.getBoundingClientRect().height -
          handle.getBoundingClientRect().height -
          MIN_STACKED_SIDEBAR;
        const maxHeight = Math.max(MIN_PREVIEW_HEIGHT, available);
        let finalHeight = startHeight;
        const cssWriter = createRafCssWriter(viewer, "--preview-height");
        handle.setPointerCapture(event.pointerId);

        const onPointerMove = (moveEvent) => {
          const next = Math.min(
            maxHeight,
            Math.max(
              MIN_PREVIEW_HEIGHT,
              startHeight + moveEvent.clientY - startY
            )
          );
          finalHeight = next;
          cssWriter.write(next);
        };

        const onPointerUp = (upEvent) => {
          if (handle.hasPointerCapture(upEvent.pointerId)) {
            handle.releasePointerCapture(upEvent.pointerId);
          }
          handle.removeEventListener("pointermove", onPointerMove);
          handle.removeEventListener("pointerup", onPointerUp);
          handle.removeEventListener("pointercancel", onPointerUp);
          cssWriter.flush();
          savePreviewHeight(finalHeight);
        };

        handle.addEventListener("pointermove", onPointerMove);
        handle.addEventListener("pointerup", onPointerUp);
        handle.addEventListener("pointercancel", onPointerUp);
        return;
      }

      const codePane = sidebarRef.current;
      if (!codePane) return;
      const propertiesWidth =
        propertiesPanelRef.current?.getBoundingClientRect().width || 0;

      const startX = event.clientX;
      const startWidth = codePane.getBoundingClientRect().width;
      const available =
        viewer.getBoundingClientRect().width -
        handle.getBoundingClientRect().width -
        propertiesWidth -
        MIN_PREVIEW_WIDTH;
      const maxWidth = Math.max(MIN_CODE_WIDTH, available);
      let finalWidth = startWidth;
      const cssWriter = createRafCssWriter(viewer, "--code-width");
      handle.setPointerCapture(event.pointerId);

      const onPointerMove = (moveEvent) => {
        const next = Math.min(
          maxWidth,
          Math.max(MIN_CODE_WIDTH, startWidth + moveEvent.clientX - startX)
        );
        finalWidth = next;
        cssWriter.write(next);
      };

      const onPointerUp = (upEvent) => {
        if (handle.hasPointerCapture(upEvent.pointerId)) {
          handle.releasePointerCapture(upEvent.pointerId);
        }
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.removeEventListener("pointercancel", onPointerUp);
        cssWriter.flush();
        saveCodeWidth(finalWidth);
      };

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerUp);
    },
    [saveCodeWidth, savePreviewHeight, stacked]
  );

  const resizeChatPane = useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const handle = event.currentTarget;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const startY = event.clientY;
    const startHeight = chatHeight;
    const sidebarRect = sidebar.getBoundingClientRect();
    const handleHeight = handle.getBoundingClientRect().height;
    const maxHeight = Math.max(
      MIN_CHAT_HEIGHT,
      sidebarRect.height - handleHeight - MIN_CODE_EDITOR_HEIGHT
    );
    let finalHeight = startHeight;
    const cssWriter = createRafCssWriter(viewerRef.current, "--chat-height");
    handle.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent) => {
      // Dragging the divider up grows chat; down shrinks it.
      const next = Math.min(
        maxHeight,
        Math.max(MIN_CHAT_HEIGHT, startHeight + (startY - moveEvent.clientY))
      );
      finalHeight = next;
      cssWriter.write(next);
    };

    const onPointerUp = (upEvent) => {
      if (handle.hasPointerCapture(upEvent.pointerId)) {
        handle.releasePointerCapture(upEvent.pointerId);
      }
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerUp);
      cssWriter.flush();
      saveChatHeight(finalHeight);
    };

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
  }, [chatHeight, saveChatHeight]);

  useEffect(() => {
    const gen = ++thumbnailCaptureGenRef.current;
    if (viewMode !== "editor" || protectedPreview) return undefined;

    const host = hostRef.current;
    if (!host?.ready || !runtimeReady) return undefined;

    const targetId = presetId;
    let idleId = 0;
    const capture = () => {
      // Ensure the submitted frame matches the latest committed params.
      host.setParams?.(valuesRef.current);
      host
        .captureThumbnailBlob({
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          shouldResume: () => playPreferenceRef.current,
        })
        .then(async (blob) => {
          if (!blob || gen !== thumbnailCaptureGenRef.current) return;
          const url = URL.createObjectURL(blob);
          try {
            const dataUrl = await blobToDataUrl(blob);
            if (gen !== thumbnailCaptureGenRef.current) {
              URL.revokeObjectURL(url);
              return;
            }
            thumbnailDataUrlsRef.current[targetId] = dataUrl;
            setThumbnails((current) => {
              revokeThumbnailUrl(current[targetId]);
              return { ...current, [targetId]: url };
            });
          } catch {
            URL.revokeObjectURL(url);
          }
        })
        .catch(() => {
          // Keep the previous thumbnail if WebGPU capture fails.
        });
    };
    const timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(capture, { timeout: 2000 });
      } else {
        capture();
      }
    }, THUMBNAIL_IDLE_MS);

    return () => {
      window.clearTimeout(timer);
      if (idleId) window.cancelIdleCallback?.(idleId);
    };
  }, [
    presetId,
    previewRevision,
    protectedPreview,
    thumbnailRefreshRevision,
    runtimeReady,
    viewMode,
  ]);

  const libraryCards = useMemo(
    () =>
      buildShaderLibraryCards({
        drafts: user
          ? drafts.filter((draft) => draft.kind === COMPOSITION_KIND)
          : drafts,
        cloudShaders,
        thumbnails,
        cloudThumbnails,
        cloudSmallThumbnails,
        liveNames: {
          [presetId]: shaderName,
        },
        user,
      }),
    [
      cloudShaders,
      cloudSmallThumbnails,
      cloudThumbnails,
      drafts,
      presetId,
      shaderName,
      thumbnails,
      user,
    ]
  );
  const publishedAuthors = useMemo(
    () =>
      [
        ...new Map(
          libraryCards
            .filter((card) => card.origin === "public" && card.authorId)
            .map((card) => [
              card.authorId,
              { value: card.authorId, label: card.authorLabel },
            ])
        ).values(),
      ].sort((a, b) => a.label.localeCompare(b.label)),
    [libraryCards]
  );
  const groupedHomeCards = useMemo(
    () =>
      groupLibraryCards(
        filterShaderLibraryCards(libraryCards, {
          query: homeQuery,
          kind: homeKind,
          author: homeAuthor,
        }).filter((card) => card.origin === "public"),
      ),
    [homeAuthor, homeKind, homeQuery, libraryCards]
  );
  const groupedEditorCards = useMemo(
    () =>
      groupLibraryCards(
        filterShaderLibraryCards(libraryCards, {
          query: editorQuery,
          kind: editorKind,
          origin: editorOrigin,
          author: editorAuthor,
        }),
      ),
    [editorAuthor, editorKind, editorOrigin, editorQuery, libraryCards]
  );
  const editorEmptyMessage = useMemo(() => {
    const kindLabel = {
      all: "shaders",
      [COMPOSITION_KIND]: "compositions",
      effect: "shader effects",
      fill: "shader fills",
    }[editorKind] || "shaders";
    const authorLabel =
      publishedAuthors.find((author) => author.value === editorAuthor)?.label ||
      (editorAuthor === user?.id ? "you" : "the selected author");
    const parts = [`No ${kindLabel} found`];
    if (editorAuthor !== "all") parts.push(`for ${authorLabel}`);
    if (editorOrigin === "draft") parts.push("in drafts");
    else if (editorOrigin === "public") parts.push("in published shaders");
    if (editorQuery.trim()) parts.push(`matching “${editorQuery.trim()}”`);
    return `${parts.join(" ")}.`;
  }, [
    editorAuthor,
    editorKind,
    editorOrigin,
    editorQuery,
    publishedAuthors,
    user?.id,
  ]);
  editorCardsRef.current = groupedEditorCards;
  const compositionFillCards = useMemo(
    () => filterShaderLibraryCards(libraryCards, { kind: "fill" }),
    [libraryCards]
  );
  const compositionEffectCards = useMemo(
    () => filterShaderLibraryCards(libraryCards, { kind: "effect" }),
    [libraryCards]
  );
  const compositionNameCards = useMemo(
    () =>
      buildShaderLibraryCards({
        drafts: drafts.filter((draft) => draft.kind !== COMPOSITION_KIND),
        cloudShaders,
        thumbnails,
        cloudThumbnails,
        cloudSmallThumbnails,
        liveNames: {
          [presetId]: shaderName,
        },
        user,
      }),
    [
      cloudShaders,
      cloudSmallThumbnails,
      cloudThumbnails,
      drafts,
      presetId,
      shaderName,
      thumbnails,
      user,
    ]
  );

  const onCompositionChange = useCallback(
    (next) => {
      if (protectedPreview && viewMode !== "view") return;
      clearShaderVersionPreviewRef.current?.();
      let graph = normalizeComposition(next);
      if (!user && isDraftId(presetId)) {
        graph = normalizeComposition({
          ...graph,
          fills: annotateLocalDraftMediaKeys(presetId, graph.fills),
        });
        if (
          fillMediaEntries(graph.fills).length > 0 ||
          hasDraftAudioMedia(graph.inputs)
        ) {
          draftMediaPersistenceErrorRef.current = null;
          const persistence = persistLocalDraftMedia(
            presetId,
            graph.fills,
            pendingMedia,
            graph.inputs,
          );
          draftMediaPersistenceRef.current = persistence;
          persistence.then(
            () => {
              if (draftMediaPersistenceRef.current === persistence) {
                draftMediaPersistenceRef.current = null;
              }
            },
            (mediaError) => {
              draftMediaPersistenceErrorRef.current = mediaError;
              if (draftMediaPersistenceRef.current === persistence) {
                draftMediaPersistenceRef.current = null;
              }
              showNotice(
                mediaError.message ||
                  "Local media could not be saved for browser reload.",
                { error: true },
              );
            },
          );
        }
      }
      const retainedPins = {};
      for (const key of referencedShaderKeys(graph)) {
        const pin = dependencySnapshotForKey(
          activeDependencySnapshotsRef.current,
          key
        );
        if (pin) retainedPins[key] = pin;
      }
      activeDependencySnapshotsRef.current = retainedPins;
      compositionRef.current = graph;
      setComposition(graph);
      setDirty(true);
    },
    [pendingMedia, presetId, protectedPreview, showNotice, user, viewMode]
  );

  const onSupportsAudioChange = useCallback((next) => {
    setSupportsAudio(Boolean(next));
    setDirty(true);
  }, []);

  const onCompositionSelectLayer = useCallback((layerId) => {
    selectedLayerIdRef.current = layerId;
    setSelectedLayerId(layerId);
    const graph = normalizeComposition(compositionRef.current);
    const layerShaderId = compositionLayerShaderId(graph, layerId);
    const source =
      dependencySnapshotForKey(
        activeDependencySnapshotsRef.current,
        layerShaderId
      )?.source ||
      resolveReferencedShaderSource(layerShaderId, {
        session: draftSessionRef.current,
        drafts,
        liveByKey: liveShaderSourceRef.current,
        resolvedByKey: new Map(Object.entries(resolvedShaders)),
      });
    if (!source) {
      setProps({});
      valuesRef.current = {};
      setValues({});
      return;
    }
    try {
      const loaded = loadModule(source);
      const values =
        graph.fills.find((fill) => fill.id === layerId)?.values ??
        graph.effects.find((effect) => effect.id === layerId)?.values;
      const next = mergeValues(loaded.props, values);
      valuesRef.current = next;
      setProps(loaded.props);
      setValues(next);
    } catch {
      setProps({});
      valuesRef.current = {};
      setValues({});
    }
  }, [drafts, resolvedShaders]);

  const figmaImportedKeys = useMemo(() => {
    const keys = new Set();
    for (const shader of cloudShaders) {
      if (
        user &&
        shader.owner_id === user.id &&
        typeof shader.figma_shader_id === "string" &&
        (shader.figma_shader_kind === "effect" ||
          shader.figma_shader_kind === "fill")
      ) {
        keys.add(
          figmaLibraryKey(shader.figma_shader_kind, shader.figma_shader_id)
        );
      }
    }
    for (const draft of drafts) {
      if (
        typeof draft.figma_shader_id === "string" &&
        (draft.figma_shader_kind === "effect" ||
          draft.figma_shader_kind === "fill")
      ) {
        keys.add(figmaLibraryKey(draft.figma_shader_kind, draft.figma_shader_id));
      }
    }
    return keys;
  }, [cloudShaders, drafts, user]);

  const figmaImportCards = useMemo(
    () =>
      FIGMA_SHADER_CATEGORIES.filter(
        ({ kind }) =>
          figmaImportKind === "all" ||
          figmaImportKind === "imported" ||
          figmaImportKind === kind
      ).flatMap(({ kind, label }) => {
        const items = figmaShaders.filter((shader) => {
          if (shader.kind !== kind) return false;
          const key = figmaLibraryKey(kind, shader.id);
          const imported = figmaImportedKeys.has(key);
          if (figmaImportKind === "imported") return imported;
          return !imported;
        });
        if (!items.length) return [];
        const showSeparators =
          figmaImportKind === "all" || figmaImportKind === "imported";
        return [
          ...(showSeparators
            ? [{ key: `separator:figma:${kind}`, separatorLabel: label, separatorKind: kind }]
            : []),
          ...items.map((shader) => {
            const key = figmaLibraryKey(kind, shader.id);
            return {
              key,
              name: shader.name,
              description: shader.description || "",
              kind,
              id: shader.id,
              owner: shader.owner,
              readOnly: shader.owner === "figma",
              imported: figmaImportedKeys.has(key),
            };
          }),
        ];
      }),
    [figmaImportKind, figmaImportedKeys, figmaShaders]
  );
  const figmaImportCheckedCards = useMemo(
    () =>
      figmaImportCards.filter((card) =>
        figmaImportCheckedKeys.includes(card.key)
      ),
    [figmaImportCards, figmaImportCheckedKeys]
  );
  const figmaImportCheckedCount = figmaImportCheckedCards.length;
  const figmaImportSelectionIsUpdate =
    figmaImportCheckedCount > 0 &&
    figmaImportCheckedCards.every((card) => card.imported);
  const figmaImportBusy = Boolean(
    figmaLibraryLoading || figmaImportProgress
  );

  const toggleFigmaImportChecked = useCallback((key, checked) => {
    setFigmaImportCheckedKeys((current) => {
      const hasKey = current.includes(key);
      if (checked && !hasKey) return [...current, key];
      if (!checked && hasKey) return current.filter((item) => item !== key);
      return current;
    });
  }, []);

  useEffect(() => {
    const chooser = figmaImportChooserRef.current;
    if (!chooser) return undefined;
    // The row click mirrors the checkbox, so a click anywhere on a choice
    // toggles it. Clicks on the checkbox itself are left to the checkbox.
    const onClick = (event) => {
      if (figmaImportBusy) return;
      if (event.target.closest?.("fig-checkbox")) return;
      const key = event.target.closest?.("fig-choice")?.getAttribute("value");
      if (!key) return;
      setFigmaImportCheckedKeys((current) =>
        current.includes(key)
          ? current.filter((item) => item !== key)
          : [...current, key]
      );
    };
    chooser.addEventListener("click", onClick);
    return () => chooser.removeEventListener("click", onClick);
  }, [
    figmaImportBusy,
    figmaImportOpen,
    figmaLibraryLoading,
    figmaTokenConfigured,
    figmaImportKind,
  ]);

  const importSelectedFigmaShaders = useCallback(async () => {
    const selected = figmaImportCards.filter((card) =>
      figmaImportCheckedKeys.includes(card.key)
    );
    if (!selected.length) return;
    setFigmaLibraryError("");
    setFigmaImportProgress({ current: 0, total: selected.length });
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const card = selected[index];
        setFigmaImportProgress({
          current: index + 1,
          total: selected.length,
        });
        await openFigmaShader(card.id);
      }
      setFigmaImportOpen(false);
    } catch (importError) {
      setFigmaLibraryError(importError.message || String(importError));
    } finally {
      setFigmaImportProgress(null);
    }
  }, [figmaImportCards, figmaImportCheckedKeys, openFigmaShader]);

  const renderPropertyHeaderActions = (noun) => {
    const visibilityLabel = effectVisible ? `Hide ${noun}` : `Show ${noun}`;
    return (
      <hstack
        style={{
          marginLeft: "auto",
          "--hstack-gap": "var(--spacer-1)",
        }}
      >
        {noun ? (
          <>
            <fig-tooltip text={visibilityLabel}>
              <fig-button
                type="button"
                variant="ghost"
                icon="true"
                aria-label={visibilityLabel}
                onClick={() => {
                  hostRef.current?.setActive(true);
                  setEffectVisible((visible) => !visible);
                }}
              >
                <fig-icon name={effectVisible ? "visible" : "hidden"} />
              </fig-button>
            </fig-tooltip>
            <fig-menu ref={propertiesMoreMenuRef} position="bottom right">
              <fig-tooltip text="More">
                <fig-button
                  fig-menu-trigger=""
                  type="button"
                  variant="ghost"
                  icon="true"
                  aria-label={`More ${noun} property actions`}
                >
                  <fig-icon name="more" />
                </fig-button>
              </fig-tooltip>
              <fig-menu-item value="reset">Reset to default</fig-menu-item>
              <fig-menu-item
                value="save-defaults"
                disabled={
                  protectedPreview || viewMode === "view" ? "" : undefined
                }
              >
                Save as default
              </fig-menu-item>
            </fig-menu>
          </>
        ) : null}
      </hstack>
    );
  };

  const renderPropertiesPanelContent = (viewDialog = null) => (
    <>
      {viewMode === "view" ? (
        renderShaderViewHeader(viewDialog)
      ) : (
        <fig-header>
          <h2>{propertiesPanelTitle}</h2>
          {isComposerView
            ? null
            : renderPropertyHeaderActions(isShaderFillPanel ? "fill" : null)}
        </fig-header>
      )}

      {!viewDialog?.minimized && <fig-content
        ref={propertiesPanelContentFadeRef}
        class="shader-properties-panel-content"
        padding="none"
        inert={
          sessionResourcesLoading || restoringVersion ? "" : undefined
        }
        aria-busy={
          sessionResourcesLoading || restoringVersion ? "true" : undefined
        }
      >
          {isComposerView ? (
            <>
              <CompositionEditor
                key={presetId}
                graph={composition}
                imageUrl={inputImageUrl}
                resolvedByKey={pinAwareResolvedByKey}
                fillCards={compositionFillCards}
                effectCards={compositionEffectCards}
                nameCards={compositionNameCards}
                readOnly={viewMode === "view" ? false : protectedPreview}
                experimentalAudio={experimentalAudio}
                onSupportsAudioChange={onSupportsAudioChange}
                layerControls={
                  <Suspense fallback={null}>
                    <Controls
                      key={layerControlsEpoch}
                      props={props}
                      values={values}
                      onChange={updateControl}
                      onInput={previewControl}
                    />
                  </Suspense>
                }
                onChange={onCompositionChange}
                onSelectLayer={onCompositionSelectLayer}
                onPropertiesLayerChange={setCompositionPropsLayerId}
                onOpenShader={
                  viewMode === "view"
                    ? openReferencedShaderInView
                    : openHomeChoice
                }
                onResetLayer={resetProperties}
                onExport={() => openExportDialog(exportTab)}
                exportDisabled={Boolean(videoExportProgress)}
                onFill={(paint, fillId) => {
                  const graph = normalizeComposition(compositionRef.current);
                  compileCompositionRef.current?.({
                    ...graph,
                    fills: graph.fills.map((fill) =>
                      fill.id === fillId
                        ? {
                            ...fill,
                            type: graphTypeForPaint(paint.type),
                            shaderId: null,
                            paint,
                          }
                        : fill
                    ),
                  });
                }}
                onFillValuesPreview={(nextValues, fillId) => {
                  hostRef.current?.setActive(true);
                  hostRef.current?.setCompositionLayerParams?.(
                    fillId || COMPOSITION_FILL_ID,
                    nextValues
                  );
                  if (selectedLayerIdRef.current === fillId) {
                    valuesRef.current = nextValues;
                    queuePresentState();
                  }
                }}
              />
              {viewMode !== "view" && user && !protectedPreview && (
                <div className="sharing-controls properties-pane">
                  <fig-header borderless>
                    <h3>Visibility</h3>
                  </fig-header>
                  <fig-field label="Public" direction="horizontal">
                    <fig-switch
                      checked={isPublic}
                      label={
                        isPublic
                          ? "Anyone with the link can view the source and input."
                          : "Only you can open this cloud shader."
                      }
                      onInput={(event) => {
                        setIsPublic(event.target.checked);
                        setDirty(true);
                      }}
                      dangerouslySetInnerHTML={{ __html: "" }}
                    />
                  </fig-field>
                </div>
              )}
            </>
          ) : (
          <>
            {kind === "effect" && (
              <CompositionEditor
                key={presetId}
                fillOnly
                graph={{ fills: effectFills, effects: [], inputs: documentInputs }}
                imageUrl={inputImageUrl}
                resolvedByKey={pinAwareResolvedByKey}
                fillCards={compositionFillCards}
                nameCards={compositionNameCards}
                readOnly={viewMode === "view" ? false : protectedPreview}
                experimentalAudio={experimentalAudio}
                onSupportsAudioChange={onSupportsAudioChange}
                onOpenShader={
                  viewMode === "view"
                    ? openReferencedShaderInView
                    : openHomeChoice
                }
                onResetLayer={resetEffectFillProperties}
                onChange={(next) => {
                  clearShaderVersionPreviewRef.current?.();
                  const nextGraph = normalizeComposition(next);
                  const nextFills = nextGraph.fills;
                  setDocumentInputs(normalizeDocumentInputs(nextGraph.inputs));
                  const fills =
                    !user && isDraftId(presetId)
                      ? annotateLocalDraftMediaKeys(presetId, nextFills)
                      : nextFills;
                  if (
                    !user &&
                    isDraftId(presetId) &&
                    (fillMediaEntries(fills).length > 0 ||
                      hasDraftAudioMedia(nextGraph.inputs))
                  ) {
                    draftMediaPersistenceErrorRef.current = null;
                    const persistence = persistLocalDraftMedia(
                      presetId,
                      fills,
                      pendingMedia,
                      nextGraph.inputs,
                    );
                    draftMediaPersistenceRef.current = persistence;
                    persistence.then(
                      () => {
                        if (
                          draftMediaPersistenceRef.current === persistence
                        ) {
                          draftMediaPersistenceRef.current = null;
                        }
                      },
                      (mediaError) => {
                        draftMediaPersistenceErrorRef.current = mediaError;
                        if (
                          draftMediaPersistenceRef.current === persistence
                        ) {
                          draftMediaPersistenceRef.current = null;
                        }
                        showNotice(
                          mediaError.message ||
                            "Local media could not be saved for browser reload.",
                          { error: true },
                        );
                      },
                    );
                  }
                  const previousKey = effectFillPreviewKey(
                    effectFillsRef.current
                  );
                  setEffectFills(fills);
                  effectFillsRef.current = fills;
                  setEffectFill(fills[0] || null);
                  effectFillRef.current = fills[0] || null;
                  setDirty(true);
                  if (previousKey || effectFillPreviewKey(fills)) {
                    compile(source);
                  }
                }}
                onFill={(paint, fillId) => {
                  const graph = normalizeComposition({
                    fills: effectFillsRef.current,
                    effects: [
                      {
                        id: EFFECT_PREVIEW_LAYER_ID,
                        shaderId: draftSessionRef.current.presetId,
                        values: valuesRef.current,
                        enabled: true,
                      },
                    ],
                  });
                  compileCompositionRef.current?.({
                    ...graph,
                    fills: graph.fills.map((fill) =>
                      fill.id === fillId
                        ? {
                            ...fill,
                            type: graphTypeForPaint(paint.type),
                            shaderId: null,
                            paint,
                          }
                        : fill
                    ),
                  });
                }}
                onFillValuesPreview={(nextValues, fillId) => {
                  hostRef.current?.setActive(true);
                  hostRef.current?.setCompositionLayerParams?.(
                    fillId || COMPOSITION_FILL_ID,
                    nextValues
                  );
                }}
              />
            )}
            <div className="properties-pane">
              {sessionKind === "effect" && (
                <fig-header borderless="">
                  <h3>Effect properties</h3>
                  {renderPropertyHeaderActions("effect")}
                </fig-header>
              )}
              <Suspense fallback={null}>
                <Controls
                  props={props}
                  values={values}
                  onChange={updateControl}
                  onInput={previewControl}
                />
              </Suspense>
            </div>
            <DocumentInputsPane
              inputs={documentInputs}
              readOnly={viewMode === "view" ? false : protectedPreview}
              experimentalAudio={experimentalAudio}
              hasLiveWebcam={
                sessionKind === "effect" &&
                liveWebcamFillCount({ fills: effectFills }) > 0
              }
              onChange={(next) => {
                const normalized = normalizeDocumentInputs(next);
                setDocumentInputs(normalized);
                setDirty(true);
                if (!user && isDraftId(presetId) && hasDraftAudioMedia(normalized)) {
                  draftMediaPersistenceErrorRef.current = null;
                  const persistence = persistLocalDraftMedia(
                    presetId,
                    sessionKind === "effect" ? effectFillsRef.current : [],
                    pendingMedia,
                    normalized,
                  );
                  draftMediaPersistenceRef.current = persistence;
                  persistence.then(
                    () => {
                      if (draftMediaPersistenceRef.current === persistence) {
                        draftMediaPersistenceRef.current = null;
                      }
                    },
                    (mediaError) => {
                      draftMediaPersistenceErrorRef.current = mediaError;
                      if (draftMediaPersistenceRef.current === persistence) {
                        draftMediaPersistenceRef.current = null;
                      }
                      showNotice(
                        mediaError.message ||
                          "Local media could not be saved for browser reload.",
                        { error: true },
                      );
                    },
                  );
                }
              }}
              onSupportsAudioChange={onSupportsAudioChange}
            />
            <ExportPropertiesPane
              disabled={Boolean(videoExportProgress)}
              onExport={() => openExportDialog(exportTab)}
            />
            {viewMode !== "view" &&
              activeFigmaLink.figma_shader_id &&
              activeFigmaRecord && (
              <FigmaPropertiesPane
                shader={activeFigmaRecord}
                loading={activeFigmaDetailLoading}
                error={activeFigmaDetailError}
              />
            )}
            {viewMode !== "view" && user && !protectedPreview && (
              <div className="sharing-controls properties-pane grouped-properties-pane">
                <fig-group name="Visibility" collapsible="">
                  <fig-field label="Public" direction="horizontal">
                    <fig-switch
                      checked={isPublic}
                      label={
                        isPublic
                          ? "Anyone with the link can view the source and input."
                          : "Only you can open this cloud shader."
                      }
                      onInput={(event) => {
                        setIsPublic(event.target.checked);
                        setDirty(true);
                      }}
                      dangerouslySetInnerHTML={{ __html: "" }}
                    />
                  </fig-field>
                </fig-group>
              </div>
            )}
          </>
          )}
      </fig-content>}
    </>
  );

  const renderPropertiesPanel = () => (
    <aside
      ref={propertiesPanelRef}
      className="shader-properties-panel"
      aria-label={propertiesPanelTitle}
    >
      {renderPropertiesPanelContent()}
    </aside>
  );

  const renderLibraryChoices = (cards, { cardSize, selectedKey } = {}) =>
    cards.map((card) => {
      if (card.separatorLabel) {
        return <fig-separator key={card.key} label={card.separatorLabel} />;
      }
      const cardNode = (
        <ShaderCard
          src={card.thumbnailUrl}
          label={card.name}
          sublabel={card.origin === "public" ? "Published" : "Draft"}
          selected={selectedKey === card.key}
          published={card.origin === "public"}
          authorName={card.authorName || card.authorLabel}
          authorAvatarUrl={card.authorAvatarUrl}
          isYou={Boolean(user && card.authorId === user.id)}
          showPublishedIcon={false}
          previewId={card.cloud?.id}
          previewKind={card.kind}
          previewRevision={card.cloud?.state_revision}
          animated={Boolean(card.features?.isAnimated)}
          interactive={Boolean(card.features?.usesMouse)}
          audio={Boolean(card.features?.supportsAudio)}
          onThumbnailError={() =>
            recoverCloudThumbnail(card.cloud?.id)
          }
          onAuthorClick={
            card.authorId
              ? () => openUserProfile(card.authorId, card.authorHandle)
              : undefined
          }
          {...(cardSize ? { size: cardSize } : {})}
        />
      );

      return (
        <fig-choice key={card.key} value={card.key} aria-label={card.name}>
          {cardNode}
        </fig-choice>
      );
    });

  const newShaderMenuRef = useFigMenuChange((value) => {
    if (value === "effect") {
      createDraft("blank-effect");
    } else if (value === "fill") {
      createDraft("blank-fill");
    } else if (value === "composition") {
      createCompositionDraft();
    } else if (value === "from-figma") {
      setFigmaImportOpen(true);
    }
  });

  const persistCurrentFigmaLink = useCallback(
    async (link) => {
      const normalizedLink = figmaShaderLink(link);
      draftSessionRef.current = {
        ...draftSessionRef.current,
        ...normalizedLink,
      };
      if (isDraftId(presetId)) {
        setDrafts((current) => {
          const next = current.map((draft) =>
            draft.id === presetId ? { ...draft, ...normalizedLink } : draft
          );
          writeDrafts(next, thumbnailDataUrlsRef.current);
          return next;
        });
        return normalizedLink;
      }
      if (currentShader?.id && isOwner) {
        const saved = await updateShader(currentShader.id, normalizedLink, {
          expectedStateRevision: currentShader.state_revision,
        });
        setCurrentShader(saved);
        setCloudShaders((current) =>
          current.map((shader) =>
            shader.id === saved.id ? { ...shader, ...saved } : shader
          )
        );
        return figmaShaderLink(saved);
      }
      throw new Error("Save or duplicate this shader before creating it in Figma.");
    },
    [currentShader, isOwner, presetId, setCurrentShader]
  );

  const runFigmaUpdate = useCallback(
    async (snapshot, link, operation) => {
      setFigmaSyncing(true);
      setFigmaSyncToast({
        phase: "syncing",
        message: figmaShaderProgressMessage(operation, snapshot.kind),
      });
      try {
        const pkg = buildFigmaShaderPackage(snapshot.source, snapshot.name);
        const metadata = figmaShaderUpdateMetadata({
          ...snapshot,
          mainTs: pkg.mainTs,
          features: pkg.features,
        });
        const result = await updateFigmaShader({
          id: link.figma_shader_id,
          kind: snapshot.kind,
          mainTs: pkg.mainTs,
          metadata,
          commitMessage: `${
            operation === "create" ? "Create" : "Update"
          } ${snapshot.name} from Shader Studio`,
        });
        await persistCurrentFigmaLink({
          ...link,
          figma_shader_version:
            result.version || link.figma_shader_version || null,
        });
        setFigmaSyncToast({
          phase: "done",
          message: figmaShaderSuccessMessage(operation, snapshot.kind),
        });
      } catch (syncError) {
        setFigmaSyncToast(null);
        showNotice(syncError.message || String(syncError), { error: true });
      } finally {
        setFigmaSyncing(false);
      }
    },
    [persistCurrentFigmaLink, showNotice]
  );

  const createShaderInFigma = useCallback(
    async (snapshot, planKey) => {
      setFigmaSyncing(true);
      setFigmaSyncToast({
        phase: "syncing",
        message: figmaShaderProgressMessage("create", snapshot.kind),
      });
      try {
        const pkg = buildFigmaShaderPackage(snapshot.source, snapshot.name);
        await createAndDeployFigmaShader({
          snapshot: {
            ...snapshot,
            mainTs: pkg.mainTs,
            features: pkg.features,
          },
          planKey,
          create: createFigmaShader,
          get: getFigmaShader,
          update: updateFigmaShader,
          persistLink: persistCurrentFigmaLink,
        });
        setFigmaSyncToast({
          phase: "done",
          message: figmaShaderSuccessMessage("create", snapshot.kind),
        });
      } catch (syncError) {
        setFigmaSyncToast(null);
        showNotice(syncError.message || String(syncError), { error: true });
      } finally {
        setFigmaSyncing(false);
      }
    },
    [persistCurrentFigmaLink, showNotice]
  );

  const beginFigmaSync = useCallback(async () => {
    if (figmaSyncing || sessionKind === COMPOSITION_KIND) return;
    const audioInputs = hasAudioInput(
      sessionKind === COMPOSITION_KIND
        ? compositionRef.current?.inputs
        : documentInputsRef.current,
    );
    if (supportsAudioRef.current || audioInputs) {
      showNotice("Shaders with audio cannot be pushed to Figma.", {
        error: true,
      });
      return;
    }
    const documentSnapshot = captureDocumentSnapshot();
    const snapshot = {
      name: shaderName.trim() || "Untitled Shader",
      description: shaderDescription,
      source: documentSnapshot.source,
      kind: activeFigmaLink.figma_shader_id
        ? activeFigmaLink.figma_shader_kind ||
          (documentSnapshot.kind === "fill" ? "fill" : "effect")
        : documentSnapshot.kind === "fill"
          ? "fill"
          : "effect",
    };
    if (activeFigmaLink.figma_shader_id) {
      await runFigmaUpdate(snapshot, activeFigmaLink, "update");
      return;
    }
    try {
      const plans = await listFigmaPlans();
      if (!plans.length) {
        throw new Error("No writable Figma team or organization is available.");
      }
      const preferred = preferredFigmaPlan(plans);
      if (preferred) {
        await createShaderInFigma(snapshot, preferred.key);
        return;
      }
      setFigmaPlans(plans);
      setFigmaPlanKey(plans[0].key);
      setPendingFigmaCreate(snapshot);
    } catch (planError) {
      showNotice(planError.message || String(planError), { error: true });
    }
  }, [
    activeFigmaLink,
    captureDocumentSnapshot,
    createShaderInFigma,
    figmaSyncing,
    runFigmaUpdate,
    sessionKind,
    shaderDescription,
    shaderName,
    showNotice,
  ]);

  const confirmFigmaPlan = useCallback(() => {
    const snapshot = pendingFigmaCreate;
    const selected = figmaPlans.find((plan) => plan.key === figmaPlanKey);
    if (!snapshot || !selected) return;
    setPreferredFigmaPlanKey(selected.key);
    setPendingFigmaCreate(null);
    createShaderInFigma(snapshot, selected.key);
  }, [createShaderInFigma, figmaPlanKey, figmaPlans, pendingFigmaCreate]);

  const onShaderAction = useCallback((value, anchor) => {
    if (value === "rename") startRename();
    else if (value === "save") {
      if (saving || restoringVersion) return;
      if (currentShader && !dirty && !hasUncheckpointedChanges) return;
      saveShader().catch(() => {});
    } else if (value === "publish") {
      if (!user || saving) return;
      publishAnchorRef.current = anchor || moreMenuAnchorRef.current;
      setPublishOpen(true);
    } else if (value === "unpublish") {
      if (!isOwner || saving) return;
      unpublishShader().catch(() => {});
    } else if (value === "duplicate") duplicateShader();
    else if (value === "share") copyShareLink();
    else if (value === "view") {
      if (!currentShader?.id || !currentShader.is_public) return;
      openViewRoute(currentShader.id, currentShader.kind || kind);
    }
    else if (value === "delete") {
      if (!isOwner) return;
      removeCurrentShader();
    } else if (value === "export") {
      if (kind === COMPOSITION_KIND) return;
      exportFiles();
    } else if (value === "sync-figma") {
      beginFigmaSync();
    }
  }, [
    beginFigmaSync,
    copyShareLink,
    currentShader,
    dirty,
    duplicateShader,
    exportFiles,
    hasUncheckpointedChanges,
    isOwner,
    kind,
    openViewRoute,
    removeCurrentShader,
    restoringVersion,
    saveShader,
    saving,
    startRename,
    unpublishShader,
    user,
  ]);
  const shaderEditorHeader = (
          <fig-header class="shader-editor-header" borderless>
            {libraryNavMotion === "open" ? null : (
            <fig-tooltip text="Show library">
              <fig-button
                type="button"
                variant="ghost"
                icon="true"
                aria-label="Show library"
                onClick={showLibraryNav}
              >
                <ToggleSidebarIcon />
              </fig-button>
            </fig-tooltip>
            )}
            <div
              className={
                renaming ? "shader-title is-renaming" : "shader-title"
              }
            >
                {showCurrentAuthor && (
                  <AuthorAvatar
                    class="shader-author-avatar"
                    tooltip={currentAuthorName}
                    src={currentAuthorAvatarUrl}
                    name={currentAuthorName}
                    isYou={currentAuthorIsYou}
                    onClick={
                      currentShader?.owner_id
                        ? () =>
                            openUserProfile(
                              currentShader.owner_id,
                              currentShader.author_handle,
                            )
                        : currentAuthorIsYou && user?.id
                          ? () => openUserProfile(user.id)
                          : undefined
                    }
                  />
                )}
                <fig-input-text
                  ref={nameInputRef}
                  name="name"
                  class="shader-name"
                  size="large"
                  value={shaderName}
                  variant="editable"
                  full=""
                  readonly={!renaming}
                  onClick={() => {
                    if (!renaming && !protectedPreview) startRename();
                  }}
                  onBlur={() => {
                    if (renaming) finishRename();
                  }}
                  onInput={(event) => {
                    if (protectedPreview) return;
                    setShaderName(event.target.value);
                    setDirty(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      finishRename();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      finishRename();
                    }
                  }}
                  dangerouslySetInnerHTML={{ __html: "" }}
                />
                {renaming && (
                  <fig-button
                    variant="primary"
                    icon="true"
                    aria-label="Finish renaming"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={finishRename}
                  >
                    <fig-icon name="checkmark" size="small" />
                  </fig-button>
                )}
            </div>
            {!renaming && (
              <hstack>
                {currentShader?.is_public && (
                  <span
                    className="shader-published-status"
                    aria-label="Published"
                  >
                    <fig-tooltip text="Published">
                      <fig-icon name="globe" />
                    </fig-tooltip>
                  </span>
                )}
                {isOwner && currentShader && (
                  <ShaderVersionSelect
                    versions={shaderVersions}
                    versionsLoading={versionsLoading}
                    versionsHasMore={versionsHasMore}
                    dirty={dirty}
                    hasUncheckpointedChanges={hasUncheckpointedChanges}
                    saving={saving}
                    disabled={saving || restoringVersion || duplicating}
                    onOpen={openShaderVersions}
                    onLoadMore={loadMoreShaderVersions}
                    onPreviewVersion={previewShaderVersion}
                    onChange={restoreSelectedVersion}
                    onDuplicate={duplicateShaderVersion}
                  />
                )}
                <fig-tooltip text="Present">
                  <fig-button
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label="Present in a new window"
                    onClick={openPresentWindow}
                  >
                    <PopoutIcon />
                  </fig-button>
                </fig-tooltip>
                {protectedPreview ? (
                  <fig-button
                    type="button"
                    variant="primary"
                    disabled={duplicating}
                    onClick={() => duplicateShader()}
                  >
                    {duplicating ? "Duplicating…" : "Duplicate"}
                  </fig-button>
                ) : (
                  <ShaderActionsMenu
                    signedIn={Boolean(user)}
                    owner={isOwner}
                    published={Boolean(currentShader?.is_public)}
                    saving={saving}
                    saveDisabled={
                      saving ||
                      restoringVersion ||
                      Boolean(
                        currentShader && !dirty && !hasUncheckpointedChanges
                      )
                    }
                    saveLabel={saving ? "Saving…" : "Save"}
                    showDownload={!isComposerView}
                    showFigmaPush={
                      FIGMA_LIBRARY_UI_ENABLED &&
                      sessionKind !== COMPOSITION_KIND &&
                      (isDraftId(presetId) || Boolean(currentShader && isOwner))
                    }
                    figmaLinked={Boolean(activeFigmaLink.figma_shader_id)}
                    figmaKind={
                      activeFigmaLink.figma_shader_kind ||
                      (sessionKind === "fill" ? "fill" : "effect")
                    }
                    figmaSyncing={figmaSyncing}
                    figmaPushBlocked={figmaPushBlocked}
                    triggerRef={moreMenuAnchorRef}
                    onAction={(value) =>
                      onShaderAction(value, moreMenuAnchorRef.current)
                    }
                  />
                )}
              </hstack>
            )}
          </fig-header>
  );
  function renderShaderViewHeader({ minimized = false, toggle } = {}) {
    const toggleLabel = minimized ? "Show properties" : "Minimize properties";
    return (
      <fig-header
        dialog-header=""
        borderless={minimized ? "" : undefined}
      >
        {!minimized && (
          <hstack>
            {showCurrentAuthor && (
              <AuthorAvatar
                tooltip={currentAuthorName}
                src={currentAuthorAvatarUrl}
                name={currentAuthorName}
                isYou={currentAuthorIsYou}
                onClick={
                  currentShader?.owner_id
                    ? () =>
                        openUserProfile(
                          currentShader.owner_id,
                          currentShader.author_handle,
                        )
                    : undefined
                }
              />
            )}
            <h3>{shaderName}</h3>
          </hstack>
        )}
        {(isOwner && currentShader) || toggle ? (
          <hstack style={{ "--hstack-gap": "var(--spacer-1)" }}>
            {!minimized && isOwner && currentShader && (
              <fig-tooltip text="Edit">
                <fig-button
                  type="button"
                  variant="ghost"
                  icon="true"
                  aria-label="Edit"
                  onClick={() =>
                    window.location.assign(
                      makeShareUrl(currentShader.id, currentShader.kind),
                    )
                  }
                >
                  <fig-icon>
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path
                        d="M16.0568 14.7627C16.2409 14.4122 16.7562 14.4125 16.9406 14.7627L16.9747 14.8428L17.2697 15.7285L18.1554 16.0234C18.613 16.176 18.6129 16.823 18.1554 16.9756L17.2697 17.2705L16.9747 18.1562C16.8221 18.6137 16.1751 18.6138 16.0226 18.1562L15.7277 17.2705L14.8419 16.9756C14.385 16.8228 14.3849 16.1762 14.8419 16.0234L15.7267 15.7275L16.0226 14.8428L16.0568 14.7627ZM14.7931 6C15.1836 5.60981 15.8167 5.6098 16.2072 6L18.0001 7.79297C18.3904 8.18342 18.3903 8.81654 18.0001 9.20703L9.50012 17.707C9.3127 17.8944 9.05807 17.9999 8.79309 18H7.00012C6.44802 17.9998 6.00012 17.5522 6.00012 17V15.207C6.00017 14.942 6.10572 14.6875 6.29309 14.5L14.7931 6ZM7.00012 15.207V17H8.79309L15.2931 10.5L13.5001 8.70703L7.00012 15.207ZM6.90442 5.92871C7.09513 5.35698 7.90405 5.35706 8.09485 5.92871L8.46301 7.03516L9.57043 7.4043C10.1419 7.59513 10.1419 8.40389 9.57043 8.59473L8.46301 8.96289L8.09485 10.0703C7.9041 10.642 7.09515 10.6421 6.90442 10.0703L6.53528 8.96289L5.42883 8.59473C4.8575 8.40381 4.85742 7.59513 5.42883 7.4043L6.53528 7.03516L6.90442 5.92871ZM14.2072 8L16.0001 9.79297L17.2931 8.5L15.5001 6.70703L14.2072 8Z"
                        fill="currentColor"
                        fillOpacity="0.9"
                      />
                    </svg>
                  </fig-icon>
                </fig-button>
              </fig-tooltip>
            )}
            {toggle && (
              <fig-tooltip text={toggleLabel}>
                <fig-button
                  type="button"
                  variant="ghost"
                  icon="true"
                  aria-label={toggleLabel}
                  aria-controls="view-properties-dialog"
                  aria-expanded={minimized ? "false" : "true"}
                  onClick={toggle}
                >
                  <fig-icon name={minimized ? "adjust" : "close"} />
                </fig-button>
              </fig-tooltip>
            )}
          </hstack>
        ) : null}
      </fig-header>
    );
  }

  const previewComposition = isComposerView
    ? normalizeComposition(composition)
    : null;
  const compositionHasHtmlFill = Boolean(
    previewComposition?.fills.some(
      (fill) => fill.enabled && fill.type === "html",
    ),
  );
  const compositionHasMediaFill = Boolean(
    previewComposition?.fills.some(
      (fill) => fill.enabled && mediaFillType(fill.type),
    ),
  );
  const previewResourcesLoading =
    !fatal &&
    (!runtimeReady ||
      sessionResourcesLoading ||
      inputBusy ||
      versionPreviewLoading ||
      restoringVersion ||
      embedStatus === "loading");
  const previewCanvas = (
    <>
      {fatal ? (
        <div className="fatal">{fatal}</div>
      ) : (
        <Preview
          canvasRef={canvasRef}
          props={props}
          values={values}
          onControlInput={previewControl}
          onControlChange={updateControl}
          onZoomChange={onPreviewZoomChange}
          zoomRequest={previewZoomRequest}
          inputSource={
            compositionHasHtmlFill
              ? "html"
              : kind === "effect" ||
                  (isComposerView && compositionHasMediaFill)
              ? inputSource
              : "image"
          }
          htmlInputRef={htmlInputRef}
          onStageSize={onStageSize}
          onPointerSurface={onPointerSurface}
          onPickFile={routeEmbed ? undefined : onPreviewFile}
          onDropError={routeEmbed ? undefined : setError}
          dropTarget={isComposerView ? "fill" : "input"}
          showCanvasControls={
            !routeEmbed &&
            showCanvasHandles &&
            (!isComposerView || compositionPropsLayerId != null)
          }
          canvasTheme={canvasTheme}
          interactive={!routeEmbed}
          loading={previewResourcesLoading}
          plain={Boolean(presentSessionId)}
        />
      )}
    </>
  );

  const previewTools = (
    <PreviewToolbar
      running={running}
      onTogglePlay={togglePlay}
      onSeek={queuePresentState}
      showPlayback={previewPlayable}
      fatal={fatal}
      hostRef={hostRef}
      previewZoom={previewZoom}
      onPreviewZoomChange={requestPreviewZoom}
      showFps={!isComposerView || compositionPlayable}
      initialPixelRatioMode={viewMode === "view" ? "1x" : undefined}
      showCanvasHandles={showCanvasHandles}
      onToggleCanvasHandles={() =>
        setShowCanvasHandles((visible) => !visible)
      }
      canvasTheme={canvasTheme}
      onCanvasThemeChange={() =>
        setCanvasTheme(canvasTheme === "dark" ? "light" : "dark")
      }
    />
  );

  const editorPreviewContent = (
    <>
      <div
        className="editor-preview-runtime"
        style={{ display: presentWindowOpen ? "none" : "contents" }}
        aria-hidden={presentWindowOpen ? "true" : undefined}
      >
        {previewCanvas}
        {!previewResourcesLoading ? previewTools : null}
      </div>
      {presentWindowOpen ? (
        <div className="embed-state" role="status" aria-live="polite">
          Preview is open in the Present window.
        </div>
      ) : null}
    </>
  );

  const embedItemLabel =
    routeKind === COMPOSITION_KIND ? "composition" : "shader";
  const embedStateMessage = fatal
    ? fatal
    : embedStatus === "loading"
      ? ""
      : embedStatus === "unavailable"
        ? `This ${embedItemLabel} is unavailable.`
        : embedStatus === "ready" && error
          ? `This ${embedItemLabel} could not be rendered.`
          : "";
  const editorRouteErrorMessage =
    editorRouteError?.id === routeId ? editorRouteError.message : "";

  if (viewMode === "view") {
    return (
      <>
        <ComposerView
          viewerRef={viewerRef}
          visualizerRef={visualizerRef}
          className="shader-view-page"
          preview={
            <>
              {previewCanvas}
              {!previewResourcesLoading ? previewTools : null}
              {embedStateMessage ? (
                <div className="embed-state" role="status" aria-live="polite">
                  {embedStateMessage}
                </div>
              ) : null}
            </>
          }
          properties={
            <ViewPropertiesDialog>
              {(viewDialog) => renderPropertiesPanelContent(viewDialog)}
            </ViewPropertiesDialog>
          }
        />
        <ExportDialog
          dialogRef={exportDialogRef}
          tabsRef={exportTabsRef}
          tab={exportTab}
          settings={videoExportSettings}
          resolutionOptions={resolutionOptions}
          opaqueContent={opaqueContent}
          imageFormatRef={imageFormatRef}
          imageResolutionRef={imageResolutionRef}
          imageAspectRef={imageAspectRef}
          videoFormatRef={videoFormatRef}
          videoResolutionRef={videoResolutionRef}
          videoAspectRef={videoAspectRef}
          videoFrameRateRef={videoFrameRateRef}
          videoBitrateRef={videoBitrateRef}
          embedFormatRef={embedFormatRef}
          embedCode={embedCode}
          embedUrl={embedUrl}
          embedLinkAvailable={Boolean(embedUrl)}
          iframeEmbedAvailable={iframeEmbedAvailable}
          iframeEmbedUnavailableMessage={iframeEmbedUnavailableMessage}
          onClose={() => setExportOpen(false)}
          onExportImage={() => {
            downloadPreviewImage().catch((downloadError) => {
              reportAppError(downloadError.message || String(downloadError));
            });
          }}
          onExportVideo={() => {
            exportPreviewVideo().catch((videoError) => {
              setVideoExportProgress(null);
              reportAppError(videoError.message || String(videoError));
            });
          }}
          onDownloadEmbed={downloadEmbedCode}
          onCopyEmbed={copyEmbedCode}
          onCopyEmbedLink={copyEmbedLink}
          onDurationInput={(event) =>
            setVideoExportSettings((settings) => ({
              ...settings,
              duration: Number(event.target.value ?? event.detail),
            }))
          }
          onImageQualityInput={(event) =>
            setVideoExportSettings((settings) => ({
              ...settings,
              imageQuality: resolveImageExportQuality(
                event.target.value ?? event.detail,
              ),
            }))
          }
          onIncludeAudioInput={(next) =>
            setVideoExportSettings((settings) => ({
              ...settings,
              includeAudio: Boolean(next),
            }))
          }
          audioAvailable={exportSoundtrackAvailable}
        />
      </>
    );
  }

  if (viewMode === "embed") {
    return (
      <main
        className={`embed-view shader-viewer${
          presentSessionId ? " shader-view-page" : ""
        }`}
        aria-label={`${embedItemLabel} preview`}
      >
        <div className="shader-viewer-visualizer">
          {previewCanvas}
          {embedStateMessage ? (
            <div className="embed-state" role="status" aria-live="polite">
              {embedStateMessage}
            </div>
          ) : null}
        </div>
        {presentSessionId ? <PresentSettingsDialog /> : null}
      </main>
    );
  }

  const onAccountProfileChange = (displayName, profile) => {
    if (!user) return;
    setCloudShaders((current) =>
      current.map((shader) =>
        shader.owner_id === user.id
          ? {
              ...shader,
              author_name: displayName,
              author_handle: profile?.handle || shader.author_handle,
            }
          : shader,
      ),
    );
  };

  return (
    <>
      {viewMode !== "editor" && (
      <AppNav
        activeView={activeNavItem}
        onHome={() => {
          setActiveNavItem("home");
          openHome();
        }}
        onEditor={() => {
          setActiveNavItem("editor");
          openHomeChoice(presetId);
        }}
        onSearch={() => setSearchOpen((open) => !open)}
        onSearchClose={() => setSearchOpen(false)}
        searchOpen={searchOpen}
        createMenuRef={newShaderMenuRef}
        query={homeQuery}
        onQueryChange={setHomeQuery}
        kind={homeKind}
        onKindChange={setHomeKind}
        author={homeAuthor}
        onAuthorChange={setHomeAuthor}
        publishedAuthors={publishedAuthors}
        showFigmaImport={FIGMA_LIBRARY_UI_ENABLED && figmaTokenConfigured}
        authOpen={authOpen}
        onAuthOpenChange={setAuthOpen}
        theme={theme}
        onThemeChange={setTheme}
        canvasTheme={canvasTheme}
        onCanvasThemeChange={setCanvasTheme}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
        onProfileChange={onAccountProfileChange}
        onViewProfile={() => {
          if (user?.id) openUserProfile(user.id);
        }}
        onNotice={showNotice}
      />
      )}
      <div className="app-shell-content">
      {viewMode === "profile" && (
        <ProfileView
          identifier={routeProfile}
          user={user}
          onCanonicalIdentifier={canonicalizeProfileRoute}
          onOpenShader={openViewRoute}
          onNotice={showNotice}
        />
      )}
      {viewMode === "home" && (
        <HomeView
          choices={renderLibraryChoices(groupedHomeCards, {
            cardSize: "large",
          })}
          onChoice={(key) => {
            const card = libraryCards.find((item) => item.key === key);
            if (card?.cloud?.id) {
              openViewRoute(card.cloud.id, card.kind);
            } else {
              openHomeChoice(key);
            }
          }}
        />
      )}

      {viewMode === "editor" && (
      <div
        className="editor-view"
        ref={editorViewRef}
        style={{ "--app-nav-shift": `${appNavShift}px` }}
        data-library-motion={libraryNavMotion}
        data-library-collapsed={
          libraryNavMotion === "open" ? "false" : "true"
        }
      >
        {libraryNavMounted ? (
        <div
          ref={appNavRef}
          className="library-rail"
          aria-hidden={libraryNavMotion === "open" ? undefined : "true"}
        >
        <nav
          className="app-nav"
          style={{
            "--app-nav-width": `${appNavWidth}px`,
          }}
        >
          <div className="app-nav-headers">
            <fig-header class="app-nav-library-filters">
              <fig-tooltip text="Home">
                <fig-button
                  type="button"
                  variant="ghost"
                  icon="true"
                  aria-label="Home"
                  onClick={() => {
                    setActiveNavItem("home");
                    openHome();
                  }}
                >
                  <fig-icon name="arrow-left" />
                </fig-button>
              </fig-tooltip>
              <fig-input-text
                class="app-nav-search"
                type="search"
                placeholder="Search"
                value={editorQuery}
                full=""
                onInput={(event) => setEditorQuery(event.target.value)}
                dangerouslySetInnerHTML={opaqueContent}
              />
              <hstack class="app-nav-library-toggles">
                <LibraryFilterMenu
                  kind={editorKind}
                  onKindChange={setEditorKind}
                  author={editorAuthor}
                  onAuthorChange={setEditorAuthor}
                  origin={editorOrigin}
                  onOriginChange={setEditorOrigin}
                  authors={publishedAuthors}
                  view={libraryView}
                  onViewChange={setLibraryView}
                />
                <fig-tooltip text="Hide library">
                  <fig-button
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label="Hide library"
                    onClick={hideLibraryNav}
                  >
                    <ToggleSidebarIcon />
                  </fig-button>
                </fig-tooltip>
              </hstack>
            </fig-header>
          </div>
          <ShaderList
            value={presetId}
            cards={groupedEditorCards}
            layout={libraryView}
            emptyMessage={editorEmptyMessage}
            showEmptyCreate={
              !userId ||
              editorAuthor === "all" ||
              editorAuthor === "me" ||
              editorAuthor === userId
            }
            onResetFilters={() => {
              setEditorQuery("");
              setEditorKind("all");
              setEditorAuthor("all");
              setEditorOrigin("all");
            }}
            onChoice={chooseItem}
            onContextMenu={onShaderContextMenu}
            onThumbnailError={(card) =>
              recoverCloudThumbnail(card.cloud?.id)
            }
            onAdd={(kind) => {
              if (kind === "effect") createDraft("blank-effect");
              else if (kind === "fill") createDraft("blank-fill");
              else if (kind === "composition") createCompositionDraft();
            }}
          />
          <ShaderActionsMenu
            menuRef={shaderContextMenuRef}
            showTrigger={false}
            signedIn={!protectedPreview && Boolean(user)}
            owner={!protectedPreview && isOwner}
            published={Boolean(currentShader?.is_public)}
            saving={saving}
            saveDisabled={
              saving ||
              restoringVersion ||
              Boolean(
                currentShader && !dirty && !hasUncheckpointedChanges
              )
            }
            saveLabel={saving ? "Saving…" : "Save"}
            showRename={!protectedPreview}
            showSave={!protectedPreview}
            showDownload={!isComposerView}
            showFigmaPush={
              !protectedPreview &&
              FIGMA_LIBRARY_UI_ENABLED &&
              sessionKind !== COMPOSITION_KIND &&
              (isDraftId(presetId) || Boolean(currentShader && isOwner))
            }
            figmaLinked={Boolean(activeFigmaLink.figma_shader_id)}
            figmaKind={
              activeFigmaLink.figma_shader_kind ||
              (sessionKind === "fill" ? "fill" : "effect")
            }
            figmaSyncing={figmaSyncing}
            figmaPushBlocked={figmaPushBlocked}
            onAction={onShaderAction}
          />
          <fig-footer>
            <AccountMenu
              layout="bar"
              position="top right"
              open={authOpen}
              onOpenChange={setAuthOpen}
              theme={theme}
              onThemeChange={setTheme}
              canvasTheme={canvasTheme}
              onCanvasThemeChange={setCanvasTheme}
              settingsOpen={settingsOpen}
              onSettingsOpenChange={setSettingsOpen}
              onProfileChange={onAccountProfileChange}
              onViewProfile={() => {
                if (user?.id) openUserProfile(user.id);
              }}
              onNotice={showNotice}
            />
          </fig-footer>
        </nav>

        <div
          className="app-nav-resizer"
          role="separator"
          aria-label="Resize shader navigation"
          aria-orientation="vertical"
          aria-valuemin={MIN_APP_NAV_WIDTH}
          aria-valuemax={MAX_APP_NAV_WIDTH}
          aria-valuenow={appNavWidth}
          tabIndex={0}
          onPointerDown={resizeAppNav}
          onDoubleClick={() => saveAppNavWidth(DEFAULT_APP_NAV_WIDTH)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            saveAppNavWidth(
              Math.min(
                MAX_APP_NAV_WIDTH,
                Math.max(
                  MIN_APP_NAV_WIDTH,
                  appNavWidth + (event.key === "ArrowLeft" ? -16 : 16)
                )
              )
            );
          }}
        />
        </div>
        ) : null}

      {editorRouteErrorMessage ? (
        <main
          className="editor-route-state"
          role="status"
          aria-live="polite"
        >
          <p>{editorRouteErrorMessage}</p>
        </main>
      ) : isComposerView ? (
        <ComposerView
          viewerRef={viewerRef}
          visualizerRef={visualizerRef}
          header={shaderEditorHeader}
          preview={editorPreviewContent}
          properties={renderPropertiesPanel()}
        />
      ) : (
        <ShaderView
          viewerRef={viewerRef}
          sidebarRef={sidebarRef}
          visualizerRef={visualizerRef}
          style={{
            "--code-width": `${codeWidth}px`,
            "--chat-height": `${chatHeight}px`,
            ...(previewHeight != null
              ? { "--preview-height": `${previewHeight}px` }
              : {}),
          }}
          header={shaderEditorHeader}
          codeCollapsed={effectiveCodeCollapsed}
          chatCollapsed={protectedPreview ? false : chatCollapsed}
          stacked={stacked}
          codeWidth={codeWidth}
          previewHeight={previewHeight}
          minCodeWidth={MIN_CODE_WIDTH}
          minPreviewHeight={MIN_PREVIEW_HEIGHT}
          sidebar={
            <>
              <section
                className="shader-viewer-code"
                data-collapsed={effectiveCodeCollapsed ? "true" : "false"}
              >
                <fig-header borderless aria-expanded={!effectiveCodeCollapsed}>
                  <h3>Code</h3>
                  <hstack>
                    <fig-tooltip text="Copy code">
                      <fig-button
                        type="button"
                        variant="ghost"
                        icon="true"
                        aria-label="Copy code"
                        onClick={() => copyShaderCode()}
                      >
                        <fig-icon name="copy" />
                      </fig-button>
                    </fig-tooltip>
                    {!protectedPreview && (
                      <fig-tooltip
                        text={
                          effectiveCodeCollapsed
                            ? "Expand code"
                            : "Collapse code"
                        }
                      >
                        <fig-button
                          type="button"
                          variant="ghost"
                          icon="true"
                          aria-label={
                            effectiveCodeCollapsed
                              ? "Expand code"
                              : "Collapse code"
                          }
                          onClick={() => {
                            if (renaming) finishRename();
                            setCodeCollapsed((collapsed) => !collapsed);
                          }}
                        >
                          <fig-icon
                            class={
                              effectiveCodeCollapsed
                                ? "section-chevron is-collapsed"
                                : "section-chevron"
                            }
                            name="chevron"
                            size="medium"
                          />
                        </fig-button>
                      </fig-tooltip>
                    )}
                  </hstack>
                </fig-header>
                <div className="code-editor" hidden={effectiveCodeCollapsed}>
                  {!effectiveCodeCollapsed && (
                    <Suspense fallback={null}>
                      <CodePane
                        source={source}
                        theme={theme}
                        error={error}
                        readOnly={protectedPreview}
                        onSourceChange={onSourceChange}
                      />
                    </Suspense>
                  )}
                </div>
              </section>

              {!protectedPreview &&
                !effectiveCodeCollapsed &&
                !chatCollapsed && (
                  <div
                    className="pane-resizer pane-resizer-row"
                    role="separator"
                    aria-label="Resize code and chat panes"
                    aria-orientation="horizontal"
                    aria-valuemin={MIN_CHAT_HEIGHT}
                    aria-valuenow={chatHeight}
                    tabIndex={0}
                    onPointerDown={resizeChatPane}
                    onDoubleClick={() => saveChatHeight(DEFAULT_CHAT_HEIGHT)}
                    onKeyDown={(event) => {
                      if (
                        event.key !== "ArrowUp" &&
                        event.key !== "ArrowDown"
                      ) {
                        return;
                      }
                      event.preventDefault();
                      saveChatHeight(
                        Math.max(
                          MIN_CHAT_HEIGHT,
                          chatHeight + (event.key === "ArrowUp" ? 16 : -16)
                        )
                      );
                    }}
                  />
                )}

              {!protectedPreview && (
                <Suspense fallback={null}>
                  <ShaderChatSection
                    collapsed={chatCollapsed}
                    onCollapsedChange={setChatCollapsed}
                    canClear={canClearChat}
                    chatPaneRef={chatPaneRef}
                    sourceRef={sourceRef}
                    kind={kind}
                    fileName={shaderModuleFileName(presetId, shaderName)}
                    shaderKey={chatShaderKey}
                    planOwnerId={isOwner ? user.id : null}
                    planShaderId={isOwner ? currentShader.id : null}
                    featuresRef={shaderFeaturesRef}
                    experimentalAudioRef={experimentalAudioRef}
                    compileErrorRef={compileErrorRef}
                    user={user}
                    onApplySource={onSourceChange}
                    onAppliedCheckpoint={checkpointAgentVersion}
                    onOpenSettings={openSettings}
                    onNotice={showNotice}
                    onCanClearChange={setCanClearChat}
                  />
                </Suspense>
              )}
            </>
          }
          preview={editorPreviewContent}
          properties={renderPropertiesPanel()}
          onResizeCode={resizeCodePane}
          onResetCodeSize={() =>
            stacked
              ? savePreviewHeight(null)
              : saveCodeWidth(defaultCodeWidth())
          }
          onKeyResizeCode={(event) => {
            if (stacked) {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault();
              const viewer = viewerRef.current;
              const handle = event.currentTarget;
              const visualizer = visualizerRef.current;
              if (!viewer || !visualizer) return;
              const current =
                previewHeight ?? visualizer.getBoundingClientRect().height;
              const maxHeight = Math.max(
                MIN_PREVIEW_HEIGHT,
                viewer.getBoundingClientRect().height -
                  handle.getBoundingClientRect().height -
                  MIN_STACKED_SIDEBAR
              );
              savePreviewHeight(
                Math.min(
                  maxHeight,
                  Math.max(
                    MIN_PREVIEW_HEIGHT,
                    current + (event.key === "ArrowDown" ? 16 : -16)
                  )
                )
              );
              return;
            }
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            saveCodeWidth(
              Math.max(
                MIN_CODE_WIDTH,
                codeWidth + (event.key === "ArrowLeft" ? -16 : 16)
              )
            );
          }}
        />
      )}
      </div>
      )}
      </div>

      <ExportDialog
        dialogRef={exportDialogRef}
        tabsRef={exportTabsRef}
        tab={exportTab}
        settings={videoExportSettings}
        resolutionOptions={resolutionOptions}
        opaqueContent={opaqueContent}
        imageFormatRef={imageFormatRef}
        imageResolutionRef={imageResolutionRef}
        imageAspectRef={imageAspectRef}
        videoFormatRef={videoFormatRef}
        videoResolutionRef={videoResolutionRef}
        videoAspectRef={videoAspectRef}
        videoFrameRateRef={videoFrameRateRef}
        videoBitrateRef={videoBitrateRef}
        embedFormatRef={embedFormatRef}
        embedCode={embedCode}
        embedUrl={embedUrl}
        embedLinkAvailable={Boolean(embedUrl)}
        iframeEmbedAvailable={iframeEmbedAvailable}
        iframeEmbedUnavailableMessage={iframeEmbedUnavailableMessage}
        onClose={() => setExportOpen(false)}
        onExportImage={() => {
          downloadPreviewImage().catch((downloadError) => {
            reportAppError(downloadError.message || String(downloadError));
          });
        }}
        onExportVideo={() => {
          exportPreviewVideo().catch((videoError) => {
            setVideoExportProgress(null);
            reportAppError(videoError.message || String(videoError));
          });
        }}
        onDownloadEmbed={downloadEmbedCode}
        onCopyEmbed={copyEmbedCode}
        onCopyEmbedLink={copyEmbedLink}
        onDurationInput={(event) =>
          setVideoExportSettings((settings) => ({
            ...settings,
            duration: Number(event.target.value ?? event.detail),
          }))
        }
          onImageQualityInput={(event) =>
            setVideoExportSettings((settings) => ({
              ...settings,
              imageQuality: resolveImageExportQuality(
                event.target.value ?? event.detail
              ),
            }))
          }
          onIncludeAudioInput={(next) =>
            setVideoExportSettings((settings) => ({
              ...settings,
              includeAudio: Boolean(next),
            }))
          }
          audioAvailable={exportSoundtrackAvailable}
      />

      <DeleteShaderDialog
        dialogRef={deleteDialogRef}
        name={deleteTarget?.name}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
      <FigmaPlanDialog
        dialogRef={figmaPlanDialogRef}
        plans={figmaPlans}
        value={figmaPlanKey}
        loading={figmaSyncing}
        onChange={setFigmaPlanKey}
        onCancel={() => setPendingFigmaCreate(null)}
        onConfirm={confirmFigmaPlan}
      />

      <dialog
        is="fig-dialog"
        ref={figmaImportDialogRef}
        class="figma-import-dialog"
        title="Add from Figma"
        modal=""
        closedby="any"
        position="center center"
        autoresize=""
        onClose={() => setFigmaImportOpen(false)}
        onCancel={() => setFigmaImportOpen(false)}
      >
        {!figmaTokenConfigured ? (
          <div className="figma-import-message">
            <p>Connect Figma in Settings to browse your shader library.</p>
            <fig-button
              type="button"
              variant="secondary"
              onClick={() => {
                setFigmaImportOpen(false);
                setSettingsOpen(true);
              }}
            >
              Open Settings
            </fig-button>
          </div>
        ) : (
          <>
            {figmaLibraryError && (
              <p className="figma-import-message form-message error">
                {figmaLibraryError}
              </p>
            )}
            {!figmaLibraryLoading && (
              <fig-segmented-control
                ref={figmaImportKindRef}
                class="figma-import-kind"
                full=""
                sizing="equal"
                value={figmaImportKind}
                aria-label="Filter Figma shaders"
              >
                <fig-segment value="all" selected={figmaImportKind === "all"}>
                  All
                </fig-segment>
                <fig-segment
                  value="effect"
                  selected={figmaImportKind === "effect"}
                >
                  Effects
                </fig-segment>
                <fig-segment value="fill" selected={figmaImportKind === "fill"}>
                  Fills
                </fig-segment>
                <fig-segment
                  value="imported"
                  selected={figmaImportKind === "imported"}
                >
                  Imported
                </fig-segment>
              </fig-segmented-control>
            )}
            {!figmaLibraryLoading &&
              (figmaImportCards.length === 0 && !figmaLibraryError ? (
                <p className="figma-import-message">
                  {figmaImportKind === "effect"
                    ? "No new shader effects to import."
                    : figmaImportKind === "fill"
                      ? "No new shader fills to import."
                      : figmaImportKind === "imported"
                        ? "No imported Figma shaders yet."
                        : "No new Figma shaders to import."}
                </p>
              ) : (
                <ShaderList
                  ref={figmaImportChooserRef}
                  className="figma-import-list"
                  value=""
                  cards={figmaImportCards}
                  showPreview={false}
                  renderActions={(card) => {
                    const checked = figmaImportCheckedKeys.includes(card.key);
                    return (
                      <>
                        {card.imported && figmaImportKind !== "imported" && (
                          <span className="figma-import-in-studio">
                            In studio
                          </span>
                        )}
                        <fig-checkbox
                          class="figma-import-checkbox"
                          checked={checked ? "" : undefined}
                          aria-label={
                            card.imported
                              ? `Select ${card.name} to update`
                              : `Select ${card.name}`
                          }
                          disabled={figmaImportBusy ? "" : undefined}
                          onInput={(event) => {
                            event.stopPropagation();
                            const next =
                              typeof event.detail?.checked === "boolean"
                                ? event.detail.checked
                                : !checked;
                            toggleFigmaImportChecked(card.key, next);
                          }}
                          onClick={(event) => event.stopPropagation()}
                          dangerouslySetInnerHTML={{ __html: "" }}
                        />
                      </>
                    );
                  }}
                />
              ))}
            <fig-footer sticky="">
              {figmaLibraryLoading || figmaImportProgress ? (
                <label>
                  <fig-spinner
                    aria-label={
                      figmaImportProgress
                        ? figmaImportSelectionIsUpdate
                          ? "Updating shaders"
                          : "Importing shaders"
                        : "Loading Figma shaders"
                    }
                  />{" "}
                  <strong>
                    {figmaImportProgress
                      ? `${figmaImportProgress.current} of ${figmaImportProgress.total} shaders`
                      : "Loading shaders"}
                  </strong>
                </label>
              ) : (
                <>
                  <label>
                    {figmaImportCheckedCount
                      ? `${
                          figmaImportSelectionIsUpdate ? "Update" : "Import"
                        } ${figmaImportCheckedCount} shader${
                          figmaImportCheckedCount === 1 ? "" : "s"
                        }`
                      : figmaImportKind === "imported"
                        ? "Choose to update"
                        : "Choose to import"}
                  </label>
                  <fig-button
                    type="button"
                    variant="primary"
                    disabled={!figmaImportCheckedCount ? "" : undefined}
                    onClick={() => {
                      importSelectedFigmaShaders().catch(() => {});
                    }}
                  >
                    {figmaImportSelectionIsUpdate ? "Update" : "Add"}
                  </fig-button>
                </>
              )}
            </fig-footer>
          </>
        )}
      </dialog>

      {portalToFigOverlay(
      <dialog
        is="fig-popup"
        ref={publishDialogRef}
        class="publish-popup settings-popup"
        position="bottom right"
        offset="8 0"
        variant="popover"
        theme="menu"
        popover="manual"
        closedby="any"
        onClose={() => setPublishOpen(false)}
        onCancel={() => setPublishOpen(false)}
      >
        <fig-header>
          <h3>
            {currentShader?.is_public
              ? "Publish update"
              : "Publish to community"}
          </h3>
        </fig-header>
        <fig-content padding>
          <p>
            {currentShader?.is_public
              ? "Update the public copy with your latest source, properties, and input. Anyone with the link will see the new version."
              : "Share this shader so others can open it, remix the source, and use the same input. Anyone with the link will be able to view it."}
          </p>
        </fig-content>
        <fig-footer>
          <fig-button
            type="button"
            variant="ghost"
            onClick={() => setPublishOpen(false)}
          >
            Cancel
          </fig-button>
          <fig-button
            type="button"
            variant="primary"
            disabled={saving}
            onClick={() => {
              publishShader().catch(() => {});
            }}
          >
            {currentShader?.is_public ? "Publish update" : "Publish"}
          </fig-button>
        </fig-footer>
      </dialog>
      )}
      <AppToasts
        videoExportToastRef={videoExportToastRef}
        videoExportedToastRef={videoExportedToastRef}
        videoExportProgress={videoExportProgress}
        noticeToastRef={noticeToastRef}
        notice={notice}
        onNoticeClose={() => setNotice(null)}
        publishToastRef={publishToastRef}
        publishToast={publishToast}
        onPublishToastClose={() => setPublishToast(null)}
        figmaSyncToastRef={figmaSyncToastRef}
        figmaSyncToast={figmaSyncToast}
        onFigmaSyncToastClose={() => setFigmaSyncToast(null)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.svg,image/svg+xml"
        onChange={onFileInput}
        hidden
      />
    </>
  );
}
