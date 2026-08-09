import { useCallback, useEffect, useRef, useState } from "react";
import AccountMenu from "./components/AccountMenu.jsx";
import ChatPane from "./components/ChatPane.jsx";
import CodePane from "./components/CodePane.jsx";
import Controls from "./components/Controls.jsx";
import ExportIcon from "./components/ExportIcon.jsx";
import Preview from "./components/Preview.jsx";
import TrashIcon from "./components/TrashIcon.jsx";
import { useAuth } from "./contexts/AuthContext.jsx";
import { getPreset, PRESETS, shaderModuleFileName } from "./presets.js";
import { exportFigmaFiles } from "./runtime/exportFigma.js";
import {
  renderVideoInWorker,
  resolveVideoDimensions,
  VIDEO_DIMENSION_OPTIONS,
} from "./runtime/exportVideo.js";
import { ShaderHost } from "./runtime/host.js";
import { loadModule } from "./runtime/loader.js";
import {
  buildDefaults,
  detectKind,
  inferFeatures,
} from "./runtime/params.js";
import {
  HTML_IN_CANVAS_SETUP,
  HTML_INPUT_HEIGHT,
  HTML_INPUT_WIDTH,
  supportsCopyElementImageToTexture,
  supportsHtmlInCanvas,
} from "./runtime/htmlInCanvas.js";
import {
  makeSampleBitmap,
  makeSampleVectorBitmap,
  makeSampleVideoBlob,
} from "./runtime/sample.js";
import {
  buildShaderLibraryCards,
  filterShaderLibraryCards,
} from "./lib/shaderLibrary.js";
import { buildStandaloneEmbedCode } from "./lib/embedCode.js";
import {
  createShader,
  deleteShader,
  downloadAsset,
  getAssetUrl,
  getShader,
  getShaderRouteId,
  listShaders,
  makeHomeUrl,
  makeShareUrl,
  MAX_MEDIA_BYTES,
  removeAssets,
  upsertShader,
  updateShader,
  uploadAsset,
} from "./services/shaders.js";


// FigUI3 builds light-DOM internals; a stable opaque marker keeps React from
// wiping those nodes when the parent re-renders.
const opaqueContent = { __html: "" };

const INITIAL = getPreset("dither");
const INITIAL_MODULE = loadModule(INITIAL.source);
const INITIAL_VALUES = buildDefaults(INITIAL_MODULE.props);
const DEFAULT_APP_NAV_WIDTH = 180;
const MIN_APP_NAV_WIDTH = 112;
const MAX_APP_NAV_WIDTH = 400;
const DEFAULT_CODE_WIDTH = 480;
const MIN_CODE_WIDTH = 320;
const MIN_PREVIEW_WIDTH = 220;
const MIN_PREVIEW_HEIGHT = 160;
const MIN_STACKED_SIDEBAR = 280;
const DEFAULT_CHAT_HEIGHT = 260;
const MIN_CHAT_HEIGHT = 220;
const MIN_CODE_EDITOR_HEIGHT = 140;
const STACKED_MEDIA_QUERY = "(max-width: 900px)";
const APP_NAV_WIDTH_STORAGE_KEY = "figma-shader-studio:app-nav-width";
const CODE_WIDTH_STORAGE_KEY = "figma-shader-studio:code-width";
const CHAT_HEIGHT_STORAGE_KEY = "figma-shader-studio:chat-height";
const PREVIEW_HEIGHT_STORAGE_KEY = "figma-shader-studio:preview-height";
const SIDEBAR_SECTIONS_STORAGE_KEY =
  "figma-shader-studio:sidebar-sections";
const PROPERTIES_PANEL_STORAGE_KEY =
  "figma-shader-studio:properties-panel";
const DRAFTS_STORAGE_KEY = "figma-shader-studio:drafts";
const ACTIVE_DRAFT_STORAGE_KEY = "figma-shader-studio:active-draft";
const THEME_STORAGE_KEY = "figma-shader-studio:theme";
const PLAY_STORAGE_KEY = "figma-shader-studio:play";
const THUMBNAIL_SIZE = 512;
const THUMBNAIL_COLORS = [
  ["#1d3557", "#f1fa8c"],
  ["#5c2a72", "#ff8fab"],
  ["#023047", "#8ecae6"],
  ["#202020", "#d8d8d8"],
  ["#1b4332", "#95d5b2"],
  ["#3c096c", "#ff9e00"],
];

// Display thumbnails as blob: object URLs. Placeholders are cached; captures are
// revoked when replaced. localStorage still needs data: URLs (see persist map).
const placeholderThumbnailUrls = new Map();

function placeholderThumbnailUrl(index, label) {
  const key = `${index}\0${label}`;
  let url = placeholderThumbnailUrls.get(key);
  if (url) return url;
  const [from, to] = THUMBNAIL_COLORS[index % THUMBNAIL_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="64" height="64" rx="8" fill="url(#g)"/><circle cx="${18 + (index % 3) * 12}" cy="${20 + (index % 2) * 22}" r="${8 + index}" fill="rgba(255,255,255,.38)"/><text x="32" y="37" text-anchor="middle" font-family="system-ui" font-size="10" font-weight="700" fill="white">${label
    .slice(0, 2)
    .toUpperCase()}</text></svg>`;
  url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  placeholderThumbnailUrls.set(key, url);
  return url;
}

function dataUrlToObjectUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mime = /data:(.*?);/.exec(header)?.[1] || "application/octet-stream";
  let bytes;
  if (header.includes(";base64")) {
    const binary = atob(data);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(data));
  }
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

function revokeThumbnailUrl(url) {
  if (
    typeof url === "string" &&
    url.startsWith("blob:") &&
    ![...placeholderThumbnailUrls.values()].includes(url)
  ) {
    URL.revokeObjectURL(url);
  }
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

function cloudChoiceId(id) {
  return `cloud:${id}`;
}

function isDraftId(id) {
  return typeof id === "string" && id.startsWith("draft:");
}

function cloudIdForDraft(id) {
  return isDraftId(id) ? id.slice("draft:".length) : id;
}

function serializeDraft(draft, thumbnail = null) {
  return {
    id: draft.id,
    name: draft.name,
    kind: draft.kind,
    source: draft.source,
    values: draft.values && typeof draft.values === "object" ? draft.values : {},
    isPublic: Boolean(draft.isPublic),
    thumbnail: typeof thumbnail === "string" ? thumbnail : null,
  };
}

function savedDrafts() {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (draft) =>
          draft &&
          isDraftId(draft.id) &&
          typeof draft.name === "string" &&
          typeof draft.source === "string" &&
          (draft.kind === "effect" || draft.kind === "fill")
      )
      .map((draft) => ({
        id: draft.id,
        name: draft.name,
        kind: draft.kind,
        source: draft.source,
        values:
          draft.values && typeof draft.values === "object" ? draft.values : {},
        isPublic: Boolean(draft.isPublic),
        pendingMedia: null,
        thumbnail:
          typeof draft.thumbnail === "string" ? draft.thumbnail : null,
      }));
  } catch {
    return [];
  }
}

/** Persist only serializable data: URLs (blob: URLs die on reload). */
function writeDrafts(drafts, thumbnailDataUrls = {}) {
  localStorage.setItem(
    DRAFTS_STORAGE_KEY,
    JSON.stringify(
      drafts.map((draft) => {
        const stored = thumbnailDataUrls[draft.id];
        const thumbnail =
          typeof stored === "string" && stored.startsWith("data:")
            ? stored
            : typeof draft.thumbnail === "string" &&
                draft.thumbnail.startsWith("data:")
              ? draft.thumbnail
              : null;
        return serializeDraft(draft, thumbnail);
      })
    )
  );
}

function replaceShaderUrl(id) {
  window.history.replaceState(
    {},
    "",
    id ? makeShareUrl(id) : makeHomeUrl()
  );
}

function pushShaderUrl(id) {
  window.history.pushState({}, "", makeShareUrl(id));
}

function mediaType(file) {
  if (file.type?.startsWith("image/") || file.type?.startsWith("video/")) {
    return file.type;
  }
  const extension = file.name?.split(".").pop()?.toLowerCase();
  return {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
  }[extension];
}

function defaultCodeWidth() {
  return window.innerWidth <= 1180 ? 380 : DEFAULT_CODE_WIDTH;
}

function savedAppNavWidth() {
  const value = Number(localStorage.getItem(APP_NAV_WIDTH_STORAGE_KEY));
  return Number.isFinite(value) &&
    value >= MIN_APP_NAV_WIDTH &&
    value <= MAX_APP_NAV_WIDTH
    ? value
    : DEFAULT_APP_NAV_WIDTH;
}

function savedCodeWidth() {
  const value = Number(localStorage.getItem(CODE_WIDTH_STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_CODE_WIDTH
    ? value
    : defaultCodeWidth();
}

function savedChatHeight() {
  const value = Number(localStorage.getItem(CHAT_HEIGHT_STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_CHAT_HEIGHT
    ? value
    : DEFAULT_CHAT_HEIGHT;
}

function savedPreviewHeight() {
  const value = Number(localStorage.getItem(PREVIEW_HEIGHT_STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_PREVIEW_HEIGHT ? value : null;
}

function savedSidebarSections() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SIDEBAR_SECTIONS_STORAGE_KEY) || "{}"
    );
    return {
      codeCollapsed: Boolean(parsed.codeCollapsed),
      chatCollapsed: Boolean(parsed.chatCollapsed),
    };
  } catch {
    return { codeCollapsed: false, chatCollapsed: false };
  }
}

function savedPropertiesPanel() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(PROPERTIES_PANEL_STORAGE_KEY) || "{}"
    );
    return {
      collapsed: Boolean(parsed.collapsed),
    };
  } catch {
    return { collapsed: false };
  }
}

function writePropertiesPanel(settings) {
  localStorage.setItem(
    PROPERTIES_PANEL_STORAGE_KEY,
    JSON.stringify(settings)
  );
}

function isStackedLayout() {
  return window.matchMedia(STACKED_MEDIA_QUERY).matches;
}

function savedTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function savedPlayState() {
  const stored = localStorage.getItem(PLAY_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return true;
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
  const [props, setProps] = useState(INITIAL_MODULE.props);
  const [values, setValues] = useState(INITIAL_VALUES);
  const [error, setError] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [running, setRunning] = useState(savedPlayState);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewZoomRequest, setPreviewZoomRequest] = useState(null);
  const requestPreviewZoom = useCallback((zoom) => {
    setPreviewZoomRequest({ zoom, id: Date.now() });
  }, []);
  const [inputSource, setInputSource] = useState("image");
  const [effectVisible, setEffectVisible] = useState(true);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [cloudShaders, setCloudShaders] = useState([]);
  const [drafts, setDrafts] = useState(savedDrafts);
  const [currentShader, setCurrentShader] = useState(null);
  const [cloudThumbnails, setCloudThumbnails] = useState({});
  const [pendingMedia, setPendingMedia] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishToast, setPublishToast] = useState(null);
  const [videoExportOpen, setVideoExportOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedTab, setEmbedTab] = useState("code");
  const [videoExportSettings, setVideoExportSettings] = useState({
    dimensions: "current",
    duration: 5,
    frameRate: 30,
    bitrate: 8,
  });
  const [videoExportProgress, setVideoExportProgress] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [isPublic, setIsPublic] = useState(false);
  const [appNavWidth, setAppNavWidth] = useState(savedAppNavWidth);
  const [codeWidth, setCodeWidth] = useState(savedCodeWidth);
  const [chatHeight, setChatHeight] = useState(savedChatHeight);
  const [previewHeight, setPreviewHeight] = useState(savedPreviewHeight);
  const [stacked, setStacked] = useState(isStackedLayout);
  const [theme, setTheme] = useState(savedTheme);
  const [routeId, setRouteId] = useState(() => getShaderRouteId());
  const [homeQuery, setHomeQuery] = useState("");
  const [editorQuery, setEditorQuery] = useState("");
  const [editorLibraryTab, setEditorLibraryTab] = useState("yours");
  const [homeKind, setHomeKind] = useState("all");
  const [homeOrigin, setHomeOrigin] = useState("all");
  const [homeAuthor, setHomeAuthor] = useState("all");
  const [codeCollapsed, setCodeCollapsed] = useState(
    () => savedSidebarSections().codeCollapsed
  );
  const [chatCollapsed, setChatCollapsed] = useState(
    () => savedSidebarSections().chatCollapsed
  );
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(
    () => savedPropertiesPanel().collapsed
  );
  const viewMode = routeId ? "editor" : "home";

  const setShaderRoute = useCallback((id) => {
    replaceShaderUrl(id);
    setRouteId(id || null);
  }, []);
  const [thumbnails, setThumbnails] = useState(() => {
    const initial = Object.fromEntries(
      PRESETS.map((preset, index) => [
        preset.id,
        placeholderThumbnailUrl(index, preset.name),
      ])
    );
    for (const draft of savedDrafts()) {
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
    for (const draft of savedDrafts()) {
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
  const inputSelectRef = useRef(null);
  const viewerRef = useRef(null);
  const sidebarRef = useRef(null);
  const chatPaneRef = useRef(null);
  const [canClearChat, setCanClearChat] = useState(false);
  const chooserRef = useRef(null);
  const editorLibraryTabsRef = useRef(null);
  const homeKindRef = useRef(null);
  const homeOriginRef = useRef(null);
  const homeAuthorRef = useRef(null);
  const nameInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const moreMenuAnchorRef = useRef(null);
  const publishAnchorRef = useRef(null);
  const publishDialogRef = useRef(null);
  const publishToastRef = useRef(null);
  const noticeToastRef = useRef(null);
  const videoExportDialogRef = useRef(null);
  const embedDialogRef = useRef(null);
  const embedTabsRef = useRef(null);
  const videoExportToastRef = useRef(null);
  const videoExportedToastRef = useRef(null);
  const videoDimensionsRef = useRef(null);
  const videoFrameRateRef = useRef(null);
  const videoBitrateRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const propertiesPanelRef = useRef(null);
  const visualizerRef = useRef(null);
  const hostRef = useRef(null);
  const onStageSize = useCallback((width, height) => {
    hostRef.current?.setStageCssSize?.(width, height);
  }, []);
  const initedRef = useRef(false);
  const sourceRef = useRef(source);
  const valuesRef = useRef(values);
  const runningRef = useRef(running);
  const inputSourceRef = useRef(inputSource);
  const inputApplyGenRef = useRef(0);
  runningRef.current = running;
  inputSourceRef.current = inputSource;
  const pendingValuesRef = useRef(null);
  const compileTimer = useRef(0);
  const lastCompiledPresetRef = useRef(presetId);
  const previewParamsRafRef = useRef(0);
  const videoRef = useRef(null);
  const mediaUrlRef = useRef(null);
  const sharedLoadedRef = useRef(false);
  const migratedUserRef = useRef(null);
  const draftSessionRef = useRef({
    presetId,
    shaderName,
    source,
    values,
    isPublic,
    pendingMedia,
  });

  sourceRef.current = source;
  valuesRef.current = values;
  draftSessionRef.current = {
    presetId,
    shaderName,
    source,
    values,
    isPublic,
    pendingMedia,
  };
  const kind = detectKind(source);
  const shaderFeatures = inferFeatures(source);
  const chatShaderKey = currentShader?.id
    ? `cloud:${currentShader.id}`
    : `preset:${presetId}`;
  const isOwner = Boolean(user && currentShader?.owner_id === user.id);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(PLAY_STORAGE_KEY, String(running));
  }, [running]);

  useEffect(() => {
    localStorage.setItem(
      SIDEBAR_SECTIONS_STORAGE_KEY,
      JSON.stringify({ codeCollapsed, chatCollapsed })
    );
  }, [codeCollapsed, chatCollapsed]);

  useEffect(() => {
    if (user) return;
    writeDrafts(drafts, thumbnailDataUrlsRef.current);
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
          existing.isPublic === isPublic &&
          JSON.stringify(existing.values || {}) === JSON.stringify(values)
        ) {
          return current;
        }
        return current.map((draft) =>
          draft.id === presetId
            ? {
                ...draft,
                name: shaderName,
                source,
                values,
                isPublic,
                pendingMedia,
              }
            : draft
        );
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [isPublic, pendingMedia, presetId, shaderName, source, user, values]);

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
                  values: session.values,
                  isPublic: session.isPublic,
                  pendingMedia: null,
                }
              : draft
          )
        : [
            {
              id: session.presetId,
              name: session.shaderName,
              kind: detectKind(session.source),
              source: session.source,
              values: session.values,
              isPublic: session.isPublic,
              pendingMedia: null,
              thumbnail: null,
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
    const media = window.matchMedia(STACKED_MEDIA_QUERY);
    const sync = () => setStacked(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    writePropertiesPanel({ collapsed: propertiesCollapsed });
  }, [propertiesCollapsed]);

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
    const dialog = videoExportDialogRef.current;
    if (!dialog) return;
    if (videoExportOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [videoExportOpen]);

  useEffect(() => {
    const dialog = embedDialogRef.current;
    if (!dialog) return;
    if (embedOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [embedOpen]);

  useEffect(() => {
    const tabs = embedTabsRef.current;
    const onInput = (event) => {
      const value = String(event.detail ?? event.target.value ?? "code");
      if (value === "code" || value === "iframe") {
        setEmbedTab(value);
      }
    };
    tabs?.addEventListener("input", onInput);
    return () => tabs?.removeEventListener("input", onInput);
  }, []);

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
    const dimensionsSelect = videoDimensionsRef.current;
    const frameRateSelect = videoFrameRateRef.current;
    const bitrateSelect = videoBitrateRef.current;
    const readValue = (event) => {
      const detail = event.detail;
      return String(
        detail && typeof detail === "object" && "value" in detail
          ? detail.value
          : (detail ?? event.target.value)
      );
    };
    const onFrameRate = (event) => {
      setVideoExportSettings((settings) => ({
        ...settings,
        frameRate: Number(readValue(event)),
      }));
    };
    const onDimensions = (event) => {
      setVideoExportSettings((settings) => ({
        ...settings,
        dimensions: readValue(event),
      }));
    };
    const onBitrate = (event) => {
      setVideoExportSettings((settings) => ({
        ...settings,
        bitrate: Number(readValue(event)),
      }));
    };
    dimensionsSelect?.addEventListener("change", onDimensions);
    frameRateSelect?.addEventListener("change", onFrameRate);
    bitrateSelect?.addEventListener("change", onBitrate);
    return () => {
      dimensionsSelect?.removeEventListener("change", onDimensions);
      frameRateSelect?.removeEventListener("change", onFrameRate);
      bitrateSelect?.removeEventListener("change", onBitrate);
    };
  }, []);

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
    });
  }, []);

  const setRuntimeValues = useCallback((next) => {
    valuesRef.current = next;
    setValues(next);
    hostRef.current?.setParams(next);
  }, []);

  const compile = useCallback(
    (nextSource) => {
      const host = hostRef.current;
      if (!host?.ready) return;
      host.stop();

      let loaded;
      try {
        loaded = loadModule(nextSource);
      } catch (compileError) {
        setError(compileError.message);
        host.stop();
        setRunning(false);
        return;
      }

      const preferred = pendingValuesRef.current ?? valuesRef.current;
      pendingValuesRef.current = null;
      const nextValues = mergeValues(loaded.props, preferred);
      setProps(loaded.props);
      setRuntimeValues(nextValues);
      setError(null);

      host
        .setModule(
          { setup: loaded.setup, render: loaded.render },
          { isFill: detectKind(nextSource) === "fill" }
        )
        .then((ok) => {
          if (!ok) {
            runningRef.current = false;
            setRunning(false);
            return;
          }
          // Capture code edits only after the new module has compiled,
          // validated, and presented successfully.
          setThumbnailRefreshRevision((revision) => revision + 1);
          // Preserve play/pause across shader switches and recompiles.
          if (runningRef.current) {
            host.start();
            setRunning(true);
          } else {
            host.stop();
            setRunning(false);
          }
        });
    },
    [setRuntimeValues]
  );

  const clearObjectUrl = useCallback(() => {
    if (mediaUrlRef.current) {
      URL.revokeObjectURL(mediaUrlRef.current);
      mediaUrlRef.current = null;
    }
    if (videoRef.current) {
      const video = videoRef.current;
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      videoRef.current = null;
    }
  }, []);

  const isInputApplyCurrent = useCallback(
    (generation) =>
      generation == null || generation === inputApplyGenRef.current,
    []
  );

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
      } else {
        const bitmap = await createImageBitmap(blob);
        if (!isInputApplyCurrent(generation)) {
          bitmap.close?.();
          return false;
        }
        host.setImageInput(bitmap);
        setInputSource("image");
      }
      setPreviewRevision((revision) => revision + 1);
      return true;
    },
    [clearObjectUrl, isInputApplyCurrent]
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
      setPreviewRevision((revision) => revision + 1);
      return true;
    },
    [clearObjectUrl, isInputApplyCurrent]
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
      setInputSource("vector");
      setPreviewRevision((revision) => revision + 1);
      return true;
    },
    [clearObjectUrl, isInputApplyCurrent]
  );

  // Re-apply the toolbar input preference when switching shaders.
  // Keeps Image/Video/HTML/Vector across effects; no-ops fall back safely.
  const reapplyPreferredInput = useCallback(async () => {
    const host = hostRef.current;
    if (!host?.ready) return;
    const preferred = inputSourceRef.current;

    if (preferred === "html") {
      if (
        !supportsHtmlInCanvas() ||
        !supportsCopyElementImageToTexture(host.device)
      ) {
        setError(HTML_IN_CANVAS_SETUP);
        clearObjectUrl();
        const bitmap = await makeSampleBitmap();
        host.setImageInput(bitmap);
        setInputSource("image");
        setPreviewRevision((revision) => revision + 1);
        return;
      }
      clearObjectUrl();
      setPendingMedia(null);
      setError(null);
      setInputSource("html");
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
      const element = htmlInputRef.current;
      if (!element) return;
      host.setHtmlInput(element, HTML_INPUT_WIDTH, HTML_INPUT_HEIGHT);
      setPreviewRevision((revision) => revision + 1);
      return;
    }

    if (preferred === "video") {
      const generation = ++inputApplyGenRef.current;
      setUploading(true);
      try {
        setPendingMedia(null);
        const blob = await makeSampleVideoBlob();
        await applyMediaBlob(blob, blob.type || "video/mp4", generation);
      } catch (videoError) {
        if (isInputApplyCurrent(generation)) {
          setError(videoError.message || String(videoError));
        }
      } finally {
        if (isInputApplyCurrent(generation)) setUploading(false);
      }
      return;
    }

    if (preferred === "vector") {
      const generation = ++inputApplyGenRef.current;
      try {
        await applyVectorSample(generation);
      } catch (vectorError) {
        if (isInputApplyCurrent(generation)) {
          setError(vectorError.message || String(vectorError));
        }
      }
      return;
    }

    clearObjectUrl();
    setPendingMedia(null);
    const bitmap = await makeSampleBitmap();
    host.setImageInput(bitmap);
    setInputSource("image");
    setPreviewRevision((revision) => revision + 1);
  }, [applyMediaBlob, applyVectorSample, clearObjectUrl, isInputApplyCurrent]);

  const applyInputSource = useCallback(
    async (next) => {
      const host = hostRef.current;
      if (!host?.ready) return;

      const syncSelect = (value) => {
        const select = inputSelectRef.current;
        if (select && select.value !== value) select.value = value;
      };

      // HTML unsupported: keep the current source. Snap the select back —
      // React won't re-set `value` if state never changed, so the control
      // would otherwise stay on HTML and block switching "back" to video.
      if (next === "html") {
        if (
          !supportsHtmlInCanvas() ||
          !supportsCopyElementImageToTexture(host.device)
        ) {
          setError(HTML_IN_CANVAS_SETUP);
          syncSelect(inputSourceRef.current);
          return;
        }
        ++inputApplyGenRef.current;
        clearObjectUrl();
        setPendingMedia(null);
        setError(null);
        setInputSource("html");
        return;
      }

      const generation = ++inputApplyGenRef.current;
      // Keep the controlled select in sync during async loads so React does
      // not snap the value back to the previous source mid-switch.
      setInputSource(next);
      setError(null);

      if (next === "image") {
        setPendingMedia(null);
        await restoreSample(generation);
        return;
      }

      if (next === "vector") {
        setUploading(true);
        try {
          await applyVectorSample(generation);
        } catch (vectorError) {
          if (isInputApplyCurrent(generation)) {
            setError(vectorError.message || String(vectorError));
          }
        } finally {
          if (isInputApplyCurrent(generation)) setUploading(false);
        }
        return;
      }

      if (next === "video") {
        setUploading(true);
        try {
          setPendingMedia(null);
          const blob = await makeSampleVideoBlob();
          if (!isInputApplyCurrent(generation)) return;
          await applyMediaBlob(blob, blob.type || "video/mp4", generation);
        } catch (videoError) {
          if (isInputApplyCurrent(generation)) {
            setError(videoError.message || String(videoError));
          }
        } finally {
          if (isInputApplyCurrent(generation)) setUploading(false);
        }
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

  useEffect(() => {
    const select = inputSelectRef.current;
    if (!select) return;
    const onValue = (event) => {
      const detail = event.detail;
      const raw =
        detail && typeof detail === "object" && "value" in detail
          ? detail.value
          : (detail ?? event.target.value);
      const next = String(raw || "");
      if (
        next === "image" ||
        next === "vector" ||
        next === "video" ||
        next === "html"
      ) {
        applyInputSource(next).catch((sourceError) =>
          setError(sourceError.message || String(sourceError))
        );
      }
    };
    // fig-select emits both input and change; listen once to avoid stacked loads.
    select.addEventListener("change", onValue);
    return () => {
      select.removeEventListener("change", onValue);
    };
  }, [applyInputSource, kind]);

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
    reapplyPreferredInput().catch((inputError) =>
      setError(inputError.message || String(inputError))
    );
  }, [kind, runtimeReady, clearObjectUrl, reapplyPreferredInput]);

  useEffect(() => {
    if (initedRef.current || !canvasRef.current) return;
    initedRef.current = true;
    const host = new ShaderHost(canvasRef.current, {
      onError: (message) => {
        setError(message);
        // Host stops its RAF loop on render errors — keep the play toggle in sync.
        if (message) {
          runningRef.current = false;
          setRunning(false);
        }
      },
    });
    hostRef.current = host;

    (async () => {
      try {
        await host.init();
        await restoreSample();
        compile(sourceRef.current);
        setRuntimeReady(true);
      } catch (initError) {
        setFatal(initError.message || String(initError));
      }
    })();
  }, [compile, restoreSample]);

  useEffect(() => {
    if (!hostRef.current?.ready) return;
    clearTimeout(compileTimer.current);
    const switchedShader = lastCompiledPresetRef.current !== presetId;
    lastCompiledPresetRef.current = presetId;
    if (switchedShader) {
      compile(source);
      return;
    }
    compileTimer.current = setTimeout(() => compile(source), 350);
    return () => clearTimeout(compileTimer.current);
  }, [source, presetId, compile]);

  useEffect(
    () => () => {
      window.clearTimeout(thumbnailPreviewTimerRef.current);
      clearObjectUrl();
      hostRef.current?.destroy?.();
    },
    [clearObjectUrl]
  );

  const loadMediaForShader = useCallback(
    async (shader) => {
      if (shader.kind !== "effect") {
        clearObjectUrl();
        hostRef.current?.clearInput();
        return;
      }
      if (!shader.input_path) {
        await reapplyPreferredInput();
        return;
      }
      const generation = ++inputApplyGenRef.current;
      setUploading(true);
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
      clearObjectUrl,
      isInputApplyCurrent,
      reapplyPreferredInput,
    ]
  );

  const persistActiveDraft = useCallback(() => {
    const session = draftSessionRef.current;
    if (!isDraftId(session.presetId)) return;
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === session.presetId
          ? {
              ...draft,
              name: session.shaderName,
              source: session.source,
              values: session.values,
              isPublic: session.isPublic,
              pendingMedia: session.pendingMedia,
            }
          : draft
      )
    );
  }, []);

  const openDraft = useCallback(
    async (draft) => {
      setShaderRoute(draft.id);
      if (draftSessionRef.current.presetId === draft.id) return;
      persistActiveDraft();
      pendingValuesRef.current = draft.values || {};
      hostRef.current?.stop();
      setError(null);
      setCurrentShader(null);
      setPresetId(draft.id);
      setShaderName(draft.name);
      setSource(draft.source);
      setIsPublic(Boolean(draft.isPublic));
      setPendingMedia(draft.pendingMedia || null);
      setDirty(true);
      if (hostRef.current?.ready) {
        if (draft.kind === "effect") {
          if (draft.pendingMedia) {
            await applyMediaBlob(
              draft.pendingMedia,
              mediaType(draft.pendingMedia)
            );
          } else {
            await reapplyPreferredInput();
          }
        } else {
          clearObjectUrl();
          hostRef.current.clearInput();
        }
      }
    },
    [
      applyMediaBlob,
      clearObjectUrl,
      persistActiveDraft,
      reapplyPreferredInput,
      setShaderRoute,
    ]
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
        pendingValuesRef.current = {};
        hostRef.current?.stop();
        setError(null);
        setCurrentShader(saved);
        setPresetId(cloudChoiceId(saved.id));
        setShaderRoute(saved.id);
        setShaderName(saved.name);
        setSource(saved.source);
        setIsPublic(false);
        setPendingMedia(null);
        setDirty(true);
        setCloudShaders((current) => [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
        if (hostRef.current?.ready) {
          if (preset.kind === "effect") await reapplyPreferredInput();
          else {
            clearObjectUrl();
            hostRef.current.clearInput();
          }
        }
        return;
      }
      setDrafts((current) => [draft, ...current]);
      pendingValuesRef.current = {};
      hostRef.current?.stop();
      setError(null);
      setCurrentShader(null);
      setPresetId(id);
      setShaderRoute(id);
      setShaderName(draft.name);
      setSource(draft.source);
      setIsPublic(false);
      setPendingMedia(null);
      setDirty(true);
      if (hostRef.current?.ready) {
        if (preset.kind === "effect") await reapplyPreferredInput();
        else {
          clearObjectUrl();
          hostRef.current.clearInput();
        }
      }
    },
    [
      clearObjectUrl,
      persistActiveDraft,
      reapplyPreferredInput,
      setShaderRoute,
      user,
    ]
  );

  const openCloudShader = useCallback(
    async (shader) => {
      setShaderRoute(shader.id);
      if (draftSessionRef.current.presetId === cloudChoiceId(shader.id)) return;
      persistActiveDraft();
      pendingValuesRef.current = shader.parameter_values || {};
      hostRef.current?.stop();
      setError(null);
      setCurrentShader(shader);
      setPresetId(cloudChoiceId(shader.id));
      setShaderName(shader.name);
      setSource(shader.source);
      setIsPublic(shader.is_public);
      setPendingMedia(null);
      setDirty(false);
      setError(null);
      if (runtimeReady) {
        try {
          await loadMediaForShader(shader);
        } catch (mediaError) {
          setError(mediaError.message || String(mediaError));
        }
      }
    },
    [loadMediaForShader, persistActiveDraft, runtimeReady, setShaderRoute]
  );

  const refreshLibrary = useCallback(async () => {
    if (!authConfigured) {
      setCloudShaders([]);
      setCloudThumbnails({});
      return;
    }
    try {
      // Row-level security returns public shaders to everyone and adds the
      // current user's private drafts when signed in.
      const shaders = await listShaders();
      setCloudShaders(shaders);
      const entries = await Promise.all(
        shaders.map(async (shader) => {
          if (!shader.thumbnail_path) return [shader.id, null];
          try {
            return [shader.id, await getAssetUrl(shader.thumbnail_path)];
          } catch {
            return [shader.id, null];
          }
        })
      );
      setCloudThumbnails(Object.fromEntries(entries));
    } catch (libraryError) {
      setError(libraryError.message || String(libraryError));
    }
  }, [authConfigured, user]);

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
          let saved = await upsertShader({
            id: cloudIdForDraft(draft.id),
            owner_id: user.id,
            name: session.shaderName || draft.name || "Untitled Shader",
            source: session.source || draft.source,
            kind: detectKind(session.source || draft.source),
            parameter_values: session.values || draft.values || {},
            features: inferFeatures(session.source || draft.source),
            is_public: false,
          });

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
        setShaderRoute(activeMigration.id);
        setShaderName(activeMigration.name);
        setSource(activeMigration.source);
        setIsPublic(false);
        setPendingMedia(null);
        setDirty(false);
      }
      if (lastError) {
        setError(
          `Some local drafts could not sync: ${
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
      if (syncUrl) setShaderRoute(preset.id);
      if (draftSessionRef.current.presetId === preset.id) return;
      persistActiveDraft();
      pendingValuesRef.current = {};
      hostRef.current?.stop();
      setError(null);
      setCurrentShader(null);
      setPresetId(preset.id);
      setShaderName(preset.name);
      setSource(preset.source);
      setIsPublic(false);
      setPendingMedia(null);
      setDirty(false);
      if (hostRef.current?.ready) {
        if (preset.kind === "effect") await reapplyPreferredInput();
        else {
          clearObjectUrl();
          hostRef.current.clearInput();
        }
      }
    },
    [clearObjectUrl, persistActiveDraft, reapplyPreferredInput, setShaderRoute]
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
      if (presetId === draft.id) {
        choosePreset("dither", { syncUrl: Boolean(routeId) }).catch(
          (presetError) => setError(presetError.message || String(presetError))
        );
      }
    },
    [choosePreset, presetId, routeId]
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
    const id = getShaderRouteId();
    setRouteId(id);
    if (id) openRouteId(id);
  }, [authLoading, openRouteId, runtimeReady]);

  useEffect(() => {
    const onPopState = () => {
      const id = getShaderRouteId();
      setRouteId(id);
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
        const shader = cloudShaders.find(
          (item) => item.id === id.slice("cloud:".length)
        );
        if (shader) openCloudShader(shader);
      } else {
        choosePreset(id).catch((presetError) =>
          setError(presetError.message || String(presetError))
        );
      }
    },
    [choosePreset, cloudShaders, drafts, openCloudShader, openDraft]
  );

  const openPublishForCard = useCallback(
    async (card, anchor) => {
      if (!user) {
        setAuthOpen(true);
        return;
      }
      publishAnchorRef.current = anchor;
      try {
        if (card.draft) {
          await openDraft(card.draft);
        } else if (card.cloud) {
          await openCloudShader(card.cloud);
        } else {
          return;
        }
        setPublishOpen(true);
      } catch (publishError) {
        setError(publishError.message || String(publishError));
      }
    },
    [openCloudShader, openDraft, user]
  );

  useEffect(() => {
    const chooser = chooserRef.current;
    if (!chooser) return;
    const handleChange = (event) => {
      if (typeof event.detail !== "string") return;
      if (viewMode === "home") {
        const id = event.detail.startsWith("cloud:")
          ? event.detail.slice("cloud:".length)
          : event.detail;
        pushShaderUrl(id);
      }
      chooseItem(event.detail);
    };
    chooser.addEventListener("change", handleChange);
    return () => chooser.removeEventListener("change", handleChange);
  }, [chooseItem, viewMode]);

  useEffect(() => {
    if (viewMode !== "home") return;
    const kindControl = homeKindRef.current;
    const originControl = homeOriginRef.current;
    const authorControl = homeAuthorRef.current;
    const onKind = (event) => {
      const value = String(event.detail ?? event.target.value ?? "all");
      setHomeKind(value || "all");
    };
    const onOrigin = (event) => {
      const value = String(event.detail ?? event.target.value ?? "all");
      setHomeOrigin(value || "all");
    };
    const onAuthor = (event) => {
      const value = String(event.detail ?? event.target.value ?? "all");
      setHomeAuthor(value || "all");
    };
    kindControl?.addEventListener("change", onKind);
    originControl?.addEventListener("change", onOrigin);
    authorControl?.addEventListener("change", onAuthor);
    return () => {
      kindControl?.removeEventListener("change", onKind);
      originControl?.removeEventListener("change", onOrigin);
      authorControl?.removeEventListener("change", onAuthor);
    };
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "editor") return;
    const tabs = editorLibraryTabsRef.current;
    const onInput = (event) => {
      const value = String(event.detail ?? event.target.value ?? "yours");
      if (value === "yours" || value === "community") {
        setEditorLibraryTab(value);
      }
    };
    tabs?.addEventListener("input", onInput);
    return () => tabs?.removeEventListener("input", onInput);
  }, [viewMode]);

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
      setRuntimeValues({ ...valuesRef.current, [name]: value });
      setError(null);
      setDirty(true);
    },
    [setRuntimeValues]
  );

  const previewControl = useCallback((name, value) => {
    valuesRef.current = { ...valuesRef.current, [name]: value };
    // Most sliders commit with `change`. This idle fallback also covers
    // controls that only emit live `input` events.
    window.clearTimeout(thumbnailPreviewTimerRef.current);
    thumbnailPreviewTimerRef.current = window.setTimeout(() => {
      thumbnailPreviewTimerRef.current = 0;
      setThumbnailRefreshRevision((revision) => revision + 1);
    }, 450);
    // Coalesce live preview redraws to one present per frame. Synchronous
    // WebGPU redraws on every pointermove hitch the main thread and cancel
    // native range-slider drags in the properties panel.
    if (previewParamsRafRef.current) return;
    previewParamsRafRef.current = requestAnimationFrame(() => {
      previewParamsRafRef.current = 0;
      hostRef.current?.setParams(valuesRef.current);
    });
  }, []);

  const resetProperties = useCallback(() => {
    setRuntimeValues(buildDefaults(props));
    setError(null);
    setDirty(true);
  }, [props, setRuntimeValues]);

  const startRename = useCallback(() => {
    setRenaming(true);
    requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.input?.select();
    });
  }, []);

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
    if (running) {
      host.stop();
      setRunning(false);
    } else {
      host.start();
      setRunning(true);
    }
  }, [running]);

  const pickFile = useCallback(
    async (file) => {
      if (file.size > MAX_MEDIA_BYTES) {
        throw new Error("Input media must be 25 MB or smaller.");
      }
      const mimeType = mediaType(file);
      if (!mimeType) {
        throw new Error("Choose a supported image or video file.");
      }
      const generation = ++inputApplyGenRef.current;
      setUploading(true);
      try {
        const applied = await applyMediaBlob(file, mimeType, generation);
        if (!applied) return;
        setPendingMedia(file);
        setDirty(true);
      } finally {
        if (isInputApplyCurrent(generation)) setUploading(false);
      }
    },
    [applyMediaBlob, isInputApplyCurrent]
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

  const exportFiles = useCallback(() => {
    exportFigmaFiles(sourceRef.current, shaderName || "Shader");
  }, [shaderName]);

  const downloadPreviewImage = useCallback(async () => {
    const host = hostRef.current;
    const width = host?.canvas?.width;
    const height = host?.canvas?.height;
    if (!host || !width || !height) {
      setError("Preview image is not ready to download.");
      return;
    }

    const blob = await host.captureThumbnailBlob({
      width,
      height,
      type: "image/webp",
      quality: 0.92,
    });
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}.webp`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [shaderName]);

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
    const { width, height } = resolveVideoDimensions(
      videoExportSettings.dimensions,
      canvas.width,
      canvas.height
    );

    setVideoExportOpen(false);
    setVideoExportProgress({ progress: 0 });

    try {
      const inputBitmap =
        kind === "effect"
          ? await host.captureInputBitmap({ width, height })
          : null;
      if (kind === "effect" && !inputBitmap) {
        throw new Error("Could not snapshot the current shader input.");
      }
      const blob = await renderVideoInWorker({
        source: sourceRef.current,
        values: valuesRef.current,
        isFill: kind === "fill",
        inputBitmap,
        width,
        height,
        duration,
        frameRate,
        bitrate,
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
      link.download = `${baseName}.webm`;
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
  }, [kind, shaderName, videoExportSettings]);

  const saveShader = useCallback(
    async (options = {}) => {
      if (!user) {
        setAuthOpen(true);
        return null;
      }
      const makePublic = options.makePublic === true;
      const background = options.background === true;
      const publicFlag = makePublic || isPublic;
      const noticeMessage =
        "notice" in options ? options.notice : "Shader saved";
      const saveSnapshot = {
        name: shaderName.trim() || "Untitled Shader",
        source: sourceRef.current,
        values: JSON.stringify(valuesRef.current),
        isPublic: publicFlag,
        pendingMedia,
      };
      if (!background) setSaving(true);
      setError(null);
      try {
        const payload = {
          owner_id: user.id,
          name: shaderName.trim() || "Untitled Shader",
          source: sourceRef.current,
          kind: detectKind(sourceRef.current),
          parameter_values: valuesRef.current,
          features: inferFeatures(sourceRef.current),
          is_public: publicFlag,
        };
        // Background draft autosaves must never race an explicit publish or
        // unpublish action. Visibility changes are only persisted by Save or
        // Publish.
        if (background && isOwner && currentShader) {
          delete payload.is_public;
        }

        let saved =
          isOwner && currentShader
            ? await updateShader(currentShader.id, payload)
            : await createShader(payload);

        const assetChanges = {};
        if (pendingMedia) {
          const oldPath = isOwner ? currentShader?.input_path : null;
          const inputMimeType = mediaType(pendingMedia);
          const inputPath = await uploadAsset({
            ownerId: user.id,
            shaderId: saved.id,
            role: "input",
            blob: pendingMedia,
            fileName: pendingMedia.name,
            contentType: inputMimeType,
          });
          if (oldPath && oldPath !== inputPath) await removeAssets([oldPath]);
          assetChanges.input_path = inputPath;
          assetChanges.input_name = pendingMedia.name;
          assetChanges.input_mime_type = inputMimeType;
        }

        let thumbnailBlob = null;
        try {
          thumbnailBlob = await hostRef.current?.captureThumbnailBlob({
            width: THUMBNAIL_SIZE,
            height: THUMBNAIL_SIZE,
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

        if (Object.keys(assetChanges).length) {
          saved = await updateShader(saved.id, assetChanges);
        }

        if (makePublic) setIsPublic(true);
        setCurrentShader(saved);
        setPresetId(cloudChoiceId(saved.id));
        setShaderRoute(saved.id);
        const latest = draftSessionRef.current;
        const unchanged =
          (latest.shaderName.trim() || "Untitled Shader") ===
            saveSnapshot.name &&
          latest.source === saveSnapshot.source &&
          JSON.stringify(latest.values) === saveSnapshot.values &&
          Boolean(latest.isPublic) === saveSnapshot.isPublic &&
          latest.pendingMedia === saveSnapshot.pendingMedia;
        if (!background || unchanged) {
          setPendingMedia(null);
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
        if (saved.thumbnail_path) {
          const url = await getAssetUrl(saved.thumbnail_path);
          setCloudThumbnails((current) => ({ ...current, [saved.id]: url }));
        }
        if (noticeMessage) showNotice(noticeMessage);
        return saved;
      } catch (saveError) {
        setError(saveError.message || String(saveError));
        throw saveError;
      } finally {
        if (!background) setSaving(false);
      }
    },
    [
      currentShader,
      isOwner,
      isPublic,
      pendingMedia,
      presetId,
      setShaderRoute,
      shaderName,
      showNotice,
      thumbnails,
      user,
    ]
  );

  useEffect(() => {
    if (!user || !currentShader || !isOwner || !dirty || saving) return;
    if (Boolean(isPublic) !== Boolean(currentShader.is_public)) return;
    const timer = window.setTimeout(() => {
      saveShader({ background: true, notice: null }).catch(() => {
        // The editor remains dirty so a later edit or explicit Save can retry.
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [currentShader, dirty, isOwner, isPublic, saveShader, saving, user]);

  const publishShader = useCallback(async () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
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
        url: makeShareUrl(saved.id),
      });
    } catch (publishError) {
      setPublishToast(null);
      showNotice(publishError.message || "Publish failed", { error: true });
    }
  }, [saveShader, showNotice, user]);

  const duplicateShader = useCallback(async () => {
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
    const draft = {
      id,
      name,
      kind: detectKind(sourceRef.current),
      source: sourceRef.current,
      values: { ...valuesRef.current },
      isPublic: false,
      pendingMedia: mediaFile,
    };
    if (user) {
      const saved = await createShader({
        id: cloudIdForDraft(id),
        owner_id: user.id,
        name,
        source: draft.source,
        kind: draft.kind,
        parameter_values: draft.values,
        features: inferFeatures(draft.source),
        is_public: false,
      });
      setCurrentShader(saved);
      setPresetId(cloudChoiceId(saved.id));
      setShaderRoute(saved.id);
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
    setShaderRoute(id);
    setShaderName(name);
    setIsPublic(false);
    setPendingMedia(mediaFile);
    setDirty(true);
    showNotice("Unsaved copy created");
  }, [
    currentShader,
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
        await removeAssets([shader.input_path, shader.thumbnail_path]);
        await deleteShader(shader.id);
        setCloudShaders((current) =>
          current.filter((item) => item.id !== shader.id)
        );
        if (currentShader?.id === shader.id) {
          await choosePreset("dither", { syncUrl: Boolean(routeId) });
        }
        showNotice("Shader deleted");
        return true;
      } catch (deleteError) {
        setError(deleteError.message || String(deleteError));
        return false;
      }
    },
    [choosePreset, currentShader, routeId, showNotice, user]
  );

  const removeCurrentShader = useCallback(() => {
    if (!isOwner || !currentShader) return;
    setDeleteTarget({ cloud: currentShader, name: currentShader.name });
  }, [currentShader, isOwner]);

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
    await navigator.clipboard.writeText(makeShareUrl(currentShader.id));
    showNotice("Share link copied");
  }, [currentShader, dirty, showNotice]);

  const openEmbedDialog = useCallback(() => {
    setEmbedTab("code");
    setEmbedOpen(true);
  }, []);

  const embedUrl = currentShader
    ? makeShareUrl(currentShader.id)
    : window.location.href;
  const iframeEmbedCode = `<iframe src="${embedUrl}" width="800" height="600" style="border: 0;" loading="lazy" allowfullscreen></iframe>`;
  const standaloneEmbedCode = buildStandaloneEmbedCode({
    source,
    values,
    kind,
  });
  const embedCode =
    embedTab === "code" ? standaloneEmbedCode : iframeEmbedCode;

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

  const saveAppNavWidth = useCallback((width) => {
    const rounded = Math.round(width);
    setAppNavWidth(rounded);
    localStorage.setItem(APP_NAV_WIDTH_STORAGE_KEY, String(rounded));
  }, []);

  const saveCodeWidth = useCallback((width) => {
    const rounded = Math.round(width);
    setCodeWidth(rounded);
    localStorage.setItem(CODE_WIDTH_STORAGE_KEY, String(rounded));
  }, []);

  const saveChatHeight = useCallback((height) => {
    const rounded = Math.round(height);
    setChatHeight(rounded);
    localStorage.setItem(CHAT_HEIGHT_STORAGE_KEY, String(rounded));
  }, []);

  const savePreviewHeight = useCallback((height) => {
    if (height == null) {
      setPreviewHeight(null);
      localStorage.removeItem(PREVIEW_HEIGHT_STORAGE_KEY);
      return;
    }
    const rounded = Math.round(height);
    setPreviewHeight(rounded);
    localStorage.setItem(PREVIEW_HEIGHT_STORAGE_KEY, String(rounded));
  }, []);

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
      setAppNavWidth(Math.round(next));
    };

    const onPointerUp = (upEvent) => {
      if (handle.hasPointerCapture(upEvent.pointerId)) {
        handle.releasePointerCapture(upEvent.pointerId);
      }
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerUp);
      localStorage.setItem(
        APP_NAV_WIDTH_STORAGE_KEY,
        String(Math.round(finalWidth))
      );
    };

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
  }, []);

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
          setPreviewHeight(Math.round(next));
        };

        const onPointerUp = (upEvent) => {
          if (handle.hasPointerCapture(upEvent.pointerId)) {
            handle.releasePointerCapture(upEvent.pointerId);
          }
          handle.removeEventListener("pointermove", onPointerMove);
          handle.removeEventListener("pointerup", onPointerUp);
          handle.removeEventListener("pointercancel", onPointerUp);
          localStorage.setItem(
            PREVIEW_HEIGHT_STORAGE_KEY,
            String(Math.round(finalHeight))
          );
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
      handle.setPointerCapture(event.pointerId);

      const onPointerMove = (moveEvent) => {
        const next = Math.min(
          maxWidth,
          Math.max(MIN_CODE_WIDTH, startWidth + moveEvent.clientX - startX)
        );
        finalWidth = next;
        setCodeWidth(Math.round(next));
      };

      const onPointerUp = (upEvent) => {
        if (handle.hasPointerCapture(upEvent.pointerId)) {
          handle.releasePointerCapture(upEvent.pointerId);
        }
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.removeEventListener("pointercancel", onPointerUp);
        localStorage.setItem(
          CODE_WIDTH_STORAGE_KEY,
          String(Math.round(finalWidth))
        );
      };

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerUp);
    },
    [stacked]
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
    handle.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent) => {
      // Dragging the divider up grows chat; down shrinks it.
      const next = Math.min(
        maxHeight,
        Math.max(MIN_CHAT_HEIGHT, startHeight + (startY - moveEvent.clientY))
      );
      finalHeight = next;
      setChatHeight(Math.round(next));
    };

    const onPointerUp = (upEvent) => {
      if (handle.hasPointerCapture(upEvent.pointerId)) {
        handle.releasePointerCapture(upEvent.pointerId);
      }
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerUp);
      localStorage.setItem(
        CHAT_HEIGHT_STORAGE_KEY,
        String(Math.round(finalHeight))
      );
    };

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
  }, [chatHeight]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host?.ready || !runtimeReady) return undefined;

    const gen = ++thumbnailCaptureGenRef.current;
    const targetId = presetId;

    const timer = window.setTimeout(() => {
      // Ensure the submitted frame matches the latest committed params.
      host.setParams?.(valuesRef.current);
      host
        .captureThumbnailBlob({
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
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
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    values,
    presetId,
    previewRevision,
    thumbnailRefreshRevision,
    runtimeReady,
  ]);

  const libraryCards = buildShaderLibraryCards({
    drafts: user ? [] : drafts,
    cloudShaders,
    thumbnails,
    cloudThumbnails,
    placeholderThumbnailUrl,
    liveNames: {
      [presetId]: shaderName,
    },
    user,
  });
  const publishedAuthors = [
    ...new Map(
      libraryCards
        .filter((card) => card.origin === "public" && card.authorId)
        .map((card) => [
          card.authorId,
          { value: card.authorId, label: card.authorLabel },
        ])
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  const editorLibraryCards = libraryCards.filter((card) => {
    const isYours = user
      ? card.authorId === user.id
      : card.origin === "draft";
    return editorLibraryTab === "yours"
      ? isYours
      : card.origin === "public" && !isYours;
  });
  const visibleCards =
    viewMode === "home"
      ? filterShaderLibraryCards(libraryCards, {
          query: homeQuery,
          kind: homeKind,
          origin: homeOrigin,
          author: homeAuthor,
        })
      : filterShaderLibraryCards(editorLibraryCards, { query: editorQuery });
  const visibleEffectCards = visibleCards.filter(
    (card) => card.kind === "effect"
  );
  const visibleFillCards = visibleCards.filter((card) => card.kind === "fill");
  const groupedVisibleCards = [
    ...(visibleEffectCards.length
      ? [
          { key: "separator:effect", separatorLabel: "Shader effect" },
          ...visibleEffectCards,
        ]
      : []),
    ...(visibleFillCards.length
      ? [
          { key: "separator:fill", separatorLabel: "Shader fill" },
          ...visibleFillCards,
        ]
      : []),
  ];

  const propertiesPanel = (
    <aside
      ref={propertiesPanelRef}
      className="shader-properties-panel"
      data-collapsed={propertiesCollapsed ? "true" : "false"}
      aria-label="Shader properties"
    >
      <fig-header borderless aria-expanded={!propertiesCollapsed}>
        <h3>Properties</h3>
        <hstack>
          <fig-tooltip
            text={propertiesCollapsed ? "Expand properties" : "Collapse properties"}
          >
            <fig-button
              type="button"
              variant="ghost"
              icon="true"
              aria-label={
                propertiesCollapsed ? "Expand properties" : "Collapse properties"
              }
              onClick={() =>
                setPropertiesCollapsed((collapsed) => !collapsed)
              }
            >
              <fig-icon
                class={
                  propertiesCollapsed
                    ? "properties-chevron is-collapsed"
                    : "properties-chevron"
                }
                name="chevron"
                size="medium"
              />
            </fig-button>
          </fig-tooltip>
        </hstack>
      </fig-header>

      {!propertiesCollapsed && (
        <fig-content class="shader-properties-panel-content">
          <fig-group name={shaderName}>
            <fig-header borderless>
              <h3>{shaderName}</h3>
              <hstack>
                <fig-tooltip text="Reset properties">
                  <fig-button
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label="Reset properties"
                    onClick={resetProperties}
                  >
                    <fig-icon name="reset" />
                  </fig-button>
                </fig-tooltip>
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
            <Controls
              props={props}
              values={values}
              onChange={updateControl}
              onInput={previewControl}
            />
            {user && (
              <div className="sharing-controls">
                <fig-field label="Public" direction="horizontal">
                  <fig-switch
                    checked={isPublic}
                    onInput={(event) => {
                      setIsPublic(event.target.checked);
                      setDirty(true);
                    }}
                    dangerouslySetInnerHTML={{ __html: "" }}
                  />
                </fig-field>
                <p>
                  {isPublic
                    ? "Anyone with the link can view the source and input."
                    : "Only you can open this cloud shader."}
                </p>
              </div>
            )}
          </fig-group>
        </fig-content>
      )}
    </aside>
  );

  return (
    <>
      <nav
        className="app-nav"
        data-mode={viewMode}
        style={
          viewMode === "editor"
            ? { "--app-nav-width": `${appNavWidth}px` }
            : undefined
        }
      >
        <div className="app-nav-headers">
          <fig-header class="app-nav-header">
            {viewMode === "editor" && (
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
            )}
            <h2 className="app-title">Studio</h2>
            {viewMode === "home" && (
              <div className="app-nav-home-tools">
                <fig-input-text
                  class="app-nav-search"
                  type="search"
                  placeholder="Search shaders"
                  value={homeQuery}
                  full=""
                  onInput={(event) => setHomeQuery(event.target.value)}
                  dangerouslySetInnerHTML={opaqueContent}
                />
                <fig-select
                  ref={homeKindRef}
                  class="app-nav-filter"
                  aria-label="Filter by kind"
                  value={homeKind}
                  options={JSON.stringify([
                    { value: "all", label: "All kinds" },
                    { value: "effect", label: "Effects" },
                    { value: "fill", label: "Fills" },
                  ])}
                  dangerouslySetInnerHTML={opaqueContent}
                />
                <fig-select
                  ref={homeOriginRef}
                  class="app-nav-filter"
                  aria-label="Filter by source"
                  value={homeOrigin}
                  options={JSON.stringify([
                    { value: "all", label: "All sources" },
                    { value: "draft", label: "Drafts" },
                    { value: "public", label: "Published" },
                  ])}
                  dangerouslySetInnerHTML={opaqueContent}
                />
                <fig-select
                  ref={homeAuthorRef}
                  class="app-nav-filter"
                  aria-label="Filter by author"
                  value={homeAuthor}
                  options={JSON.stringify([
                    { value: "all", label: "All authors" },
                    ...publishedAuthors,
                  ])}
                  disabled={publishedAuthors.length ? undefined : ""}
                  dangerouslySetInnerHTML={opaqueContent}
                />
              </div>
            )}
            <hstack class="app-nav-header-actions">
              {viewMode === "editor" && (
                <fig-menu class="new-shader-menu" position="bottom right">
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
                  <fig-menu-item
                    value="effect"
                    onClick={() => createDraft("blank-effect")}
                  >
                    Shader effect
                  </fig-menu-item>
                  <fig-menu-item
                    value="fill"
                    onClick={() => createDraft("blank-fill")}
                  >
                    Shader fill
                  </fig-menu-item>
                </fig-menu>
              )}
              <AccountMenu
                open={authOpen}
                onOpenChange={setAuthOpen}
                theme={theme}
                onThemeChange={setTheme}
                settingsOpen={settingsOpen}
                onSettingsOpenChange={setSettingsOpen}
              />
            </hstack>
          </fig-header>
          {viewMode === "editor" && (
            <>
              <fig-tabs
                ref={editorLibraryTabsRef}
                class="app-nav-tabs"
                name="shader-library"
                value={editorLibraryTab}
              >
                <fig-tab value="yours">Yours</fig-tab>
                <fig-tab value="community">Community</fig-tab>
              </fig-tabs>
              <fig-header class="app-nav-search-header" borderless>
                <fig-input-text
                  class="app-nav-search"
                  type="search"
                  placeholder="Search shaders"
                  value={editorQuery}
                  full=""
                  onInput={(event) => setEditorQuery(event.target.value)}
                  dangerouslySetInnerHTML={opaqueContent}
                />
              </fig-header>
            </>
          )}
        </div>
        <fig-chooser
          ref={chooserRef}
          value={viewMode === "home" ? "" : presetId}
          layout="grid"
          overflow={viewMode === "home" ? "scrollbar" : undefined}
          {...(viewMode === "editor"
            ? { columns: appNavWidth < 160 ? "1" : "2", drag: "true" }
            : {})}
          loop=""
        >
          {groupedVisibleCards.map((card) => {
            if (card.separatorLabel) {
              return (
                <fig-separator key={card.key} label={card.separatorLabel} />
              );
            }
            const selected = viewMode === "editor" && presetId === card.key;
            const cardProps = {
              class: "shader-nav-card",
              src: card.thumbnailUrl,
              label: card.name,
              alt: card.name,
              fit: "cover",
              "aspect-ratio": "4/3",
              full: "",
              sublabel:
                card.origin === "public"
                  ? "Published"
                  : card.draft
                    ? "Local"
                    : "Private",
              ...(selected ? { selected: "" } : {}),
              dangerouslySetInnerHTML: opaqueContent,
            };
            const cardNode = <fig-card {...cardProps} />;

            if (!card.canDelete) {
              return (
                <fig-choice
                  key={card.key}
                  value={card.key}
                  aria-label={card.name}
                >
                  {cardNode}
                </fig-choice>
              );
            }

            return (
              <fig-choice
                key={card.key}
                value={card.key}
                aria-label={card.name}
              >
                <fig-menu
                  class="shader-context-menu"
                  trigger="contextmenu"
                  position="center right"
                >
                  <div fig-menu-trigger="">{cardNode}</div>
                  <fig-menu-item
                    value="publish"
                    onClick={(event) => {
                      openPublishForCard(
                        card,
                        event.currentTarget.closest("fig-choice")
                      );
                    }}
                  >
                    Publish
                  </fig-menu-item>
                  <fig-separator />
                  <fig-menu-item
                    value="delete"
                    onClick={() => {
                      if (card.draft) {
                        setDeleteTarget({
                          draft: card.draft,
                          name: card.name,
                        });
                      } else if (card.cloud) {
                        setDeleteTarget({
                          cloud: card.cloud,
                          name: card.name,
                        });
                      }
                    }}
                  >
                    Delete
                  </fig-menu-item>
                </fig-menu>
              </fig-choice>
            );
          })}
        </fig-chooser>
      </nav>

      {viewMode === "editor" && (
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
      )}

      <main
        ref={viewerRef}
        className="shader-viewer"
        data-mode={viewMode}
        {...(viewMode === "home" ? { inert: "" } : {})}
        aria-hidden={viewMode === "home" ? "true" : undefined}
        style={{
          "--code-width": `${codeWidth}px`,
          "--chat-height": `${chatHeight}px`,
          ...(previewHeight != null
            ? { "--preview-height": `${previewHeight}px` }
            : {}),
        }}
      >
        <div
          ref={sidebarRef}
          className="shader-viewer-sidebar"
          data-code-collapsed={codeCollapsed ? "true" : "false"}
          data-chat-collapsed={chatCollapsed ? "true" : "false"}
        >
          <fig-header class="shader-editor-header" borderless>
            <div
              className={
                renaming ? "shader-title is-renaming" : "shader-title"
              }
            >
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
                    if (!renaming) startRename();
                  }}
                  onBlur={() => {
                    if (renaming) finishRename();
                  }}
                  onInput={(event) => {
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
                {!renaming && currentShader?.is_public && (
                  <a
                    className="shader-published-status"
                    href={makeShareUrl(currentShader.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Published
                  </a>
                )}
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
                <fig-menu
                  key={user ? "signed-in" : "signed-out"}
                  position="bottom right"
                >
                  <fig-tooltip text="More">
                    <fig-button
                      ref={moreMenuAnchorRef}
                      fig-menu-trigger=""
                      variant="ghost"
                      icon="true"
                      aria-label="More shader actions"
                    >
                      <fig-icon name="more" />
                    </fig-button>
                  </fig-tooltip>
                  <fig-menu-item
                    value="save"
                    disabled={saving || Boolean(currentShader && !dirty)}
                    onClick={() => {
                      saveShader().catch(() => {});
                    }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </fig-menu-item>
                  {user && (
                    <fig-menu-item
                      value="publish"
                      disabled={saving}
                      onClick={() => {
                        publishAnchorRef.current = moreMenuAnchorRef.current;
                        setPublishOpen(true);
                      }}
                    >
                      Publish…
                    </fig-menu-item>
                  )}
                  <fig-separator />
                  <fig-menu-item value="duplicate" onClick={duplicateShader}>
                    Duplicate
                  </fig-menu-item>
                  <fig-menu-item value="share" onClick={copyShareLink}>
                    Copy link
                  </fig-menu-item>
                  <fig-menu-item
                    value="delete"
                    hidden={!isOwner}
                    disabled={!isOwner}
                    onClick={removeCurrentShader}
                  >
                    Delete
                  </fig-menu-item>
                  <fig-separator />
                  <fig-menu-item value="export" onClick={exportFiles}>
                    Download
                  </fig-menu-item>
                </fig-menu>
              </hstack>
            )}
          </fig-header>

          <section
            className="shader-viewer-code"
            data-collapsed={codeCollapsed ? "true" : "false"}
          >
            <fig-header borderless aria-expanded={!codeCollapsed}>
              <h3>Code editor</h3>
              <hstack>
                <fig-tooltip
                  text={codeCollapsed ? "Expand code" : "Collapse code"}
                >
                  <fig-button
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label={
                      codeCollapsed ? "Expand code" : "Collapse code"
                    }
                    onClick={() => {
                      if (renaming) finishRename();
                      setCodeCollapsed((collapsed) => !collapsed);
                    }}
                  >
                    <fig-icon
                      class={
                        codeCollapsed
                          ? "section-chevron is-collapsed"
                          : "section-chevron"
                      }
                      name="chevron"
                      size="medium"
                    />
                  </fig-button>
                </fig-tooltip>
              </hstack>
            </fig-header>
            <div className="code-editor" hidden={codeCollapsed}>
              <CodePane
                source={source}
                theme={theme}
                onSourceChange={(nextSource) => {
                  setSource(nextSource);
                  setDirty(true);
                }}
              />
            </div>
          </section>

          {!codeCollapsed && !chatCollapsed && (
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
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
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

          <section
            className="shader-viewer-chat"
            data-collapsed={chatCollapsed ? "true" : "false"}
          >
            <fig-header borderless aria-expanded={!chatCollapsed}>
              <h3>AI chat</h3>
              <hstack>
                {!chatCollapsed && (
                  <fig-tooltip text="Clear chat">
                    <fig-button
                      type="button"
                      variant="ghost"
                      icon="true"
                      aria-label="Clear chat"
                      disabled={!canClearChat}
                      onClick={() => chatPaneRef.current?.clearChat()}
                    >
                      <TrashIcon />
                    </fig-button>
                  </fig-tooltip>
                )}
                <fig-tooltip
                  text={chatCollapsed ? "Expand AI chat" : "Collapse AI chat"}
                >
                  <fig-button
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label={
                      chatCollapsed ? "Expand AI chat" : "Collapse AI chat"
                    }
                    onClick={() =>
                      setChatCollapsed((collapsed) => !collapsed)
                    }
                  >
                    <fig-icon
                      class={
                        chatCollapsed
                          ? "section-chevron is-collapsed"
                          : "section-chevron"
                      }
                      name="chevron"
                      size="medium"
                    />
                  </fig-button>
                </fig-tooltip>
              </hstack>
            </fig-header>
            <ChatPane
              ref={chatPaneRef}
              hidden={chatCollapsed}
              source={source}
              kind={kind}
              fileName={shaderModuleFileName(presetId, shaderName)}
              shaderKey={chatShaderKey}
              features={shaderFeatures}
              user={user}
              onApplySource={(nextSource) => {
                setSource(nextSource);
                setDirty(true);
              }}
              onOpenSettings={() => setSettingsOpen(true)}
              onNotice={showNotice}
              onCanClearChange={setCanClearChat}
            />
          </section>
        </div>

        <div
          className="pane-resizer"
          role="separator"
          aria-label="Resize code and preview panes"
          aria-orientation={stacked ? "horizontal" : "vertical"}
          aria-valuemin={stacked ? MIN_PREVIEW_HEIGHT : MIN_CODE_WIDTH}
          aria-valuenow={stacked ? previewHeight ?? undefined : codeWidth}
          tabIndex={0}
          onPointerDown={resizeCodePane}
          onDoubleClick={() =>
            stacked ? savePreviewHeight(null) : saveCodeWidth(defaultCodeWidth())
          }
          onKeyDown={(event) => {
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

        <section
          ref={visualizerRef}
          className="shader-viewer-visualizer background--light"
        >
          {fatal ? (
            <div className="fatal">{fatal}</div>
          ) : (
            <Preview
              canvasRef={canvasRef}
              error={error}
              uploading={uploading}
              props={props}
              values={values}
              onControlInput={previewControl}
              onControlChange={updateControl}
              onZoomChange={setPreviewZoom}
              zoomRequest={previewZoomRequest}
              inputSource={kind === "effect" ? inputSource : "image"}
              htmlInputRef={htmlInputRef}
              onStageSize={onStageSize}
              onPickFile={(file) =>
                pickFile(file).catch((dropError) =>
                  setError(dropError.message || String(dropError))
                )
              }
              onDropError={setError}
            />
          )}
          <div
            className="tools background--light"
          >
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
            <fig-menu position="top center">
              <fig-tooltip text="Zoom">
                <fig-button
                  fig-menu-trigger=""
                  variant="ghost"
                  class="tools-zoom"
                  aria-label={`Zoom ${Math.round(previewZoom * 100)}%`}
                >
                  {Math.round(previewZoom * 100)}%
                </fig-button>
              </fig-tooltip>
              <fig-menu-item value="50" onClick={() => requestPreviewZoom(0.5)}>
                50%
              </fig-menu-item>
              <fig-menu-item value="100" onClick={() => requestPreviewZoom(1)}>
                100%
              </fig-menu-item>
              <fig-menu-item value="200" onClick={() => requestPreviewZoom(2)}>
                200%
              </fig-menu-item>
            </fig-menu>
            {kind === "effect" && (
              <>
                <fig-select
                  ref={inputSelectRef}
                  class="tools-input-source"
                  position="top left"
                  value={inputSource}
                  options={JSON.stringify([
                    { value: "image", label: "Image" },
                    { value: "vector", label: "Vector" },
                    { value: "video", label: "Video" },
                    { value: "html", label: "HTML" },
                  ])}
                  aria-label="Input source"
                  dangerouslySetInnerHTML={opaqueContent}
                />
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
              </>
            )}
            <fig-menu position="top right">
              <fig-tooltip text="Export">
                <fig-button
                  fig-menu-trigger=""
                  type="button"
                  variant="ghost"
                  icon="true"
                  aria-label="Export preview"
                  disabled={videoExportProgress ? "" : undefined}
                >
                  <ExportIcon />
                </fig-button>
              </fig-tooltip>
              <fig-menu-item
                value="image"
                onClick={() => {
                  downloadPreviewImage().catch((downloadError) => {
                    setError(downloadError.message || String(downloadError));
                  });
                }}
              >
                Image
              </fig-menu-item>
              <fig-menu-item
                value="video"
                onClick={() => setVideoExportOpen(true)}
              >
                Video…
              </fig-menu-item>
              <fig-menu-item value="embed" onClick={openEmbedDialog}>
                Embed…
              </fig-menu-item>
            </fig-menu>
          </div>
        </section>

        {propertiesPanel}
      </main>

      <dialog
        is="fig-dialog"
        ref={videoExportDialogRef}
        class="video-export-dialog"
        title="Export video"
        modal=""
        closedby="closerequest"
        position="center center"
        autoresize=""
        onClose={() => setVideoExportOpen(false)}
        onCancel={() => setVideoExportOpen(false)}
      >
        <fig-content>
          <fig-field direction="horizontal" columns="thirds">
            <label>Dimensions</label>
            <fig-select
              ref={videoDimensionsRef}
              value={videoExportSettings.dimensions}
              position="bottom right"
              full=""
              options={JSON.stringify(VIDEO_DIMENSION_OPTIONS)}
              dangerouslySetInnerHTML={opaqueContent}
            />
          </fig-field>
          <fig-field direction="horizontal" columns="thirds">
            <label>Duration</label>
            <fig-slider
              value={videoExportSettings.duration}
              min="1"
              max="30"
              step="1"
              units="s"
              full=""
              onInput={(event) =>
                setVideoExportSettings((settings) => ({
                  ...settings,
                  duration: Number(event.target.value ?? event.detail),
                }))
              }
              dangerouslySetInnerHTML={opaqueContent}
            />
          </fig-field>
          <fig-field direction="horizontal" columns="thirds">
            <label>Frame rate</label>
            <fig-select
              ref={videoFrameRateRef}
              value={videoExportSettings.frameRate}
              position="bottom right"
              full=""
              options={JSON.stringify([
                { value: "24", label: "24 fps" },
                { value: "30", label: "30 fps" },
                { value: "60", label: "60 fps" },
              ])}
              dangerouslySetInnerHTML={opaqueContent}
            />
          </fig-field>
          <fig-field direction="horizontal" columns="thirds">
            <label>Bitrate</label>
            <fig-select
              ref={videoBitrateRef}
              value={videoExportSettings.bitrate}
              position="bottom right"
              full=""
              options={JSON.stringify([
                { value: "4", label: "4 Mbps" },
                { value: "8", label: "8 Mbps" },
                { value: "16", label: "16 Mbps" },
                { value: "32", label: "32 Mbps" },
              ])}
              dangerouslySetInnerHTML={opaqueContent}
            />
          </fig-field>
        </fig-content>
        <fig-footer>
          <fig-button
            type="button"
            variant="primary"
            onClick={() => {
              exportPreviewVideo().catch((videoError) => {
                setVideoExportProgress(null);
                setError(videoError.message || String(videoError));
              });
            }}
          >
            Export
          </fig-button>
        </fig-footer>
      </dialog>

      <dialog
        is="fig-dialog"
        ref={embedDialogRef}
        class="embed-dialog"
        title="Embed shader"
        modal=""
        closedby="closerequest"
        position="center center"
        autoresize=""
        onClose={() => setEmbedOpen(false)}
        onCancel={() => setEmbedOpen(false)}
      >
        <fig-tabs
          ref={embedTabsRef}
          class="embed-tabs"
          name="embed-format"
          value={embedTab}
        >
          <fig-tab value="code">Code</fig-tab>
          <fig-tab value="iframe">iFrame</fig-tab>
        </fig-tabs>
        <fig-field>
          <textarea
            id="shader-embed-code"
            className="embed-code"
            value={embedCode}
            readOnly
            rows="5"
            spellCheck="false"
            onFocus={(event) => event.currentTarget.select()}
          />
        </fig-field>
        <fig-footer borderless>
          <fig-button
            type="button"
            variant="secondary"
            onClick={downloadEmbedCode}
          >
            Download
          </fig-button>
          <fig-button type="button" variant="primary" onClick={copyEmbedCode}>
            Copy
          </fig-button>
        </fig-footer>
      </dialog>

      <dialog
        is="fig-toast"
        ref={videoExportToastRef}
        class="video-export-toast"
        theme="dark"
        live="polite"
        duration="0"
      >
        <span className="video-export-progress">
          <fig-spinner aria-label="Exporting video" />
          <span>
            Exporting video…{" "}
            {Math.round((videoExportProgress?.progress || 0) * 100)}%
          </span>
        </span>
      </dialog>

      <dialog
        is="fig-toast"
        ref={videoExportedToastRef}
        class="video-exported-toast"
        theme="brand"
        live="polite"
        duration="3200"
      >
        <span className="video-export-toast-body">
          <fig-icon name="checkmark" size="small" />
          <span>Video exported</span>
        </span>
      </dialog>

      <dialog
        is="fig-dialog"
        ref={deleteDialogRef}
        class="delete-shader-dialog"
        title="Delete shader"
        modal=""
        closedby="closerequest"
        position="center center"
        autoresize=""
      >
        <fig-content padding>
          <p>
            Delete “{deleteTarget?.name || "this shader"}”? This action cannot
            be undone.
          </p>
        </fig-content>
        <fig-footer>
          <fig-button
            type="button"
            variant="secondary"
            disabled={deleting ? "" : undefined}
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </fig-button>
          <fig-button
            class="delete-danger-button"
            type="button"
            variant="danger"
            disabled={deleting ? "" : undefined}
            onClick={confirmDelete}
          >
            {deleting ? "Deleting…" : "Delete"}
          </fig-button>
        </fig-footer>
      </dialog>

      <dialog
        is="fig-toast"
        ref={noticeToastRef}
        class="notice-toast"
        theme={notice?.error ? "danger" : "dark"}
        live={notice?.error ? "assertive" : "polite"}
        duration={notice?.error ? "0" : "3200"}
        onClose={() => setNotice(null)}
      >
        <span>{notice?.message}</span>
        {notice?.error && (
          <fig-button
            variant="ghost"
            icon="true"
            aria-label="Dismiss notification"
            onClick={() => noticeToastRef.current?.hideToast?.()}
          >
            <fig-icon name="x" />
          </fig-button>
        )}
      </dialog>
      <dialog
        is="fig-popup"
        ref={publishDialogRef}
        class="publish-popup settings-popup"
        position="bottom right"
        offset="8 0"
        variant="popover"
        theme="menu"
        closedby="any"
        onClose={() => setPublishOpen(false)}
        onCancel={() => setPublishOpen(false)}
      >
        <fig-header>
          <h3>Publish to community</h3>
        </fig-header>
        <fig-content padding>
          <p>
            Share this shader so others can open it, remix the source, and use
            the same input. Anyone with the link will be able to view it.
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
            Publish
          </fig-button>
        </fig-footer>
      </dialog>
      <dialog
        is="fig-toast"
        ref={publishToastRef}
        class="publish-toast"
        theme="brand"
        duration="0"
        onClose={() => setPublishToast(null)}
      >
        {publishToast?.phase === "publishing" ? (
          <span className="publish-toast-body">
            <fig-spinner aria-label="Publishing" />
            Publishing…
          </span>
        ) : publishToast?.phase === "done" ? (
          <span className="publish-toast-body">
            Published to{" "}
            <a href={publishToast.url} target="_blank" rel="noreferrer">
              community
            </a>
          </span>
        ) : null}
      </dialog>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={onFileInput}
        hidden
      />
    </>
  );
}
