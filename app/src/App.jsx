import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CompositionEditor, {
  ExportPropertiesPane,
} from "./components/CompositionEditor.jsx";
import AccountMenu from "./components/AccountMenu.jsx";
import AppToasts from "./components/AppToasts.jsx";
import DeleteShaderDialog from "./components/DeleteShaderDialog.jsx";
import ExportDialog from "./components/ExportDialog.jsx";
import GridViewIcon from "./components/GridViewIcon.jsx";
import HomeView from "./components/HomeView.jsx";
import "./components/HomeNav.css";
import ComposerView from "./components/ComposerView.jsx";
import LibraryFilterMenu from "./components/LibraryFilterMenu.jsx";
import ListViewIcon from "./components/ListViewIcon.jsx";
import ShaderView from "./components/ShaderView.jsx";
import Preview from "./components/Preview.jsx";
import PreviewFps from "./components/PreviewFps.jsx";
import ShaderActionsMenu from "./components/ShaderActionsMenu.jsx";
import ShaderList from "./components/ShaderList.jsx";
import ShaderNavCard from "./components/ShaderNavCard.jsx";
import ShaderVersionSelect from "./components/ShaderVersionSelect.jsx";
import UserAvatar from "./components/UserAvatar.jsx";
import { useAuth } from "./contexts/AuthContext.jsx";
import { getPreset, PRESETS, shaderModuleFileName } from "./presets.js";
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
import { ShaderHost } from "./runtime/host.js";
import { loadModule } from "./runtime/loader.js";
import {
  buildDefaults,
  detectKind,
  inferFeatures,
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
  hasUncheckpointedShaderState,
  isShaderStateConflict,
  summarizeAgentVersion,
  summarizeManualVersion,
} from "./lib/shaderVersions.js";
import { validateModuleSource } from "./lib/chatApply.js";
import {
  ANON_YOU_LABEL,
  buildShaderLibraryCards,
  figmaLibraryKey,
  filterShaderLibraryCards,
  nextLibraryCardKey,
} from "./lib/shaderLibrary.js";
import {
  formatSupabaseError,
  isTransientCloudWriteError,
} from "./lib/supabaseFetch.js";
import {
  getFigmaAccessToken,
  subscribeFigmaAccessToken,
} from "./lib/figmaAccessToken.js";
import { FIGMA_LIBRARY_UI_ENABLED } from "./lib/figmaLibraryUi.js";
import { buildStandaloneEmbedCode } from "./lib/embedCode.js";
import {
  ACTIVE_DRAFT_STORAGE_KEY,
  readDrafts as savedDrafts,
  writeDrafts,
} from "./lib/draftStorage.js";
import { writeInputSource as persistInputSource } from "./lib/inputSourceStorage.js";
import {
  persistableEffectFill,
  readEffectFill,
  rememberEffectFill,
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
  CANVAS_THEME_STORAGE_KEY,
  DEFAULT_APP_NAV_WIDTH,
  DEFAULT_CHAT_HEIGHT,
  defaultCodeWidth,
  LIBRARY_VIEW_STORAGE_KEY,
  MAX_APP_NAV_WIDTH,
  MIN_APP_NAV_WIDTH,
  MIN_CHAT_HEIGHT,
  MIN_CODE_EDITOR_HEIGHT,
  MIN_CODE_WIDTH,
  MIN_PREVIEW_HEIGHT,
  MIN_PREVIEW_WIDTH,
  MIN_STACKED_SIDEBAR,
  PLAY_STORAGE_KEY,
  readCanvasTheme as savedCanvasTheme,
  readLibraryView as savedLibraryView,
  readPlayState as savedPlayState,
  readSidebarSections as savedSidebarSections,
  readTheme as savedTheme,
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
  fillFromInputSource,
  paintForInputSource,
  resolvedLibraryKind,
  fillTypeForDroppedMedia,
  isCompositionPlayable,
  mediaFillType,
  normalizeComposition,
  parseCompositionShaderId,
  readReferencedShader,
  referencedShaderKeys,
  resolveReferencedShaderSource,
  unpublishedCompositionLabels,
  unpublishedCompositionRefs,
  promoteCompositionRefs,
  serializeCompositionExport,
} from "./lib/composition.js";
import {
  graphTypeForPaint,
  isPaintFillType,
  paintImageSource,
  paintSize,
  rasterizePaintFill,
  resolvePaintFill,
} from "./lib/paintFill.js";
import {
  cloudChoiceId,
  cloudIdForDraft,
  figmaShaderLink,
  isDraftId,
  shaderContentFingerprint,
} from "./lib/shaderIdentity.js";
import {
  shaderSaveQueue,
  withExclusiveShaderSave,
} from "./lib/shaderSaveQueue.js";
import {
  getFigmaShader,
  listAllFigmaShaders,
} from "./services/figmaShaders.js";
import { useFigMenuChange } from "./hooks/useFigMenuChange.js";
import { usePanelLayout } from "./hooks/usePanelLayout.js";
import { useShaderPersistence } from "./hooks/useShaderPersistence.js";
import { useShaderRuntime } from "./hooks/useShaderRuntime.js";
import { useShaderSession } from "./hooks/useShaderSession.js";
import {
  createShader,
  deleteShader,
  downloadAsset,
  getAssetUrl,
  getAssetUrls,
  getShader,
  getShaderMaybe,
  getShadersByIds,
  getShaderVersion,
  getAppRoute,
  getShaderRouteId,
  listAllShaderVersions,
  listShaderVersions,
  listShaders,
  makeHomeUrl,
  makeShareUrl,
  MAX_MEDIA_BYTES,
  removeAssets,
  removeShaderPlan,
  restoreShaderVersion,
  saveShaderState,
  updateShader,
  uploadAsset,
  uploadShaderPlan,
} from "./services/shaders.js";

const CodePane = lazy(() => import("./components/CodePane.jsx"));
const Controls = lazy(() => import("./components/Controls.jsx"));
const ShaderChatSection = lazy(
  () => import("./components/ShaderChatSection.jsx"),
);

// FigUI3 builds light-DOM internals; a stable opaque marker keeps React from
// wiping those nodes when the parent re-renders.
const opaqueContent = { __html: "" };

const INITIAL = getPreset("dither");
const INITIAL_MODULE = loadModule(INITIAL.source);
const INITIAL_VALUES = buildDefaults(INITIAL_MODULE.props);
const THUMBNAIL_SIZE = 512;
const THUMBNAIL_IDLE_MS = 4000;
const BACKGROUND_AUTOSAVE_MS = 4000;
const CLOUD_WRITE_BACKOFF_MS = 20_000;

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

const FIGMA_SHADER_CATEGORIES = [
  { kind: "effect", label: "Shader effect" },
  { kind: "fill", label: "Shader fill" },
];
const EFFECT_PREVIEW_LAYER_ID = "effect-preview";

function effectFillPreviewKey(fill) {
  return fill?.type === "shader" && fill.shaderId
    ? `${fill.shaderId}:${fill.enabled !== false}`
    : "";
}

function usesCompositionHost(sessionKind, fill) {
  return (
    sessionKind === COMPOSITION_KIND || Boolean(effectFillPreviewKey(fill))
  );
}

function createHiddenVideoElement() {
  const video = document.createElement("video");
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
) {
  const effects = cards.filter((card) => card.kind === "effect");
  const fills = cards.filter((card) => card.kind === "fill");
  const compositions = cards.filter((card) => card.kind === COMPOSITION_KIND);
  return [
    ...(compositions.length
      ? [
          {
            key: `separator:${keyPrefix}:composition`,
            separatorLabel: compositionLabel,
          },
          ...compositions,
        ]
      : []),
    ...(effects.length
      ? [
          { key: `separator:${keyPrefix}:effect`, separatorLabel: effectLabel },
          ...effects,
        ]
      : []),
    ...(fills.length
      ? [
          { key: `separator:${keyPrefix}:fill`, separatorLabel: fillLabel },
          ...fills,
        ]
      : []),
  ];
}

function groupLibraryCards(cards) {
  return groupByKind(
    cards,
    "Shader effects",
    "Shader fills",
    "Compositions",
    "studio",
  );
}

function compositionWithLayerValues(graph, layerId, values) {
  const normalized = normalizeComposition(graph);
  if (layerId === COMPOSITION_FILL_ID) {
    return {
      ...normalized,
      fill: { ...normalized.fill, values: values || {} },
    };
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

function replaceShaderUrl(id, kind) {
  window.history.replaceState(
    {},
    "",
    id ? makeShareUrl(id, kind) : makeHomeUrl()
  );
}

function pushShaderUrl(id, kind) {
  window.history.pushState({}, "", makeShareUrl(id, kind));
}

function AuthorAvatar({ class: className, tooltip, src, name }) {
  return (
    <UserAvatar
      class={className}
      tooltip={tooltip ?? name ?? "Anon"}
      src={src}
      name={name}
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
  const [presetId, setPresetId] = useState(INITIAL.id);
  const [shaderName, setShaderName] = useState(INITIAL.name);
  const [source, setSource] = useState(INITIAL.source);
  const [sessionKind, setSessionKind] = useState(
    () => getAppRoute().kind || INITIAL.kind,
  );
  const [composition, setComposition] = useState(null);
  const [effectFill, setEffectFill] = useState(
    () => readEffectFill(INITIAL.id) || fillFromInputSource("image")
  );
  const [inputImageUrl, setInputImageUrl] = useState(defaultInputUrl);
  const [selectedLayerId, setSelectedLayerId] = useState(COMPOSITION_FILL_ID);
  const [compositionPropsLayerId, setCompositionPropsLayerId] = useState(null);
  const [layerControlsEpoch, setLayerControlsEpoch] = useState(0);
  const [resolvedShaders, setResolvedShaders] = useState({});
  const [props, setProps] = useState(INITIAL_MODULE.props);
  const [values, setValues] = useState(INITIAL_VALUES);
  const [error, setError] = useState(null);
  const [fatal, setFatal] = useState(null);
  const onPersistenceError = useCallback(
    (persistenceError) =>
      setError(persistenceError.message || String(persistenceError)),
    [],
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
  const [renaming, setRenaming] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [cloudShaders, setCloudShaders] = useState([]);
  const [drafts, setDrafts] = useState(INITIAL_DRAFTS);
  const [cloudThumbnails, setCloudThumbnails] = useState({});
  const [pendingMedia, setPendingMedia] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  });
  const [videoExportProgress, setVideoExportProgress] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState(null);
  const {
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
  } = useShaderPersistence({
    userId: user?.id ?? null,
    onError: onPersistenceError,
  });
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
  } = usePanelLayout();
  const [theme, setTheme] = useState(savedTheme);
  const [canvasTheme, setCanvasTheme] = useState(savedCanvasTheme);
  const [routeId, setRouteId] = useState(() => getShaderRouteId());
  const [routeKind, setRouteKind] = useState(() => getAppRoute().kind);
  const [homeQuery, setHomeQuery] = useState("");
  const [editorQuery, setEditorQuery] = useState("");
  const [homeKind, setHomeKind] = useState("all");
  const [homeOrigin, setHomeOrigin] = useState("all");
  const [homeAuthor, setHomeAuthor] = useState("all");
  const [editorKind, setEditorKind] = useState("all");
  const [editorOrigin, setEditorOrigin] = useState("all");
  const [editorAuthor, setEditorAuthor] = useState("all");
  const [libraryView, setLibraryView] = useState(savedLibraryView);
  const [figmaTokenConfigured, setFigmaTokenConfigured] = useState(
    () =>
      FIGMA_LIBRARY_UI_ENABLED ? Boolean(getFigmaAccessToken()) : false
  );
  const [figmaShaders, setFigmaShaders] = useState([]);
  const [figmaLibraryLoading, setFigmaLibraryLoading] = useState(false);
  const [figmaLibraryError, setFigmaLibraryError] = useState("");
  const [figmaImportOpen, setFigmaImportOpen] = useState(false);
  const [figmaImportProgress, setFigmaImportProgress] = useState(null);
  const [figmaImportCheckedKeys, setFigmaImportCheckedKeys] = useState([]);
  const [figmaImportKind, setFigmaImportKind] = useState("all");
  const [codeCollapsed, setCodeCollapsed] = useState(
    () => savedSidebarSections().codeCollapsed
  );
  const [chatCollapsed, setChatCollapsed] = useState(
    () => savedSidebarSections().chatCollapsed
  );
  const viewMode = routeId ? "editor" : "home";

  const setShaderRoute = useCallback((id, kind) => {
    replaceShaderUrl(id, kind);
    setRouteId(id || null);
    setRouteKind(kind === COMPOSITION_KIND ? COMPOSITION_KIND : null);
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
  const noticeToastRef = useRef(null);
  const exportDialogRef = useRef(null);
  const exportTabsRef = useRef(null);
  const videoExportToastRef = useRef(null);
  const videoExportedToastRef = useRef(null);
  const inputLoadingToastRef = useRef(null);
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
  const figmaImportDialogRef = useRef(null);
  const figmaImportChooserRef = useRef(null);
  const figmaImportKindRef = useRef(null);
  const propertiesPanelRef = useRef(null);
  const visualizerRef = useRef(null);
  const lastSuccessfulCompileRef = useRef({
    presetId: INITIAL.id,
    source: INITIAL.source,
    values: INITIAL_VALUES,
  });
  const initedRef = useRef(false);
  const sourceRef = useRef(source);
  const compositionRef = useRef(composition);
  const effectFillRef = useRef(effectFill);
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
  const versionPreviewCacheRef = useRef(new Map());
  const versionPreviewStateRef = useRef(null);
  const versionPreviewAppliedRef = useRef(false);
  const versionPreviewSnapshotRef = useRef(null);
  const versionPreviewRequestRef = useRef(0);
  const pendingValuesRef = useRef(null);
  const compileTimer = useRef(0);
  const lastCompiledPresetRef = useRef(presetId);
  const liveShaderSourceRef = useRef(new Map());
  const [liveShaderRevision, setLiveShaderRevision] = useState(0);
  const previewParamsRafRef = useRef(0);
  const paintFillRafRef = useRef(0);
  const applyPaintFillRef = useRef(null);
  const sharedLoadedRef = useRef(false);
  const migratedUserRef = useRef(null);
  const cloudWriteBackoffUntilRef = useRef(0);
  const activeFigmaLink = figmaShaderLink(
    isDraftId(presetId)
      ? drafts.find((draft) => draft.id === presetId)
      : currentShader
  );
  const draftSessionRef = useRef({
    presetId,
    shaderName,
    source,
    values,
    isPublic,
    pendingMedia,
    kind: sessionKind,
    composition,
    ...activeFigmaLink,
  });

  sourceRef.current = source;
  compositionRef.current = composition;
  effectFillRef.current = effectFill;
  sessionKindRef.current = sessionKind;
  propsRef.current = props;
  valuesRef.current = values;
  draftSessionRef.current = {
    presetId,
    shaderName,
    source,
    values,
    isPublic,
    pendingMedia,
    kind: sessionKind,
    composition,
    ...activeFigmaLink,
  };
  const kind = useMemo(
    () =>
      sessionKind === COMPOSITION_KIND
        ? COMPOSITION_KIND
        : detectKind(source),
    [sessionKind, source]
  );
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
    if (inputSource === "html") {
      setEffectFill((current) =>
        current.type === "html" ? current : fillFromInputSource("html")
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
      if (current.type === "shader") return current;
      const next = {
        ...fillFromInputSource(inputSource),
        shaderId: current.shaderId ?? null,
        values: current.values || {},
        enabled: current.enabled !== false,
        paint,
      };
      const currentUrl = current.paint?.image?.url || current.paint?.video?.url;
      const nextUrl = paint.image?.url || paint.video?.url;
      if (
        current.type === next.type &&
        current.paint?.type === paint.type &&
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
      if (customUrl && inputSource !== "vector" && current.type === next.type) {
        return current;
      }
      return next;
    });
  }, [inputSource, kind]);
  useEffect(() => {
    if (sessionKind !== "effect" || !presetId) return;
    rememberEffectFill(effectFillByPresetRef.current, presetId, effectFill);
  }, [effectFill, presetId, sessionKind]);
  const resolvedByKey = useMemo(
    () => new Map(Object.entries(resolvedShaders)),
    [resolvedShaders]
  );
  const compositionPlayable = useMemo(
    () =>
      kind === COMPOSITION_KIND &&
      isCompositionPlayable(composition, resolvedByKey),
    [composition, kind, resolvedByKey]
  );
  const shaderFeatures = useMemo(
    () =>
      kind === COMPOSITION_KIND
        ? collectCompositionFeatures(composition, resolvedByKey)
        : inferFeatures(source),
    [composition, kind, resolvedByKey, source]
  );
  const shaderFeaturesRef = useRef(shaderFeatures);
  shaderFeaturesRef.current = shaderFeatures;
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
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(CANVAS_THEME_STORAGE_KEY, canvasTheme);
  }, [canvasTheme]);

  useEffect(() => {
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, libraryView);
  }, [libraryView]);

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
        const [effects, fills] = await Promise.all([
          listAllFigmaShaders("effect"),
          listAllFigmaShaders("fill"),
        ]);
        if (cancelled) return;
        setFigmaShaders([
          ...effects.map((item) => ({ ...item, kind: "effect" })),
          ...fills.map((item) => ({ ...item, kind: "fill" })),
        ]);
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
    localStorage.setItem(
      SIDEBAR_SECTIONS_STORAGE_KEY,
      JSON.stringify({ codeCollapsed, chatCollapsed })
    );
  }, [codeCollapsed, chatCollapsed]);

  useEffect(() => {
    if (user) return;
    const timer = window.setTimeout(() => {
      writeDrafts(drafts, thumbnailDataUrlsRef.current);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [drafts, thumbnails, user]);

  useEffect(() => {
    if (user) return;
    if (!isDraftId(presetId)) {
      localStorage.removeItem(ACTIVE_DRAFT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_DRAFT_STORAGE_KEY, presetId);
    const timer = window.setTimeout(() => {
      setDrafts((current) => {
        const existing = current.find((draft) => draft.id === presetId);
        if (!existing) return current;
        if (
          existing.name === shaderName &&
          existing.source === source &&
          existing.kind === sessionKind &&
          existing.isPublic === isPublic &&
          JSON.stringify(existing.values || {}) === JSON.stringify(values) &&
          JSON.stringify(existing.composition || null) ===
            JSON.stringify(composition) &&
          JSON.stringify(existing.effectFill || null) ===
            JSON.stringify(effectFill)
        ) {
          return current;
        }
        return current.map((draft) =>
          draft.id === presetId
            ? {
                ...draft,
                name: shaderName,
                source,
                kind: sessionKind,
                values,
                composition:
                  sessionKind === "effect"
                    ? { effectFill }
                    : composition,
                effectFill,
                isPublic,
                pendingMedia,
              }
            : draft
        );
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    composition,
    effectFill,
    isPublic,
    pendingMedia,
    presetId,
    sessionKind,
    shaderName,
    source,
    user,
    values,
  ]);

  useEffect(() => {
    const flush = () => {
      const session = draftSessionRef.current;
      if (!isDraftId(session.presetId)) return;
      const current = savedDrafts();
      const next = current.some((draft) => draft.id === session.presetId)
        ? current.map((draft) =>
            draft.id === session.presetId
              ? {
                  ...draft,
                  name: session.shaderName,
                  source: session.source,
                  kind: session.kind,
                  values: session.values,
                  composition: session.composition,
                  isPublic: session.isPublic,
                  pendingMedia: null,
                }
              : draft
          )
        : [
            {
              id: session.presetId,
              name: session.shaderName,
              kind: session.kind || detectKind(session.source),
              source: session.source,
              values: session.values,
              composition: session.composition,
              isPublic: session.isPublic,
              pendingMedia: null,
              thumbnail: null,
              ...figmaShaderLink(session),
            },
            ...current,
          ];
      writeDrafts(next, thumbnailDataUrlsRef.current);
      localStorage.setItem(ACTIVE_DRAFT_STORAGE_KEY, session.presetId);
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
    const toast = inputLoadingToastRef.current;
    if (!toast) return;
    if (uploading) toast.showToast?.();
    else toast.hideToast?.();
  }, [uploading]);

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
    embedFormatSelect?.addEventListener("change", onEmbedFormat);
    return () => {
      imageFormatSelect?.removeEventListener("change", onImageFormat);
      formatSelect?.removeEventListener("change", onFormat);
      imageResolutionSelect?.removeEventListener("change", onResolution);
      imageAspectSelect?.removeEventListener("change", onAspect);
      resolutionSelect?.removeEventListener("change", onResolution);
      aspectSelect?.removeEventListener("change", onAspect);
      frameRateSelect?.removeEventListener("change", onFrameRate);
      bitrateSelect?.removeEventListener("change", onBitrate);
      embedFormatSelect?.removeEventListener("change", onEmbedFormat);
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
    if (notice) noticeToastRef.current?.showToast?.();
  }, [notice]);

  const showNotice = useCallback((message, options = {}) => {
    setNotice({
      message,
      error: options.error === true,
      danger: options.danger === true,
      brand: options.brand === true,
    });
  }, []);

  useEffect(() => {
    const authError = consumeAuthCallbackError();
    if (authError) showNotice(authError, { error: true });
  }, [showNotice]);

  const setRuntimeValues = useCallback((next) => {
    valuesRef.current = next;
    setValues(next);
    if (usesCompositionHost(sessionKindRef.current, effectFillRef.current)) {
      hostRef.current?.setCompositionLayerParams?.(
        selectedLayerIdRef.current,
        next
      );
      return;
    }
    hostRef.current?.setParams(next);
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
    if (previous?.source !== entry.source) {
      setLiveShaderRevision((revision) => revision + 1);
    }
  }, []);

  const hydrateCompositionRefs = useCallback(
    async (graph) => {
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
        features: inferFeatures(live.source || ""),
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
        const live = readReferencedShader(key, {
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
            const live = readReferencedShader(key, {
              session: draftSessionRef.current,
              drafts,
              liveByKey: liveShaderSourceRef.current,
            });
            const row = byId.get(id);
            const source = live?.source || row?.source;
            const next =
              !row || row.kind === COMPOSITION_KIND || !source
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
                    features: inferFeatures(source),
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
    async (graphOverride) => {
      const host = hostRef.current;
      if (!host?.ready) return;
      const graph = normalizeComposition(
        graphOverride || compositionRef.current || emptyComposition()
      );
      const compileGeneration = ++compileGenerationRef.current;
      host.stop();
      const resolved = await hydrateCompositionRefs(graph);
      if (compileGeneration !== compileGenerationRef.current) return;
      const map = new Map(Object.entries(resolved));
      const layers = [];
      const loadLayer = (id, role, shaderId, values, enabled = true) => {
        const source = resolveReferencedShaderSource(shaderId, {
          session: draftSessionRef.current,
          drafts,
          liveByKey: liveShaderSourceRef.current,
          resolvedByKey: map,
        });
        if (!source) return;
        try {
          const loaded = loadModule(source);
          layers.push({
            id,
            role,
            enabled,
            setup: loaded.setup,
            render: loaded.render,
            props: loaded.props,
            params: mergeValues(loaded.props, values),
          });
        } catch (loadError) {
          rememberResolved([
            {
              key: shaderId,
              source,
              broken: true,
              name: loadError.message,
            },
          ]);
        }
      };
      if (graph.fill.type === "shader" && graph.fill.shaderId) {
        loadLayer(
          COMPOSITION_FILL_ID,
          "fill",
          graph.fill.shaderId,
          graph.fill.values,
          graph.fill.enabled
        );
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
      const features = collectCompositionFeatures(graph, map);
      const ok = await host.setComposition(layers, {
        isFill: graph.fill.type === "shader",
        isAnimated: features.isAnimated,
        usesMouse: features.usesMouse,
        supportsRenderScale: false,
      });
      if (
        compileGeneration !== compileGenerationRef.current ||
        hostRef.current !== host
      ) {
        return;
      }
      if (!ok) {
        setRunning(false);
        return;
      }
      const selected =
        layers.find((layer) => layer.id === selectedLayerIdRef.current) ||
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
      if (playPreferenceRef.current && features.isAnimated) {
        host.setActive(true);
        host.start();
        setRunning(true);
      } else {
        host.stop();
        setRunning(false);
      }
      const paint = compositionPaintFill(graph);
      if (paint) applyPaintFillRef.current?.(paint);
    },
    [drafts, hydrateCompositionRefs, rememberResolved, setRuntimeValues]
  );
  compileCompositionRef.current = compileComposition;

  const compile = useCallback(
    (nextSource) => {
      if (sessionKindRef.current === COMPOSITION_KIND) {
        compileCompositionRef.current?.();
        return;
      }
      const fillKey = effectFillPreviewKey(effectFillRef.current);
      if (sessionKindRef.current === "effect" && fillKey) {
        if (
          lastSuccessfulCompileRef.current.presetId ===
            draftSessionRef.current.presetId &&
          lastSuccessfulCompileRef.current.source === nextSource &&
          lastSuccessfulCompileRef.current.effectFillKey === fillKey
        ) {
          return;
        }
        selectedLayerIdRef.current = EFFECT_PREVIEW_LAYER_ID;
        lastSuccessfulCompileRef.current = {
          presetId: draftSessionRef.current.presetId,
          source: nextSource,
          values: pendingValuesRef.current ?? valuesRef.current,
          effectFillKey: fillKey,
        };
        compileCompositionRef.current?.({
          fill: effectFillRef.current,
          effects: [
            {
              id: EFFECT_PREVIEW_LAYER_ID,
              shaderId: draftSessionRef.current.presetId,
              values: pendingValuesRef.current ?? valuesRef.current,
              enabled: true,
            },
          ],
        });
        return;
      }
      const host = hostRef.current;
      if (!host?.ready) return;
      if (
        lastSuccessfulCompileRef.current.presetId ===
          draftSessionRef.current.presetId &&
        lastSuccessfulCompileRef.current.source === nextSource &&
        !lastSuccessfulCompileRef.current.effectFillKey
      ) {
        return;
      }
      const compileGeneration = ++compileGenerationRef.current;
      host.stop();

      let loaded;
      try {
        loaded = loadModule(nextSource);
      } catch (compileError) {
        if (compileGeneration !== compileGenerationRef.current) return;
        setError(compileError.message);
        host.stop();
        setRunning(false);
        return;
      }

      const preferred = pendingValuesRef.current ?? valuesRef.current;
      pendingValuesRef.current = null;
      const nextValues = mergeValues(loaded.props, preferred);
      const nextFeatures = inferFeatures(nextSource);
      setProps(loaded.props);
      setRuntimeValues(nextValues);
      setError(null);

      host
        .setModule(
          { setup: loaded.setup, render: loaded.render },
          {
            isFill: detectKind(nextSource) === "fill",
            isAnimated: nextFeatures.isAnimated,
            usesMouse: nextFeatures.usesMouse,
            supportsRenderScale: supportsRenderScale(nextSource),
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
            return;
          }
          lastSuccessfulCompileRef.current = {
            presetId: draftSessionRef.current.presetId,
            source: nextSource,
            values: nextValues,
            effectFillKey: "",
          };
          if (
            pendingAgentCheckpointRef.current?.presetId ===
              draftSessionRef.current.presetId &&
            pendingAgentCheckpointRef.current?.source === nextSource
          ) {
            setPendingAgentCheckpoint({
              ...pendingAgentCheckpointRef.current,
              values: nextValues,
            });
            pendingAgentCheckpointRef.current = null;
          }
          // Capture code edits only after the new module has compiled,
          // validated, and presented successfully.
          setThumbnailRefreshRevision((revision) => revision + 1);
          // Restore the user's play/pause preference after shader switches.
          if (playPreferenceRef.current) {
            host.setActive(true);
            host.start();
            setRunning(true);
          } else {
            host.stop();
            setRunning(false);
          }
        })
        .catch(() => {
          /* Destroyed hosts / GPU teardown can reject; ignore stale work. */
        });
    },
    [setRuntimeValues]
  );
  compileRef.current = compile;

  const syncEffectFillFromCanvasInput = useCallback((paint) => {
    if (sessionKindRef.current !== "effect") return;
    if (!isPaintFillType(paint?.type)) return;
    setEffectFill((current) => {
      if (current?.type === "shader") return current;
      const type = graphTypeForPaint(paint.type);
      if (
        current?.type === type &&
        current?.paint?.type === paint.type &&
        JSON.stringify(current.paint) === JSON.stringify(paint)
      ) {
        return current;
      }
      return {
        type,
        shaderId: current?.shaderId ?? null,
        values: current?.values || {},
        enabled: current?.enabled !== false,
        paint,
      };
    });
  }, []);

  const setImagePreviewUrl = useCallback((url) => {
    const next = url || defaultInputUrl;
    const prev = inputImageUrlRef.current;
    if (prev && prev !== next && prev.startsWith("blob:")) {
      URL.revokeObjectURL(prev);
    }
    inputImageUrlRef.current = next;
    setInputImageUrl(next);
  }, []);

  const applyMediaBlob = useCallback(
    async (blob, mimeType = blob.type, generation = null) => {
      const host = hostRef.current;
      if (!host?.ready) return false;
      if (!isInputApplyCurrent(generation)) return false;
      clearObjectUrl();

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
        mediaUrlRef.current = url;
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
          video.pause();
          video.removeAttribute("src");
          video.load();
          video.remove();
          if (mediaUrlRef.current === url) {
            URL.revokeObjectURL(url);
            mediaUrlRef.current = null;
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
          video.pause();
          video.removeAttribute("src");
          video.load();
          video.remove();
          if (mediaUrlRef.current === url) {
            URL.revokeObjectURL(url);
            mediaUrlRef.current = null;
          }
          return false;
        }

        if (!video.videoWidth || !video.videoHeight) {
          throw new Error("Video input has no decoded frames yet.");
        }

        videoRef.current = video;
        host.setVideoInput(video);
        setInputSource("video");
        const videoPaint = {
          type: "video",
          video: { url, scaleMode: "fill" },
        };
        syncEffectFillFromCanvasInput(videoPaint);
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
        setInputSource("image");
        const previewUrl = URL.createObjectURL(blob);
        setImagePreviewUrl(previewUrl);
        syncEffectFillFromCanvasInput({
          type: "image",
          image: { url: previewUrl, scaleMode: "fill" },
        });
      }
      setPreviewRevision((revision) => revision + 1);
      return true;
    },
    [clearObjectUrl, isInputApplyCurrent, setImagePreviewUrl, syncEffectFillFromCanvasInput]
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
            audio: false,
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
      setPreviewRevision((revision) => revision + 1);
      return true;
    },
    [clearObjectUrl, isInputApplyCurrent, setInputSource]
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
        image: { url: defaultVectorUrl, scaleMode: "fill" },
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
        setError(HTML_IN_CANVAS_SETUP);
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
      setError(null);
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
        setError(inputError.message || String(inputError));
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
          setError(HTML_IN_CANVAS_SETUP);
          return;
        }
        ++inputApplyGenRef.current;
        clearObjectUrl();
        setPendingMedia(null);
        setError(null);
        // This supersedes any in-flight load, whose own cleanup will bail out.
        setUploading(false);
        setInputSource("html");
        return;
      }

      const generation = ++inputApplyGenRef.current;
      setInputSource(next);
      setError(null);
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
          setError(sourceError.message || String(sourceError));
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
                    setError("Input media must be 25 MB or smaller.");
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
                    setError("Input media must be 25 MB or smaller.");
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
              setError(paintError.message || String(paintError));
            }
            resolve(false);
          });
        });
        paintFillRafRef.current = { id, resolve };
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
      setError(sourceError.message || String(sourceError))
    );
  }, [applyInputSource, runtimeReady]);

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
        setError(HTML_IN_CANVAS_SETUP);
        return;
      }
      host.setHtmlInput(element, HTML_INPUT_WIDTH, HTML_INPUT_HEIGHT);
      setPreviewRevision((revision) => revision + 1);
    } catch (htmlError) {
      setError(htmlError.message || String(htmlError));
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
      setError(inputError.message || String(inputError))
    );
  }, [kind, runtimeReady, applyPaintFill, clearObjectUrl, reapplyPreferredInput]);

  useEffect(() => {
    if (viewMode !== "editor" || initedRef.current || !canvasRef.current) return;
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
    host.setPreviewZoom(previewZoom);
    // The overlay mounts before this effect runs, so adopt the surface it reported.
    host.setPointerSurface(pointerSurfaceRef.current);
    // The initial image load must be cancellable by a source selection made
    // while WebGPU is initializing or while that image is decoding.
    const initialInputGeneration = ++inputApplyGenRef.current;

    // Pause the render loop and video decode while the tab is backgrounded so a
    // hidden Shader Studio stops driving the GPU and video decoder.
    const onVisibilityChange = () => {
      host.setActive(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    (async () => {
      try {
        await host.init();
        if (cancelled) return;
        // A tab opened in the background starts inactive.
        host.setActive(document.visibilityState === "visible");
        await restoreSample(initialInputGeneration);
        if (cancelled) return;
        // Compile via the source/preset effect once runtimeReady flips — avoids
        // racing a stale sourceRef when opening a shader from the home page.
        setRuntimeReady(true);
      } catch (initError) {
        setFatal(initError.message || String(initError));
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
      initedRef.current = false;
      setRuntimeReady(false);
      clearObjectUrl();
    };
  }, [clearObjectUrl, restoreSample, viewMode, isComposerView]);

  useEffect(() => {
    if (!runtimeReady || !hostRef.current?.ready) return;
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
    sessionKind === COMPOSITION_KIND ? liveShaderRevision : 0,
    presetId,
    runtimeReady,
  ]);

  useEffect(
    () => () => {
      window.clearTimeout(thumbnailPreviewTimerRef.current);
      clearObjectUrl();
    },
    [clearObjectUrl]
  );

  const loadMediaForShader = useCallback(
    async (shader) => {
      if (shader.kind !== "effect" && shader.kind !== COMPOSITION_KIND) {
        clearObjectUrl();
        hostRef.current?.clearInput();
        return;
      }
      if (!shader.input_path) {
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
      const generation = ++inputApplyGenRef.current;
      setUploading(true);
      const isVideo = String(shader.input_mime_type || "").startsWith("video/");
      getAssetUrl(shader.input_path)
        .then((url) => {
          if (!url || !isInputApplyCurrent(generation)) return;
          const paint = isVideo
            ? { type: "video", video: { url, scaleMode: "fill" } }
            : { type: "image", image: { url, scaleMode: "fill" } };
          syncEffectFillFromCanvasInput(paint);
          if (!isVideo) setImagePreviewUrl(url);
        })
        .catch(() => {});
      try {
        const blob = await downloadAsset(shader.input_path);
        await applyMediaBlob(
          blob,
          shader.input_mime_type || blob.type,
          generation
        );
      } finally {
        if (isInputApplyCurrent(generation)) setUploading(false);
      }
    },
    [
      applyMediaBlob,
      applyPaintFill,
      clearObjectUrl,
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
    rememberLiveShaderSource({
      key: session.presetId,
      id: session.presetId,
      name: session.shaderName,
      kind: session.kind,
      source: session.source,
      is_public: session.isPublic,
    });
    if (!isDraftId(session.presetId)) return;
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === session.presetId
          ? {
              ...draft,
              name: session.shaderName,
              source: session.source,
              kind: session.kind,
              values: session.values,
              composition:
                session.kind === "effect"
                  ? { effectFill: effectFillRef.current }
                  : session.composition,
              effectFill: effectFillRef.current,
              isPublic: session.isPublic,
              pendingMedia: session.pendingMedia,
            }
          : draft
      )
    );
  }, [rememberLiveShaderSource]);

  useEffect(() => {
    if (sessionKind === COMPOSITION_KIND) return;
    rememberLiveShaderSource({
      key: presetId,
      id: currentShader?.id || presetId,
      name: shaderName,
      kind: sessionKind,
      source,
      is_public: isPublic,
    });
  }, [
    currentShader?.id,
    isPublic,
    presetId,
    rememberLiveShaderSource,
    sessionKind,
    shaderName,
    source,
  ]);

  const activateShaderSession = useShaderSession({
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
    effectPaintRef: effectFillRef,
    effectFillStoreRef: effectFillByPresetRef,
    sessionRef: draftSessionRef,
    setEffectFill,
    inputApplyGenRef,
    sessionInputAppliedRef,
  });

  const openDraft = useCallback(
    async (draft) => {
      setShaderRoute(draft.id, draft.kind);
      if (draftSessionRef.current.presetId === draft.id) return;
      await activateShaderSession({
        sessionId: draft.id,
        name: draft.name,
        source: draft.source,
        kind: draft.kind,
        composition: draft.composition,
        values: draft.values || {},
        public: draft.isPublic,
        media: draft.pendingMedia || null,
        dirty: true,
      });
    },
    [activateShaderSession, setShaderRoute],
  );

  const createDraft = useCallback(
    async (starterId) => {
      persistActiveDraft();
      const preset = getPreset(starterId);
      const id = `draft:${crypto.randomUUID()}`;
      const draft = {
        id,
        name: preset.name,
        kind: preset.kind,
        source: preset.source,
        values: {},
        isPublic: false,
        pendingMedia: null,
      };
      if (user) {
        const saved = await createShader({
          id: cloudIdForDraft(id),
          owner_id: user.id,
          name: draft.name,
          source: draft.source,
          kind: draft.kind,
          parameter_values: {},
          features: inferFeatures(draft.source),
          is_public: false,
        });
        setCloudShaders((current) => [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
        await activateShaderSession({
          sessionId: cloudChoiceId(saved.id),
          routeId: saved.id,
          name: saved.name,
          source: saved.source,
          kind: saved.kind,
          values: saved.parameter_values || {},
          dirty: true,
          cloudShader: saved,
        });
        return;
      }
      setDrafts((current) => [draft, ...current]);
      await activateShaderSession({
        sessionId: id,
        name: draft.name,
        source: draft.source,
        kind: draft.kind,
        dirty: true,
      });
    },
    [activateShaderSession, persistActiveDraft, user],
  );

  const createCompositionDraft = useCallback(async () => {
    persistActiveDraft();
    const graph = emptyComposition();
    const id = `draft:${crypto.randomUUID()}`;
    const draft = {
      id,
      name: "New Composer",
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
        source: "",
        kind: COMPOSITION_KIND,
        composition: graph,
        dirty: true,
      });
    };
    try {
      if (user) {
        try {
          const saved = await createShader({
            id: cloudIdForDraft(id),
            owner_id: user.id,
            name: draft.name,
            source: "",
            kind: COMPOSITION_KIND,
            parameter_values: {},
            features: { isAnimated: false, usesMouse: false },
            composition: graph,
            is_public: false,
          });
          setCloudShaders((current) => [
            saved,
            ...current.filter((item) => item.id !== saved.id),
          ]);
          await activateShaderSession({
            sessionId: cloudChoiceId(saved.id),
            routeId: saved.id,
            name: saved.name,
            source: "",
            kind: COMPOSITION_KIND,
            composition: saved.composition || graph,
            values: {},
            dirty: true,
            cloudShader: saved,
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
      setError(message);
      showNotice(message, { error: true });
    }
  }, [activateShaderSession, persistActiveDraft, showNotice, user]);

  const openFigmaShader = useCallback(
    async (kind, id) => {
      const detail = await getFigmaShader(kind, id);
      const sourceText = detail.mainTs;
      const name = detail.name || "Figma Shader";
      const shaderKind = detail.kind === "fill" ? "fill" : "effect";
      const link = {
        figma_shader_id: detail.id,
        figma_shader_kind: shaderKind,
        figma_shader_version: detail.version || null,
      };

      persistActiveDraft();
      pendingValuesRef.current = {};
      hostRef.current?.stop();
      setRunning(playPreferenceRef.current);
      setError(null);
      setIsPublic(false);
      setPendingMedia(null);
      setDirty(true);
      setShaderName(name);
      setSource(sourceText);
      setSessionKind(shaderKind);
      setComposition(null);

      if (user) {
        const existing = cloudShaders.find(
          (item) =>
            item.owner_id === user.id &&
            item.figma_shader_id === detail.id &&
            item.figma_shader_kind === shaderKind
        );
        let saved;
        if (existing) {
          const current = existing.source
            ? existing
            : { ...existing, ...(await getShader(existing.id)) };
          saved = await shaderSaveQueue.enqueue(existing.id, async () => {
            const result = await withExclusiveShaderSave(existing.id, async () => {
              await saveShaderState({
                shaderId: existing.id,
                expectedStateRevision: current.state_revision,
                source: sourceText,
                kind: shaderKind,
                parameterValues: {},
                features: inferFeatures(sourceText),
                checkpointKind: "manual",
                summary: `Imported ${name} from Figma`,
              });
              return updateShader(existing.id, {
                name,
                ...link,
              });
            });
            return result.value;
          });
        } else {
          saved = await createShader({
            owner_id: user.id,
            name,
            source: sourceText,
            kind: shaderKind,
            parameter_values: {},
            features: inferFeatures(sourceText),
            is_public: false,
            ...link,
          });
        }
        setCloudShaders((current) => [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
        await activateShaderSession({
          sessionId: cloudChoiceId(saved.id),
          routeId: saved.id,
          name: saved.name,
          source: saved.source,
          kind: saved.kind,
          values: saved.parameter_values || {},
          cloudShader: saved,
          dirty: true,
          persistPrevious: false,
        });
        return;
      }

      const draftId = `draft:${crypto.randomUUID()}`;
      const draft = {
        id: draftId,
        name,
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
        source: sourceText,
        kind: shaderKind,
        dirty: true,
        persistPrevious: false,
      });
    },
    [
      activateShaderSession,
      cloudShaders,
      persistActiveDraft,
      user,
    ]
  );

  const openCloudShader = useCallback(
    async (shader) => {
      if (draftSessionRef.current.presetId === cloudChoiceId(shader.id)) {
        setShaderRoute(shader.id, shader.kind);
        return;
      }
      // Resolve source before flipping into the editor so host init / compile
      // never race a placeholder module from the previous session.
      const fullShader = shader.source
        ? shader
        : { ...shader, ...(await getShader(shader.id)) };
      lastSavedFingerprintRef.current = shaderContentFingerprint({
        name: fullShader.name,
        source: fullShader.source,
        parameterValues: fullShader.parameter_values,
        features: fullShader.features || inferFeatures(fullShader.source || ""),
        composition: fullShader.composition,
      });
      try {
        await activateShaderSession({
          sessionId: cloudChoiceId(fullShader.id),
          routeId: fullShader.id,
          name: fullShader.name,
          source: fullShader.source || "",
          kind: fullShader.kind,
          composition: fullShader.composition,
          values: fullShader.parameter_values || {},
          public: fullShader.is_public,
          cloudShader: fullShader,
        });
      } catch (mediaError) {
        setError(mediaError.message || String(mediaError));
      }
    },
    [activateShaderSession, setShaderRoute],
  );

  const cloudThumbnailPathsRef = useRef({});
  const userId = user?.id ?? null;

  const refreshLibrary = useCallback(async () => {
    if (!authConfigured) {
      cloudThumbnailPathsRef.current = {};
      setCloudShaders([]);
      setCloudThumbnails({});
      return;
    }
    try {
      // Row-level security returns public shaders to everyone and adds the
      // current user's private drafts when signed in.
      const shaders = await listShaders();
      setCloudShaders(shaders);
      const urlsByPath = await getAssetUrls(
        shaders.map((shader) => shader.thumbnail_path)
      );
      setCloudThumbnails((previous) => {
        const nextPathById = {};
        const next = {};
        let changed =
          Object.keys(previous).length !== shaders.length;
        for (const shader of shaders) {
          const path = shader.thumbnail_path || null;
          nextPathById[shader.id] = path;
          // Keep the prior signed URL when the asset path is unchanged so a
          // routine library refresh (e.g. tab focus / auth churn) does not
          // force every thumbnail <img> to reload.
          if (
            path &&
            cloudThumbnailPathsRef.current[shader.id] === path &&
            previous[shader.id]
          ) {
            next[shader.id] = previous[shader.id];
            continue;
          }
          const url = path ? urlsByPath[path] || null : null;
          next[shader.id] = url;
          if (url !== previous[shader.id]) changed = true;
        }
        for (const id of Object.keys(previous)) {
          if (!(id in next)) changed = true;
        }
        cloudThumbnailPathsRef.current = nextPathById;
        return changed ? next : previous;
      });
    } catch (libraryError) {
      const message = formatSupabaseError(
        libraryError,
        "Could not load shaders from the server."
      );
      setError(message);
      showNotice(message, { error: true });
    }
  }, [authConfigured, showNotice, userId]);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    if (!user) {
      migratedUserRef.current = null;
      return;
    }
    if (
      authLoading ||
      migratedUserRef.current === user.id ||
      drafts.length === 0
    ) {
      return;
    }
    migratedUserRef.current = user.id;
    let cancelled = false;

    const migrate = async () => {
      const remaining = [];
      const migrated = [];
      let activeMigration = null;
      let lastError = null;
      const activeRouteId = getShaderRouteId();

      for (const draft of drafts) {
        const editorActive = draft.id === draftSessionRef.current.presetId;
        const active =
          editorActive || draft.id === activeRouteId;
        const session = editorActive ? draftSessionRef.current : draft;
        try {
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
            ? normalizeComposition(session.composition || draft.composition)
            : {};
          const payload = {
            id: cloudId,
            owner_id: user.id,
            name: session.shaderName || draft.name || "Untitled Shader",
            source,
            kind: isComposition ? COMPOSITION_KIND : detectKind(source),
            parameter_values: isComposition
              ? {}
              : session.values || draft.values || {},
            features: isComposition
              ? { isAnimated: false, usesMouse: false }
              : inferFeatures(source),
            composition: graph,
            is_public: false,
            ...figmaShaderLink(editorActive ? session : draft),
          };
          const existing = await getShaderMaybe(cloudId);
          let saved;
          if (existing) {
            saved = await shaderSaveQueue.enqueue(existing.id, async () => {
              const result = await withExclusiveShaderSave(existing.id, async () => {
                await saveShaderState({
                  shaderId: existing.id,
                  expectedStateRevision: existing.state_revision,
                  source: payload.source,
                  kind: payload.kind,
                  parameterValues: payload.parameter_values,
                  features: payload.features,
                  composition: payload.composition,
                  checkpointKind: "manual",
                  summary: "Migrated local draft",
                });
                return updateShader(existing.id, {
                  name: payload.name,
                  ...figmaShaderLink(editorActive ? session : draft),
                });
              });
              return result.value;
            });
          } else {
            saved = await createShader(payload);
          }
          await migrateLocalPlanToCloud(
            `preset:${draft.id}`,
            user.id,
            saved.id
          );

          const assetChanges = {};
          const media = active ? session.pendingMedia : draft.pendingMedia;
          if (media) {
            assetChanges.input_path = await uploadAsset({
              ownerId: user.id,
              shaderId: saved.id,
              role: "input",
              blob: media,
              fileName: media.name,
              contentType: mediaType(media),
            });
            assetChanges.input_name = media.name;
            assetChanges.input_mime_type = mediaType(media);
          }

          const thumbnailData =
            thumbnailDataUrlsRef.current[draft.id] || draft.thumbnail;
          if (thumbnailData?.startsWith("data:image/")) {
            const thumbnailBlob = await fetch(thumbnailData).then((response) =>
              response.blob()
            );
            assetChanges.thumbnail_path = await uploadAsset({
              ownerId: user.id,
              shaderId: saved.id,
              role: "thumbnail",
              blob: thumbnailBlob,
              fileName: "thumbnail.webp",
              contentType: thumbnailBlob.type || "image/webp",
            });
          }

          if (Object.keys(assetChanges).length) {
            saved = await updateShader(saved.id, assetChanges);
          }
          migrated.push(saved);
          if (active) activeMigration = saved;
          delete thumbnailDataUrlsRef.current[draft.id];
        } catch (migrationError) {
          remaining.push(draft);
          lastError = migrationError;
        }
      }

      if (cancelled) return;
      setDrafts(remaining);
      writeDrafts(remaining, thumbnailDataUrlsRef.current);
      if (remaining.length === 0) {
        localStorage.removeItem(ACTIVE_DRAFT_STORAGE_KEY);
      }
      setThumbnails((current) => {
        const next = { ...current };
        for (const draft of drafts) {
          if (remaining.some((item) => item.id === draft.id)) continue;
          revokeThumbnailUrl(next[draft.id]);
          delete next[draft.id];
        }
        return next;
      });
      setCloudShaders((current) => [
        ...migrated,
        ...current.filter(
          (item) => !migrated.some((saved) => saved.id === item.id)
        ),
      ]);

      if (activeMigration) {
        pendingValuesRef.current = activeMigration.parameter_values || {};
        setCurrentShader(activeMigration);
        setPresetId(cloudChoiceId(activeMigration.id));
        setShaderRoute(activeMigration.id, activeMigration.kind);
        setShaderName(activeMigration.name);
        setSource(activeMigration.source);
        setIsPublic(false);
        setPendingMedia(null);
        setDirty(false);
      }
      if (lastError) {
        setError(
          `Some drafts could not sync: ${
            lastError.message || String(lastError)
          }`
        );
      }
      await refreshLibrary();
    };

    migrate().catch((migrationError) =>
      setError(migrationError.message || String(migrationError))
    );
    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    drafts,
    refreshLibrary,
    setShaderRoute,
    user,
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
      choosePreset("dither", { syncUrl: Boolean(routeId) }).catch(
        (presetError) => setError(presetError.message || String(presetError))
      );
    },
    [choosePreset, routeId]
  );

  const removeDraft = useCallback(
    (draft) => {
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
            setError(draftError.message || String(draftError))
          );
        } else {
          setError("This draft is missing or was deleted.");
          setShaderRoute();
        }
        return;
      }
      if (getPreset(id).id === id) {
        choosePreset(id).catch((presetError) =>
          setError(presetError.message || String(presetError))
        );
        return;
      }
      const local = cloudShaders.find((item) => item.id === id);
      if (local) {
        openCloudShader(local).catch((cloudError) =>
          setError(cloudError.message || String(cloudError))
        );
        return;
      }
      getShader(id)
        .then(openCloudShader)
        .catch(() =>
          setError("This shader is private, missing, or unavailable.")
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

  useEffect(() => {
    if (!runtimeReady || authLoading || sharedLoadedRef.current) return;
    sharedLoadedRef.current = true;
    const { id, kind: nextKind } = getAppRoute();
    setRouteId(id);
    setRouteKind(nextKind);
    if (id) openRouteId(id);
  }, [authLoading, openRouteId, runtimeReady]);

  useEffect(() => {
    const onPopState = () => {
      const { id, kind: nextKind } = getAppRoute();
      setRouteId(id);
      setRouteKind(nextKind);
      if (id) openRouteId(id);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [openRouteId]);

  const chooseItem = useCallback(
    (id) => {
      if (isDraftId(id)) {
        const draft = drafts.find((item) => item.id === id);
        if (draft) openDraft(draft);
      } else if (id.startsWith("cloud:")) {
        const cloudId = id.slice("cloud:".length);
        const shader = cloudShaders.find((item) => item.id === cloudId);
        if (shader) openCloudShader(shader);
        else openRouteId(cloudId);
      } else {
        choosePreset(id).catch((presetError) =>
          setError(presetError.message || String(presetError))
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
    menu.showAt(shaderContextRequest.x, shaderContextRequest.y);
    setShaderContextRequest(null);
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
      setRouteId(nextRouteId);
      setRouteKind(kind === COMPOSITION_KIND ? COMPOSITION_KIND : null);
      chooseItem(id);
    },
    [chooseItem, cloudShaders, drafts]
  );

  const updateControl = useCallback(
    (name, value) => {
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
    hostRef.current?.setActive(true);
    valuesRef.current = { ...valuesRef.current, [name]: value };
    // Coalesce live preview redraws to one present per frame. Synchronous
    // WebGPU redraws on every pointermove hitch the main thread and cancel
    // native range-slider drags in the properties panel.
    if (previewParamsRafRef.current) return;
    previewParamsRafRef.current = requestAnimationFrame(() => {
      previewParamsRafRef.current = 0;
      const next = valuesRef.current;
      if (usesCompositionHost(sessionKindRef.current, effectFillRef.current)) {
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
    });
  }, []);

  const resetProperties = useCallback(() => {
    if (sessionKindRef.current === COMPOSITION_KIND) {
      const graph = normalizeComposition(compositionRef.current);
      const layerId = selectedLayerIdRef.current;
      const source = resolveReferencedShaderSource(
        compositionLayerShaderId(graph, layerId),
        {
          session: draftSessionRef.current,
          drafts,
          liveByKey: liveShaderSourceRef.current,
          resolvedByKey: new Map(Object.entries(resolvedShaders)),
        }
      );
      if (!source) return;
      try {
        const loaded = loadModule(source);
        const next = buildDefaults(loaded.props);
        const nextGraph = compositionWithLayerValues(graph, layerId, next);
        compositionRef.current = nextGraph;
        setComposition(nextGraph);
        setProps(loaded.props);
        setRuntimeValues(next);
        setLayerControlsEpoch((epoch) => epoch + 1);
        setError(null);
        if (!protectedPreview) setDirty(true);
        compileCompositionRef.current?.(nextGraph);
      } catch (resetError) {
        setError(resetError.message || String(resetError));
      }
      return;
    }
    const next = buildDefaults(props);
    setRuntimeValues(next);
    setError(null);
    if (!protectedPreview) setDirty(true);
  }, [
    drafts,
    props,
    protectedPreview,
    resolvedShaders,
    setRuntimeValues,
  ]);

  const savePropertiesAsDefault = useCallback(() => {
    if (protectedPreview) return;
    const currentValues = valuesRef.current;
    try {
      const nextSource = applyDefaultValuesToSource(
        sourceRef.current,
        currentValues
      );
      if (nextSource === sourceRef.current) return;
      setSource(nextSource);
      setDirty(true);
      setProps((current) => applyDefaultValuesToProps(current, currentValues));
      setError(null);
    } catch (saveError) {
      setError(saveError.message || String(saveError));
    }
  }, [protectedPreview]);

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

  const togglePlay = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const next = !running;
    playPreferenceRef.current = next;
    localStorage.setItem(PLAY_STORAGE_KEY, String(next));
    if (next) {
      host.setActive(true);
      host.start();
    } else {
      host.stop({ resetTime: true });
    }
    setRunning(next);
  }, [running]);

  const pickFile = useCallback(
    async (file) => {
      if (file.size > MAX_MEDIA_BYTES) {
        throw new Error("Input media must be 25 MB or smaller.");
      }
      const mimeType = mediaType(file);
      if (!mimeType) {
        throw new Error("Choose a supported image, SVG, or video file.");
      }
      const generation = ++inputApplyGenRef.current;
      setUploading(true);
      try {
        const applied = await applyMediaBlob(file, mimeType, generation);
        if (!applied) return;
        setPendingMedia(file);
        if (sessionKindRef.current === COMPOSITION_KIND && !protectedPreview) {
          const fillType = fillTypeForDroppedMedia(mimeType);
          if (fillType) {
            const graph = normalizeComposition({
              ...compositionRef.current,
              fill: { type: fillType, shaderId: null, values: {} },
            });
            compositionRef.current = graph;
            setComposition(graph);
          }
        }
        if (!protectedPreview) setDirty(true);
      } finally {
        if (isInputApplyCurrent(generation)) setUploading(false);
      }
    },
    [applyMediaBlob, isInputApplyCurrent, protectedPreview]
  );

  const onFileInput = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (file) {
        pickFile(file).catch((fileError) =>
          setError(fileError.message || String(fileError))
        );
      }
      event.target.value = "";
    },
    [pickFile]
  );

  const onSourceChange = useCallback(
    (nextSource) => {
      if (protectedPreview) return;
      setSource(nextSource);
      setDirty(true);
    },
    [protectedPreview]
  );
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const onPreviewFile = useCallback(
    (file) =>
      pickFile(file).catch((dropError) => {
        setError(dropError.message || String(dropError));
      }),
    [pickFile]
  );

  const exportFiles = useCallback(() => {
    exportFigmaFiles(sourceRef.current, shaderName || "Shader");
  }, [shaderName]);

  const downloadPreviewImage = useCallback(async () => {
    const host = hostRef.current;
    const canvas = host?.canvas;
    if (!host?.ready || !canvas?.width || !canvas?.height) {
      setError("Preview image is not ready to download.");
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
      setError(
        captureError?.message || "Could not capture the preview image."
      );
      return;
    }
    if (!blob) {
      setError("Could not capture the preview image.");
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

  const exportPreviewVideo = useCallback(async () => {
    const host = hostRef.current;
    const canvas = host?.canvas;
    if (!host?.ready || !canvas?.width || !canvas?.height) {
      setError("Preview video is not ready to export.");
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
      const compositionExport =
        kind === COMPOSITION_KIND
          ? serializeCompositionExport(
              composition,
              resolvedByKey,
              liveShaderSourceRef.current
            )
          : null;
      const needsMediaInput =
        kind === "effect" ||
        (kind === COMPOSITION_KIND && !compositionExport?.isFill);
      const inputVideo = needsMediaInput ? host.video : null;
      const inputBitmap =
        needsMediaInput && !inputVideo
          ? await host.captureInputBitmap({ width, height })
          : null;
      if (needsMediaInput && !inputBitmap && !inputVideo) {
        throw new Error("Could not snapshot the current shader input.");
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
      setError(videoError.message || String(videoError));
    } finally {
      setVideoExportProgress(null);
    }
  }, [
    composition,
    kind,
    resolvedByKey,
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
      const checkpointKind =
        options.checkpointKind ||
        (!background ? (makePublic ? "publish" : "manual") : null);
      const publicFlag = makePrivate ? false : makePublic || isPublic;
      const saveTargetId = presetId;
      const saveSource =
        typeof options.sourceOverride === "string"
          ? options.sourceOverride
          : sourceRef.current;
      const saveValues = options.valuesOverride || valuesRef.current;
      const noticeMessage =
        "notice" in options ? options.notice : "Shader saved";
      const saveSnapshot = {
        name: shaderName.trim() || "Untitled Shader",
        source: saveSource,
        values: JSON.stringify(saveValues),
        isPublic: publicFlag,
        pendingMedia,
      };
      const shaderId =
        isOwner && currentShader?.id ? currentShader.id : null;
      if (
        shaderId &&
        background &&
        !checkpointKind &&
        (shaderSaveQueue.isBusyAny() || pendingMedia)
      ) {
        return currentShader ?? null;
      }

      const runSave = async () => {
      if (!background) setSaving(true);
      setError(null);
      try {
        const draftLink = isDraftId(presetId)
          ? drafts.find((item) => item.id === presetId)
          : null;
        const isComposition = sessionKindRef.current === COMPOSITION_KIND;
        const graph = isComposition
          ? promoteCompositionRefs(
              compositionWithLayerValues(
                compositionRef.current,
                selectedLayerIdRef.current,
                valuesRef.current
              ),
              cloudShaders
            )
          : {};
        if (
          isComposition &&
          referencedShaderKeys(graph).join() !==
            referencedShaderKeys(compositionRef.current).join()
        ) {
          compositionRef.current = graph;
          setComposition(graph);
        }
        if (makePublic && isComposition) {
          let unpublished = unpublishedCompositionRefs(
            graph,
            new Map(Object.entries(resolvedShaders)),
            cloudShaders
          );
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
            unpublished = unpublishedCompositionRefs(
              graph,
              new Map(Object.entries(resolvedShaders)),
              [...cloudShaders, ...fresh]
            );
          }
          if (unpublished.length) {
            const names = unpublishedCompositionLabels(
              unpublished,
              new Map(Object.entries(resolvedShaders)),
              [...cloudShaders, ...fresh]
            );
            throw new Error(
              `Publish every referenced fill and effect before publishing this composition (${names.join(", ")}).`
            );
          }
        }
        const payload = {
          owner_id: user.id,
          name: shaderName.trim() || "Untitled Shader",
          source: isComposition ? "" : saveSource,
          kind: isComposition ? COMPOSITION_KIND : detectKind(saveSource),
          parameter_values: isComposition ? {} : saveValues,
          features: isComposition
            ? collectCompositionFeatures(
                graph,
                new Map(Object.entries(resolvedShaders))
              )
            : inferFeatures(saveSource),
          composition: isComposition
            ? graph
            : sessionKindRef.current === "effect"
              ? { effectFill: persistableEffectFill(effectFillRef.current) }
              : {},
          is_public: publicFlag,
          ...figmaShaderLink(currentShader || draftLink),
        };
        // Background draft autosaves must never race an explicit publish or
        // unpublish action. Visibility changes are only persisted by Save or
        // Publish.
        if (background && isOwner && currentShader) {
          delete payload.is_public;
        }

        const contentFingerprint = shaderContentFingerprint({
          name: payload.name,
          source: payload.source,
          parameterValues: payload.parameter_values,
          features: payload.features,
          composition: payload.composition,
        });
        // Skip no-op background autosaves (same content as last successful
        // write, including when setCurrentShader restarts the debounce timer).
        // Never skip when a version checkpoint is requested.
        if (
          background &&
          isOwner &&
          currentShader &&
          !pendingMedia &&
          !checkpointKind &&
          contentFingerprint === lastSavedFingerprintRef.current
        ) {
          if (draftSessionRef.current.presetId === saveTargetId) {
            setDirty(false);
          }
          return currentShader;
        }

        let saved;
        if (isOwner && currentShader) {
          let checkpointSummary = options.checkpointSummary || null;
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
            expectedStateRevision: currentShader.state_revision,
            source: payload.source,
            kind: payload.kind,
            parameterValues: payload.parameter_values,
            features: payload.features,
            composition: payload.composition,
            checkpointKind,
            summary: checkpointSummary,
          });
          const metadataPayload = {
            name: payload.name,
            ...figmaShaderLink(currentShader || draftLink),
          };
          if (!background) metadataPayload.is_public = publicFlag;
          saved = await updateShader(currentShader.id, metadataPayload);
        } else {
          saved = await createShader(payload);
        }
        const planLocalKey = currentShader?.id
          ? `cloud:${currentShader.id}`
          : `preset:${saveTargetId}`;
        await migrateLocalPlanToCloud(planLocalKey, user.id, saved.id);

        const assetChanges = {};
        let mediaToUpload = background ? null : pendingMedia;
        if (!mediaToUpload && !background && sessionKindRef.current === "effect") {
          const paint = effectFillRef.current?.paint;
          const url = paint?.image?.url || paint?.video?.url || "";
          mediaToUpload = await fileFromBlobUrl(url);
        }
        if (mediaToUpload) {
          const oldPath = isOwner ? currentShader?.input_path : null;
          const inputMimeType = mediaType(mediaToUpload);
          const inputPath = await uploadAsset({
            ownerId: user.id,
            shaderId: saved.id,
            role: "input",
            blob: mediaToUpload,
            fileName: mediaToUpload.name,
            contentType: inputMimeType,
          });
          if (oldPath && oldPath !== inputPath) await removeAssets([oldPath]);
          assetChanges.input_path = inputPath;
          assetChanges.input_name = mediaToUpload.name;
          assetChanges.input_mime_type = inputMimeType;
        }

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
          if (thumbnailBlob) {
            assetChanges.thumbnail_path = await uploadAsset({
              ownerId: user.id,
              shaderId: saved.id,
              role: "thumbnail",
              blob: thumbnailBlob,
              fileName: "thumbnail.webp",
              contentType: thumbnailBlob.type || "image/webp",
            });
          }
        }

        if (Object.keys(assetChanges).length) {
          saved = await updateShader(saved.id, assetChanges);
        }

        // A save for the previously open shader may finish after navigation.
        // Let that row finish safely, but never replace the active editor state.
        if (draftSessionRef.current.presetId !== saveTargetId) {
          return saved;
        }

        if (makePublic) setIsPublic(true);
        else if (makePrivate) setIsPublic(false);
        setCurrentShader(saved);
        setPresetId(cloudChoiceId(saved.id));
        setShaderRoute(saved.id, saved.kind);
        lastSavedFingerprintRef.current = contentFingerprint;
        const latest = draftSessionRef.current;
        const unchanged =
          (latest.shaderName.trim() || "Untitled Shader") ===
            saveSnapshot.name &&
          latest.source === saveSnapshot.source &&
          JSON.stringify(latest.values) === saveSnapshot.values &&
          Boolean(latest.isPublic) === saveSnapshot.isPublic &&
          latest.pendingMedia === saveSnapshot.pendingMedia;
        if (mediaToUpload || !background || unchanged) {
          setPendingMedia(null);
        }
        if (!background || unchanged) {
          setDirty(false);
        }
        if (isDraftId(presetId)) {
          setDrafts((current) =>
            current.filter((item) => item.id !== presetId)
          );
          setThumbnails((current) => {
            if (!(presetId in current)) return current;
            revokeThumbnailUrl(current[presetId]);
            const next = { ...current };
            delete next[presetId];
            return next;
          });
          delete thumbnailDataUrlsRef.current[presetId];
        }
        setCloudShaders((current) => [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
        if (checkpointKind || !currentShader) {
          const versions = await listAllShaderVersions(saved.id);
          setShaderVersions(versions);
        }
        if (saved.thumbnail_path) {
          const url = await getAssetUrl(saved.thumbnail_path);
          setCloudThumbnails((current) => ({ ...current, [saved.id]: url }));
        }
        if (noticeMessage) showNotice(noticeMessage);
        cloudWriteBackoffUntilRef.current = 0;
        return saved;
      } catch (saveError) {
        if (isTransientCloudWriteError(saveError)) {
          cloudWriteBackoffUntilRef.current = Date.now() + CLOUD_WRITE_BACKOFF_MS;
        }
        const saveStillActive =
          draftSessionRef.current.presetId === saveTargetId;
        if (isShaderStateConflict(saveError) && currentShader?.id) {
          try {
            const latest = await getShader(currentShader.id);
            setCloudShaders((current) => [
              latest,
              ...current.filter((item) => item.id !== latest.id),
            ]);
            if (saveStillActive) {
              setCurrentShader(latest);
              await refreshShaderVersions();
            }
          } catch {
            // Preserve the local editor buffer even if conflict refresh fails.
          }
          showNotice(
            "This shader changed in another tab. Your local edits are still here; review and save again.",
            { error: true }
          );
        }
        if (saveStillActive) {
          setError(formatSupabaseError(saveError, "Could not save shader."));
        }
        throw saveError;
      } finally {
        if (!background) setSaving(false);
      }
      };

      if (shaderId) {
        return shaderSaveQueue.enqueue(shaderId, async () => {
          const result = await withExclusiveShaderSave(shaderId, runSave, {
            ifAvailable: background && !checkpointKind,
          });
          return result.skipped ? currentShader ?? null : result.value;
        });
      }
      return runSave();
    },
    [
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
      shaderName,
      shaderVersions,
      showNotice,
      thumbnails,
      user,
    ]
  );

  const checkpointAgentVersion = useCallback(
    ({ source: appliedSource, summary }) => {
      if (!isOwner || !currentShader?.id || !appliedSource) return;
      const checkpoint = {
        presetId,
        shaderId: currentShader.id,
        source: appliedSource,
        summary: summarizeAgentVersion(summary),
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
    if (
      pendingAgentCheckpoint &&
      (draftSessionRef.current.presetId !== pendingAgentCheckpoint.presetId ||
        currentShader?.id !== pendingAgentCheckpoint.shaderId ||
        sourceRef.current !== pendingAgentCheckpoint.source)
    ) {
      setPendingAgentCheckpoint(null);
      return;
    }
    if (
      !pendingAgentCheckpoint ||
      agentCheckpointSavingRef.current ||
      saving ||
      !isOwner ||
      !currentShader?.id ||
      currentShader.id !== pendingAgentCheckpoint.shaderId ||
      sourceRef.current !== pendingAgentCheckpoint.source
    ) {
      return;
    }
    agentCheckpointSavingRef.current = true;
    const checkpoint = pendingAgentCheckpoint;
    saveShader({
      background: true,
      checkpointKind: "agent",
      checkpointSummary: checkpoint.summary,
      sourceOverride: checkpoint.source,
      valuesOverride: checkpoint.values,
      notice: null,
    })
      .then(() => {
        setPendingAgentCheckpoint((current) =>
          current === checkpoint ? null : current
        );
      })
      .catch(() => {
        // saveShader preserves the local source and surfaces the error.
      })
      .finally(() => {
        agentCheckpointSavingRef.current = false;
      });
  }, [currentShader?.id, isOwner, pendingAgentCheckpoint, saveShader, saving]);

  useEffect(() => {
    if (
      pendingAgentCheckpointRef.current &&
      pendingAgentCheckpointRef.current.presetId !== presetId
    ) {
      pendingAgentCheckpointRef.current = null;
    }
  }, [presetId]);

  useEffect(() => {
    versionPreviewCacheRef.current.clear();
    versionPreviewStateRef.current = null;
    versionPreviewAppliedRef.current = false;
    versionPreviewSnapshotRef.current = null;
    versionPreviewRequestRef.current += 1;
  }, [currentShader?.id]);

  const clearShaderVersionPreview = useCallback(() => {
    const snapshot = versionPreviewSnapshotRef.current;
    const shouldRestore = versionPreviewAppliedRef.current && snapshot;
    versionPreviewStateRef.current = null;
    versionPreviewAppliedRef.current = false;
    versionPreviewSnapshotRef.current = null;
    versionPreviewRequestRef.current += 1;
    if (!shouldRestore) return;
    setProps(snapshot.props);
    setRuntimeValues(snapshot.values);
    compile(snapshot.source);
  }, [compile, setRuntimeValues]);

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

      try {
        let target = versionPreviewCacheRef.current.get(versionId);
        if (!target) {
          target = await getShaderVersion(currentShader.id, versionId);
          versionPreviewCacheRef.current.set(versionId, target);
        }
        if (requestId !== versionPreviewRequestRef.current) return;

        const host = hostRef.current;
        if (!host?.ready) return;

        if (target.kind === COMPOSITION_KIND) {
          if (!versionPreviewSnapshotRef.current) {
            versionPreviewSnapshotRef.current = {
              source: sourceRef.current,
              props: structuredClone(propsRef.current),
              values: structuredClone(valuesRef.current),
              composition: compositionRef.current,
            };
          }
          compileGenerationRef.current += 1;
          versionPreviewStateRef.current = { versionId };
          versionPreviewAppliedRef.current = true;
          setComposition(normalizeComposition(target.composition));
          await compileComposition(target.composition);
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
        const nextFeatures = inferFeatures(target.source);
        const ok = await host.setModule(
          { setup: loaded.setup, render: loaded.render },
          {
            isFill: detectKind(target.source) === "fill",
            isAnimated: nextFeatures.isAnimated,
            usesMouse: nextFeatures.usesMouse,
            supportsRenderScale: supportsRenderScale(target.source),
          }
        );
        if (requestId !== versionPreviewRequestRef.current || !ok) return;

        compileGenerationRef.current += 1;
        versionPreviewStateRef.current = { versionId };
        versionPreviewAppliedRef.current = true;
        if (!versionPreviewSnapshotRef.current) {
          versionPreviewSnapshotRef.current = {
            source: sourceRef.current,
            props: structuredClone(propsRef.current),
            values: structuredClone(valuesRef.current),
          };
        }
        setProps(loaded.props);
        setRuntimeValues(nextValues);
        host.setParams(nextValues);
        host.setActive(true);
        if (playPreferenceRef.current && nextFeatures.isAnimated) {
          host.start();
        } else {
          host.redraw();
        }
      } catch {
        // Ignore preview failures while browsing version history.
      }
    },
    [
      clearShaderVersionPreview,
      currentShader,
      dirty,
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
      const restoreShaderId = currentShader.id;
      const restorePresetId = cloudChoiceId(restoreShaderId);
      setRestoringVersion(true);
      setError(null);
      try {
        const target = await getShaderVersion(restoreShaderId, versionId);
        const validation = validateModuleSource(target.source);
        if (!validation.ok) {
          throw new Error(
            `Version ${target.version_number} cannot be restored: ${validation.reason}`
          );
        }

        let expectedShader = currentShader;
        if (dirty) {
          expectedShader =
            (await saveShader({
              checkpointKind: "manual",
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
                expectedStateRevision: expectedShader.state_revision,
              })
            );
            return result.value;
          }
        );
        setCloudShaders((current) => [
          restored,
          ...current.filter((item) => item.id !== restored.id),
        ]);
        if (draftSessionRef.current.presetId === restorePresetId) {
          pendingValuesRef.current = restored.parameter_values || {};
          setCurrentShader(restored);
          setSource(restored.source || "");
          setSessionKind(restored.kind);
          setComposition(
            restored.kind === COMPOSITION_KIND
              ? normalizeComposition(restored.composition)
              : null
          );
          setDirty(false);
          lastSavedFingerprintRef.current = shaderContentFingerprint({
            name: restored.name,
            source: restored.source,
            parameterValues: restored.parameter_values,
            features: restored.features || inferFeatures(restored.source || ""),
            composition: restored.composition,
          });
          const versions = await listAllShaderVersions(restored.id);
          if (draftSessionRef.current.presetId === restorePresetId) {
            setShaderVersions(versions);
          }
          showNotice(`Restored Version ${target.version_number}.`);
        }
      } catch (restoreError) {
        if (isShaderStateConflict(restoreError)) {
          try {
            const latest = await getShader(restoreShaderId);
            if (draftSessionRef.current.presetId === restorePresetId) {
              setCurrentShader(latest);
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
        setError(restoreError.message || String(restoreError));
      } finally {
        setRestoringVersion(false);
      }
    },
    [
      currentShader,
      dirty,
      isOwner,
      refreshShaderVersions,
      restoringVersion,
      saveShader,
      showNotice,
    ]
  );

  useEffect(() => {
    if (!user || !currentShader || !isOwner || !dirty || saving) return;
    if (Boolean(isPublic) !== Boolean(currentShader.is_public)) return;
    const delay = Math.max(
      BACKGROUND_AUTOSAVE_MS,
      cloudWriteBackoffUntilRef.current - Date.now()
    );
    const timer = window.setTimeout(() => {
      saveShader({ background: true, notice: null }).catch(() => {
        // The editor remains dirty so a later edit or explicit Save can retry.
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [currentShader, dirty, isOwner, isPublic, saveShader, saving, user]);

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
      });
    } catch (publishError) {
      setPublishToast(null);
      const message = formatSupabaseError(publishError, "Publish failed.");
      setError(message);
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
      const saved = await saveShader({
        makePrivate: true,
        notice: "Shader unpublished",
      });
      if (!saved) return;
    } catch (unpublishError) {
      const message = formatSupabaseError(unpublishError, "Unpublish failed.");
      setError(message);
      showNotice(message, { error: true });
    }
  }, [isOwner, saveShader, saving, showNotice, user]);

  const duplicateShader = useCallback(async () => {
    if (duplicating) return;
    setDuplicating(true);
    try {
      persistActiveDraft();
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
      const name = `${shaderName} Copy`;
      const isComposition = sessionKindRef.current === COMPOSITION_KIND;
      const graph = isComposition
        ? compositionWithLayerValues(
            compositionRef.current,
            selectedLayerIdRef.current,
            valuesRef.current
          )
        : undefined;
      const draft = {
        id,
        name,
        kind: isComposition
          ? COMPOSITION_KIND
          : detectKind(sourceRef.current),
        source: isComposition ? "" : sourceRef.current,
        values: isComposition ? {} : { ...valuesRef.current },
        composition: graph,
        isPublic: false,
        pendingMedia: mediaFile,
        // A duplicate is a new local shader, not a second writer for the same
        // remote Figma resource. Only the imported original keeps its link.
        ...figmaShaderLink(null),
      };
      if (user) {
        const saved = await createShader({
          id: cloudIdForDraft(id),
          owner_id: user.id,
          name,
          source: draft.source,
          kind: draft.kind,
          parameter_values: draft.values,
          features: isComposition
            ? collectCompositionFeatures(
                graph,
                new Map(Object.entries(resolvedShaders))
              )
            : inferFeatures(draft.source),
          composition: graph || {},
          is_public: false,
          ...figmaShaderLink(null),
        });
        setCurrentShader(saved);
        setPresetId(cloudChoiceId(saved.id));
        setShaderRoute(saved.id, saved.kind);
        setShaderName(name);
        setIsPublic(false);
        setPendingMedia(mediaFile);
        setDirty(true);
        setCloudShaders((current) => [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
        showNotice("Private draft created");
        return;
      }
      setDrafts((current) => [draft, ...current]);
      setCurrentShader(null);
      setPresetId(id);
      setShaderRoute(id, draft.kind);
      setShaderName(name);
      setIsPublic(false);
      setPendingMedia(mediaFile);
      setDirty(true);
      showNotice("Unsaved copy created");
    } catch (duplicateError) {
      setError(duplicateError.message || String(duplicateError));
      showNotice(duplicateError.message || "Could not duplicate shader", {
        error: true,
      });
    } finally {
      setDuplicating(false);
    }
  }, [
    currentShader,
    duplicating,
    pendingMedia,
    persistActiveDraft,
    setShaderRoute,
    shaderName,
    showNotice,
    user,
  ]);

  const removeCloudShader = useCallback(
    async (shader) => {
      if (!user || !shader || shader.owner_id !== user.id) return false;
      try {
        await removeShaderPlan(shader.owner_id, shader.id);
        await removeAssets([shader.input_path, shader.thumbnail_path]);
        await deleteShader(shader.id);
        setCloudShaders((current) =>
          current.filter((item) => item.id !== shader.id)
        );
        selectAfterLibraryDelete(cloudChoiceId(shader.id));
        showNotice("Shader deleted", { danger: true });
        return true;
      } catch (deleteError) {
        setError(deleteError.message || String(deleteError));
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
      showNotice("Shader deleted", { danger: true });
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

  const embedUrl = currentShader
    ? makeShareUrl(currentShader.id, currentShader.kind)
    : window.location.href;
  const iframeEmbedCode = `<iframe src="${embedUrl}" width="800" height="600" style="border: 0;" loading="lazy" allowfullscreen></iframe>`;
  const standaloneEmbedCode = useMemo(() => {
    if (!exportOpen) return "";
    if (kind === COMPOSITION_KIND) {
      return buildStandaloneEmbedCode({
        composition: serializeCompositionExport(
          composition,
          resolvedByKey,
          liveShaderSourceRef.current
        ),
      });
    }
    return buildStandaloneEmbedCode({
      source,
      values,
      kind,
    });
  }, [composition, exportOpen, kind, resolvedByKey, source, values]);
  const embedCode =
    videoExportSettings.embedFormat === "iframe"
      ? iframeEmbedCode
      : standaloneEmbedCode;

  const copyEmbedCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      showNotice("Embed code copied");
    } catch (copyError) {
      setError(copyError.message || String(copyError));
    }
  }, [embedCode, showNotice]);

  const downloadEmbedCode = useCallback(() => {
    const fileName = shaderModuleFileName(presetId, shaderName).replace(
      /\.ts$/,
      ".html"
    );
    const url = URL.createObjectURL(
      new Blob([standaloneEmbedCode], { type: "text/html;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [presetId, shaderName, standaloneEmbedCode]);

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
    if (protectedPreview) return undefined;

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
        liveNames: {
          [presetId]: shaderName,
        },
        user,
      }),
    [
      cloudShaders,
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
          origin: homeOrigin,
          author: homeAuthor,
        }),
      ),
    [homeAuthor, homeKind, homeOrigin, homeQuery, libraryCards]
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
        liveNames: {
          [presetId]: shaderName,
        },
        user,
      }),
    [cloudShaders, drafts, presetId, shaderName, user]
  );

  const onCompositionChange = useCallback(
    (next) => {
      if (protectedPreview) return;
      const graph = normalizeComposition(next);
      compositionRef.current = graph;
      setComposition(graph);
      if (graph.fill.type === "shader") {
        clearObjectUrl();
        hostRef.current?.clearInput();
      }
      setDirty(true);
    },
    [clearObjectUrl, protectedPreview]
  );

  const onCompositionSelectLayer = useCallback((layerId) => {
    selectedLayerIdRef.current = layerId;
    setSelectedLayerId(layerId);
    const graph = normalizeComposition(compositionRef.current);
    const source = resolveReferencedShaderSource(
      compositionLayerShaderId(graph, layerId),
      {
        session: draftSessionRef.current,
        drafts,
        liveByKey: liveShaderSourceRef.current,
        resolvedByKey: new Map(Object.entries(resolvedShaders)),
      }
    );
    if (!source) {
      setProps({});
      valuesRef.current = {};
      setValues({});
      return;
    }
    try {
      const loaded = loadModule(source);
      const values =
        layerId === COMPOSITION_FILL_ID
          ? graph.fill.values
          : graph.effects.find((effect) => effect.id === layerId)?.values;
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
            ? [{ key: `separator:figma:${kind}`, separatorLabel: label }]
            : []),
          ...items.map((shader) => {
            const key = figmaLibraryKey(kind, shader.id);
            return {
              key,
              name: shader.name,
              description: shader.description || "",
              kind,
              id: shader.id,
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
        await openFigmaShader(card.kind, card.id);
      }
      setFigmaImportOpen(false);
    } catch (importError) {
      setFigmaLibraryError(importError.message || String(importError));
    } finally {
      setFigmaImportProgress(null);
    }
  }, [figmaImportCards, figmaImportCheckedKeys, openFigmaShader]);

  const propertiesPanel = (
    <aside
      ref={propertiesPanelRef}
      className="shader-properties-panel"
      aria-label="Properties"
    >
      <fig-header>
        <h3>Properties</h3>
      </fig-header>

      <fig-content class="shader-properties-panel-content" padding="none">
          {isComposerView ? (
            <>
              <CompositionEditor
                key={presetId}
                graph={composition}
                imageUrl={inputImageUrl}
                resolvedByKey={resolvedByKey}
                fillCards={compositionFillCards}
                effectCards={compositionEffectCards}
                nameCards={compositionNameCards}
                readOnly={protectedPreview}
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
                onOpenShader={openHomeChoice}
                onResetLayer={resetProperties}
                onExport={() => openExportDialog(exportTab)}
                exportDisabled={Boolean(videoExportProgress)}
                onFill={applyPaintFill}
                onFillValuesPreview={(nextValues) => {
                  hostRef.current?.setActive(true);
                  hostRef.current?.setCompositionLayerParams?.(
                    COMPOSITION_FILL_ID,
                    nextValues
                  );
                  if (selectedLayerIdRef.current === COMPOSITION_FILL_ID) {
                    valuesRef.current = nextValues;
                  }
                }}
              />
              {user && !protectedPreview && (
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
                graph={{ fill: effectFill, effects: [] }}
                imageUrl={inputImageUrl}
                resolvedByKey={resolvedByKey}
                fillCards={compositionFillCards}
                nameCards={compositionNameCards}
                readOnly={protectedPreview}
                onChange={(next) => {
                  const fill = normalizeComposition(next).fill;
                  const previousKey = effectFillPreviewKey(
                    effectFillRef.current
                  );
                  setEffectFill(fill);
                  effectFillRef.current = fill;
                  setDirty(true);
                  if (fill.type === "shader") {
                    clearObjectUrl();
                    hostRef.current?.clearInput();
                  }
                  if (previousKey || effectFillPreviewKey(fill)) {
                    compile(source);
                  }
                }}
                onFill={applyPaintFill}
              />
            )}
            <div className="properties-pane">
              <fig-header borderless="">
                <h3>{kind === "fill" ? "Shader fill" : "Effect properties"}</h3>
                <hstack>
                  <fig-menu ref={propertiesMoreMenuRef} position="bottom right">
                    <fig-tooltip text="More">
                      <fig-button
                        fig-menu-trigger=""
                        type="button"
                        variant="ghost"
                        icon="true"
                        aria-label="More property actions"
                      >
                        <fig-icon name="more" />
                      </fig-button>
                    </fig-tooltip>
                    <fig-menu-item value="reset">
                      Reset to default
                    </fig-menu-item>
                    <fig-menu-item
                      value="save-defaults"
                      disabled={protectedPreview ? "" : undefined}
                    >
                      Save as default
                    </fig-menu-item>
                  </fig-menu>
                  <fig-tooltip
                    text={effectVisible ? "Hide effect" : "Show effect"}
                  >
                    <fig-button
                      type="toggle"
                      variant="ghost"
                      icon="true"
                      selected={effectVisible}
                      aria-label={
                        effectVisible ? "Hide effect" : "Show effect"
                      }
                      onClick={() => {
                        setEffectVisible((visible) => {
                          const next = !visible;
                          hostRef.current?.setActive(true);
                          hostRef.current?.setEffectVisible?.(next);
                          return next;
                        });
                      }}
                    >
                      <fig-icon
                        name={effectVisible ? "visible" : "hidden"}
                      />
                    </fig-button>
                  </fig-tooltip>
                </hstack>
              </fig-header>
              <Suspense fallback={null}>
                <Controls
                  props={props}
                  values={values}
                  onChange={updateControl}
                  onInput={previewControl}
                />
              </Suspense>
            </div>
            <ExportPropertiesPane
              disabled={Boolean(videoExportProgress)}
              onExport={() => openExportDialog(exportTab)}
            />
            {user && !protectedPreview && (
              <div className="sharing-controls properties-pane">
                <fig-header borderless="">
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
          )}
      </fig-content>
    </aside>
  );

  const renderLibraryChoices = (cards, { cardSize, selectedKey } = {}) =>
    cards.map((card) => {
      if (card.separatorLabel) {
        return <fig-separator key={card.key} label={card.separatorLabel} />;
      }
      const cardNode = (
        <ShaderNavCard
          src={card.thumbnailUrl}
          label={card.name}
          sublabel={card.origin === "public" ? "Published" : "Draft"}
          selected={selectedKey === card.key}
          published={card.origin === "public"}
          authorName={card.authorName || card.authorLabel}
          authorAvatarUrl={card.authorAvatarUrl}
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
    if (value === "effect") createDraft("blank-effect");
    else if (value === "fill") createDraft("blank-fill");
    else if (value === "composition") createCompositionDraft();
    else if (value === "from-figma") setFigmaImportOpen(true);
  });
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
    else if (value === "delete") {
      if (!isOwner) return;
      removeCurrentShader();
    } else if (value === "export") {
      if (kind === COMPOSITION_KIND) return;
      exportFiles();
    }
  }, [
    copyShareLink,
    currentShader,
    dirty,
    duplicateShader,
    exportFiles,
    hasUncheckpointedChanges,
    isOwner,
    kind,
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
                    dirty={dirty}
                    hasUncheckpointedChanges={hasUncheckpointedChanges}
                    disabled={saving || restoringVersion || versionsLoading}
                    onPreviewVersion={previewShaderVersion}
                    onChange={restoreSelectedVersion}
                  />
                )}
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
                    saveLabel={
                      saving
                        ? "Saving…"
                        : currentShader && isOwner
                          ? "Save version"
                          : "Save"
                    }
                    showDownload={!isComposerView}
                    showFigmaPush={FIGMA_LIBRARY_UI_ENABLED}
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
            kind === "effect" ||
            (isComposerView &&
              mediaFillType(composition?.fill?.type))
              ? inputSource
              : "image"
          }
          htmlInputRef={htmlInputRef}
          onStageSize={onStageSize}
          onPointerSurface={onPointerSurface}
          onPickFile={onPreviewFile}
          onDropError={setError}
          dropTarget={isComposerView ? "fill" : "input"}
          showCanvasControls={
            !isComposerView || compositionPropsLayerId != null
          }
          canvasTheme={canvasTheme}
        />
      )}
    </>
  );

  const previewTools = (
          <div
            className="tools background--light"
          >
            {(!isComposerView || compositionPlayable) && (
              <>
                <fig-button
                  type="toggle"
                  variant="ghost"
                  icon="true"
                  selected={running}
                  aria-label={running ? "Pause" : "Play"}
                  onClick={togglePlay}
                >
                  <fig-icon name={running ? "pause" : "play"} />
                </fig-button>
                <fig-separator direction="vertical" />
              </>
            )}
            {!fatal && (
              <PreviewFps
                hostRef={hostRef}
                previewZoom={previewZoom}
                onPreviewZoomChange={requestPreviewZoom}
                showFps={!isComposerView || compositionPlayable}
              />
            )}
            {isComposerView &&
              mediaFillType(composition?.fill?.type) && (
                <fig-tooltip text="Upload input">
                  <fig-button
                    variant="ghost"
                    icon="true"
                    disabled={uploading || inputSource === "html"}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <fig-icon name="upload" />
                  </fig-button>
                </fig-tooltip>
              )}
            <fig-separator direction="vertical" />
            <fig-tooltip
              text={
                canvasTheme === "dark" ? "Use light canvas" : "Use dark canvas"
              }
            >
              <fig-button
                variant="ghost"
                icon="true"
                aria-label={
                  canvasTheme === "dark"
                    ? "Use light canvas"
                    : "Use dark canvas"
                }
                onClick={() =>
                  setCanvasTheme(canvasTheme === "dark" ? "light" : "dark")
                }
              >
                <fig-icon name={canvasTheme === "dark" ? "moon" : "sun"} />
              </fig-button>
            </fig-tooltip>
          </div>
  );

  return (
    <>
      {viewMode === "home" && (
        <HomeView
          query={homeQuery}
          onQueryChange={setHomeQuery}
          kind={homeKind}
          onKindChange={setHomeKind}
          origin={homeOrigin}
          onOriginChange={setHomeOrigin}
          author={homeAuthor}
          onAuthorChange={setHomeAuthor}
          publishedAuthors={publishedAuthors}
          choices={renderLibraryChoices(groupedHomeCards, {
            cardSize: "large",
          })}
          onChoice={openHomeChoice}
          authOpen={authOpen}
          onAuthOpenChange={setAuthOpen}
          theme={theme}
          onThemeChange={setTheme}
          canvasTheme={canvasTheme}
          onCanvasThemeChange={setCanvasTheme}
          settingsOpen={settingsOpen}
          onSettingsOpenChange={setSettingsOpen}
          onProfileChange={(displayName) => {
            if (!user) return;
            setCloudShaders((current) =>
              current.map((shader) =>
                shader.owner_id === user.id
                  ? { ...shader, author_name: displayName }
                  : shader,
              ),
            );
          }}
        />
      )}

      {viewMode === "editor" && (
      <div className="editor-view">
        <nav
          className="app-nav"
          style={{ "--app-nav-width": `${appNavWidth}px` }}
        >
          <div className="app-nav-headers">
            <fig-header class="app-nav-header">
              <fig-tooltip text="Back to home">
                <fig-button
                  class="app-nav-back-button"
                  type="button"
                  variant="ghost"
                  icon="true"
                  aria-label="Back to home"
                  onClick={() => setShaderRoute()}
                >
                  <fig-icon name="back" />
                </fig-button>
              </fig-tooltip>
              <h2 className="app-title">Studio</h2>
              <div className="app-nav-header-actions">
                <fig-menu
                  ref={newShaderMenuRef}
                  class="new-shader-menu"
                  position="bottom right"
                >
                  <fig-tooltip text="New Figma shader">
                    <fig-button
                      fig-menu-trigger=""
                      type="button"
                      variant="ghost"
                      icon="true"
                      aria-label="New Figma shader"
                    >
                      <fig-icon name="add" />
                    </fig-button>
                  </fig-tooltip>
                  <fig-menu-item value="effect">
                    Shader effect
                  </fig-menu-item>
                  <fig-menu-item value="fill">
                    Shader fill
                  </fig-menu-item>
                  <fig-menu-item value="composition">
                    Composition
                  </fig-menu-item>
                  {FIGMA_LIBRARY_UI_ENABLED && figmaTokenConfigured && (
                    <>
                      <fig-separator />
                      <fig-menu-item value="from-figma">
                        From Figma…
                      </fig-menu-item>
                    </>
                  )}
                </fig-menu>
              </div>
            </fig-header>
            <fig-header class="app-nav-library-filters">
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
                />
                <fig-tooltip
                  text={
                    libraryView === "grid"
                      ? "Toggle to list view"
                      : "Toggle to grid view"
                  }
                >
                  <fig-button
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label={
                      libraryView === "grid"
                        ? "Toggle to list view"
                        : "Toggle to grid view"
                    }
                    onClick={() =>
                      setLibraryView((current) =>
                        current === "grid" ? "list" : "grid"
                      )
                    }
                  >
                    {libraryView === "grid" ? (
                      <GridViewIcon />
                    ) : (
                      <ListViewIcon />
                    )}
                  </fig-button>
                </fig-tooltip>
              </hstack>
            </fig-header>
          </div>
          <ShaderList
            value={presetId}
            cards={groupedEditorCards}
            layout={libraryView}
            onChoice={chooseItem}
            onContextMenu={onShaderContextMenu}
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
            saveLabel={
              saving
                ? "Saving…"
                : currentShader && isOwner
                  ? "Save version"
                  : "Save"
            }
            showRename={!protectedPreview}
            showSave={!protectedPreview}
            showDownload={!isComposerView}
            showFigmaPush={!protectedPreview && FIGMA_LIBRARY_UI_ENABLED}
            onAction={onShaderAction}
          />
          <fig-footer sticky="">
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
              onProfileChange={(displayName) => {
                if (!user) return;
                setCloudShaders((current) =>
                  current.map((shader) =>
                    shader.owner_id === user.id
                      ? { ...shader, author_name: displayName }
                      : shader
                  )
                );
              }}
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

      {isComposerView ? (
        <ComposerView
          viewerRef={viewerRef}
          visualizerRef={visualizerRef}
          header={shaderEditorHeader}
          preview={
            <>
              {previewCanvas}
              {previewTools}
            </>
          }
          properties={propertiesPanel}
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
          codeCollapsed={effectiveCodeCollapsed}
          chatCollapsed={protectedPreview ? false : chatCollapsed}
          stacked={stacked}
          codeWidth={codeWidth}
          previewHeight={previewHeight}
          minCodeWidth={MIN_CODE_WIDTH}
          minPreviewHeight={MIN_PREVIEW_HEIGHT}
          sidebar={
            <>
              {shaderEditorHeader}

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
          preview={
            <>
              {previewCanvas}
              {previewTools}
            </>
          }
          properties={propertiesPanel}
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
        onClose={() => setExportOpen(false)}
        onExportImage={() => {
          downloadPreviewImage().catch((downloadError) => {
            setError(downloadError.message || String(downloadError));
          });
        }}
        onExportVideo={() => {
          exportPreviewVideo().catch((videoError) => {
            setVideoExportProgress(null);
            setError(videoError.message || String(videoError));
          });
        }}
        onDownloadEmbed={downloadEmbedCode}
        onCopyEmbed={copyEmbedCode}
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
      />

      <DeleteShaderDialog
        dialogRef={deleteDialogRef}
        name={deleteTarget?.name}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
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
        inputLoadingToastRef={inputLoadingToastRef}
        noticeToastRef={noticeToastRef}
        notice={notice}
        onNoticeClose={() => setNotice(null)}
        publishToastRef={publishToastRef}
        publishToast={publishToast}
        onPublishToastClose={() => setPublishToast(null)}
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
