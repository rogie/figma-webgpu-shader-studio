import { useCallback, useEffect, useRef, useState } from "react";
import AccountMenu from "./components/AccountMenu.jsx";
import ChatPane from "./components/ChatPane.jsx";
import CodePane from "./components/CodePane.jsx";
import Controls from "./components/Controls.jsx";
import Preview from "./components/Preview.jsx";
import TrashIcon from "./components/TrashIcon.jsx";
import { useAuth } from "./contexts/AuthContext.jsx";
import { getPreset, PRESETS, shaderModuleFileName } from "./presets.js";
import { exportFigmaFiles } from "./runtime/exportFigma.js";
import { ShaderHost } from "./runtime/host.js";
import { loadModule } from "./runtime/loader.js";
import {
  buildDefaults,
  detectKind,
  inferFeatures,
} from "./runtime/params.js";
import { makeSampleBitmap } from "./runtime/sample.js";
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
  updateShader,
  uploadAsset,
} from "./services/shaders.js";

import logo from "./assets/logo.svg";

const INITIAL = getPreset("dither");
const INITIAL_MODULE = loadModule(INITIAL.source);
const INITIAL_VALUES = buildDefaults(INITIAL_MODULE.props);
const DEFAULT_CODE_WIDTH = 480;
const MIN_CODE_WIDTH = 320;
const MIN_PREVIEW_WIDTH = 220;
const MIN_PREVIEW_HEIGHT = 160;
const MIN_STACKED_SIDEBAR = 280;
const DEFAULT_CHAT_HEIGHT = 260;
const MIN_CHAT_HEIGHT = 220;
const MIN_CODE_EDITOR_HEIGHT = 140;
const STACKED_MEDIA_QUERY = "(max-width: 900px)";
const CODE_WIDTH_STORAGE_KEY = "figma-shader-studio:code-width";
const CHAT_HEIGHT_STORAGE_KEY = "figma-shader-studio:chat-height";
const PREVIEW_HEIGHT_STORAGE_KEY = "figma-shader-studio:preview-height";
const DRAFTS_STORAGE_KEY = "figma-shader-studio:drafts";
const ACTIVE_DRAFT_STORAGE_KEY = "figma-shader-studio:active-draft";
const THEME_STORAGE_KEY = "figma-shader-studio:theme";
const THUMBNAIL_COLORS = [
  ["#1d3557", "#f1fa8c"],
  ["#5c2a72", "#ff8fab"],
  ["#023047", "#8ecae6"],
  ["#202020", "#d8d8d8"],
  ["#1b4332", "#95d5b2"],
  ["#3c096c", "#ff9e00"],
];

function thumbnailData(index, label) {
  const [from, to] = THUMBNAIL_COLORS[index % THUMBNAIL_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="64" height="64" rx="8" fill="url(#g)"/><circle cx="${18 + (index % 3) * 12}" cy="${20 + (index % 2) * 22}" r="${8 + index}" fill="rgba(255,255,255,.38)"/><text x="32" y="37" text-anchor="middle" font-family="system-ui" font-size="10" font-weight="700" fill="white">${label
    .slice(0, 2)
    .toUpperCase()}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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

function writeDrafts(drafts, thumbnails = {}) {
  localStorage.setItem(
    DRAFTS_STORAGE_KEY,
    JSON.stringify(
      drafts.map((draft) =>
        serializeDraft(draft, thumbnails[draft.id] || draft.thumbnail || null)
      )
    )
  );
}

function savedActiveDraftId() {
  const id = localStorage.getItem(ACTIVE_DRAFT_STORAGE_KEY);
  return isDraftId(id) ? id : null;
}

function replaceShaderUrl(id) {
  window.history.replaceState(
    {},
    "",
    id ? makeShareUrl(id) : makeHomeUrl()
  );
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

function measureSpacer(token) {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;width:var(" +
    token +
    ");height:0";
  document.documentElement.appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return px;
}

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [presetId, setPresetId] = useState(INITIAL.id);
  const [shaderName, setShaderName] = useState(INITIAL.name);
  const [source, setSource] = useState(INITIAL.source);
  const [props, setProps] = useState(INITIAL_MODULE.props);
  const [values, setValues] = useState(INITIAL_VALUES);
  const [error, setError] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [running, setRunning] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewZoomRequest, setPreviewZoomRequest] = useState(null);
  const requestPreviewZoom = useCallback((zoom) => {
    setPreviewZoomRequest({ zoom, id: Date.now() });
  }, []);
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
  const [notice, setNotice] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [codeWidth, setCodeWidth] = useState(savedCodeWidth);
  const [chatHeight, setChatHeight] = useState(savedChatHeight);
  const [previewHeight, setPreviewHeight] = useState(savedPreviewHeight);
  const [stacked, setStacked] = useState(isStackedLayout);
  const [theme, setTheme] = useState(savedTheme);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [thumbnails, setThumbnails] = useState(() => {
    const initial = Object.fromEntries(
      PRESETS.map((preset, index) => [
        preset.id,
        thumbnailData(index, preset.name),
      ])
    );
    for (const draft of savedDrafts()) {
      if (draft.thumbnail) initial[draft.id] = draft.thumbnail;
    }
    return initial;
  });

  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const sidebarRef = useRef(null);
  const chatPaneRef = useRef(null);
  const [canClearChat, setCanClearChat] = useState(false);
  const chooserRef = useRef(null);
  const nameInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const propertiesDialogRef = useRef(null);
  const hostRef = useRef(null);
  const initedRef = useRef(false);
  const sourceRef = useRef(source);
  const valuesRef = useRef(values);
  const pendingValuesRef = useRef(null);
  const compileTimer = useRef(0);
  const videoRef = useRef(null);
  const mediaUrlRef = useRef(null);
  const sharedLoadedRef = useRef(false);
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
    writeDrafts(drafts, thumbnails);
  }, [drafts, thumbnails]);

  useEffect(() => {
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
  }, [isPublic, pendingMedia, presetId, shaderName, source, values]);

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
      writeDrafts(next);
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
    const dialog = propertiesDialogRef.current;
    if (!dialog) return;
    // Use the `open` attribute (not `.show()`) so this panel stays out of the
    // dialog top layer. `.show()` would stack above fig-fill-picker popups.
    if (propertiesOpen && !dialog.open) dialog.setAttribute("open", "");
    if (!propertiesOpen && dialog.open) dialog.close();
    if (!propertiesOpen) return;

    const applyInset = () => {
      if (dialog.style.left && dialog.style.left !== "auto") return;
      const inset = measureSpacer("--spacer-5");
      if (!inset) return;
      dialog.style.top = `${inset}px`;
      dialog.style.right = `${inset}px`;
      dialog.style.bottom = "auto";
      dialog.style.left = "auto";
    };

    applyInset();
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(applyInset)
    );
    const t0 = window.setTimeout(applyInset, 0);
    const t1 = window.setTimeout(applyInset, 100);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [propertiesOpen]);

  useEffect(() => {
    const dialog = propertiesDialogRef.current;
    if (!dialog) return;
    const onDialogClose = () => setPropertiesOpen(false);
    dialog.addEventListener("close", onDialogClose);
    return () => dialog.removeEventListener("close", onDialogClose);
  }, []);

  const showNotice = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
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
            setRunning(false);
            return;
          }
          host.start();
          setRunning(true);
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
      videoRef.current.pause();
      videoRef.current = null;
    }
  }, []);

  const applyMediaBlob = useCallback(
    async (blob, mimeType = blob.type) => {
      const host = hostRef.current;
      if (!host?.ready) return;
      clearObjectUrl();

      if (mimeType.startsWith("video/")) {
        const video = document.createElement("video");
        const url = URL.createObjectURL(blob);
        mediaUrlRef.current = url;
        video.src = url;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        await new Promise((resolve, reject) => {
          video.addEventListener("loadedmetadata", resolve, { once: true });
          video.addEventListener("error", reject, { once: true });
        });
        await video.play();
        videoRef.current = video;
        host.setVideoInput(video);
      } else {
        const bitmap = await createImageBitmap(blob);
        host.setImageInput(bitmap);
      }
      setPreviewRevision((revision) => revision + 1);
    },
    [clearObjectUrl]
  );

  const restoreSample = useCallback(async () => {
    const host = hostRef.current;
    if (!host?.ready) return;
    clearObjectUrl();
    const bitmap = await makeSampleBitmap();
    host.setImageInput(bitmap);
    setPreviewRevision((revision) => revision + 1);
  }, [clearObjectUrl]);

  useEffect(() => {
    if (initedRef.current || !canvasRef.current) return;
    initedRef.current = true;
    const host = new ShaderHost(canvasRef.current, { onError: setError });
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
    compileTimer.current = setTimeout(() => compile(source), 350);
    return () => clearTimeout(compileTimer.current);
  }, [source, compile]);

  useEffect(
    () => () => {
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
        await restoreSample();
        return;
      }
      setUploading(true);
      try {
        const blob = await downloadAsset(shader.input_path);
        await applyMediaBlob(blob, shader.input_mime_type || blob.type);
      } finally {
        setUploading(false);
      }
    },
    [applyMediaBlob, clearObjectUrl, restoreSample]
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
      if (draftSessionRef.current.presetId === draft.id) return;
      persistActiveDraft();
      pendingValuesRef.current = draft.values || {};
      hostRef.current?.stop();
      setRunning(false);
      setError(null);
      setCurrentShader(null);
      setPresetId(draft.id);
      replaceShaderUrl();
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
            await restoreSample();
          }
        } else {
          hostRef.current.clearInput();
        }
      }
    },
    [applyMediaBlob, persistActiveDraft, restoreSample]
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
      setDrafts((current) => [draft, ...current]);
      pendingValuesRef.current = {};
      hostRef.current?.stop();
      setRunning(false);
      setError(null);
      setCurrentShader(null);
      setPresetId(id);
      replaceShaderUrl();
      setShaderName(draft.name);
      setSource(draft.source);
      setIsPublic(false);
      setPendingMedia(null);
      setDirty(true);
      if (hostRef.current?.ready) {
        if (preset.kind === "effect") await restoreSample();
        else hostRef.current.clearInput();
      }
    },
    [persistActiveDraft, restoreSample]
  );

  const openCloudShader = useCallback(
    async (shader) => {
      persistActiveDraft();
      pendingValuesRef.current = shader.parameter_values || {};
      hostRef.current?.stop();
      setRunning(false);
      setError(null);
      setCurrentShader(shader);
      setPresetId(cloudChoiceId(shader.id));
      replaceShaderUrl(shader.id);
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
    [loadMediaForShader, persistActiveDraft, runtimeReady]
  );

  const refreshLibrary = useCallback(async () => {
    if (!user) {
      setCloudShaders([]);
      setCloudThumbnails({});
      return;
    }
    try {
      const shaders = await listShaders(user.id);
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
  }, [user]);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const choosePreset = useCallback(
    async (id, { syncUrl = true } = {}) => {
      persistActiveDraft();
      const preset = getPreset(id);
      pendingValuesRef.current = {};
      hostRef.current?.stop();
      setRunning(false);
      setError(null);
      setCurrentShader(null);
      setPresetId(preset.id);
      setShaderName(preset.name);
      setSource(preset.source);
      setIsPublic(false);
      setPendingMedia(null);
      setDirty(false);
      if (syncUrl) replaceShaderUrl(preset.id);
      if (hostRef.current?.ready) {
        if (preset.kind === "effect") await restoreSample();
        else hostRef.current.clearInput();
      }
    },
    [persistActiveDraft, restoreSample]
  );

  const removeDraft = useCallback(
    (draft) => {
      setDrafts((current) => current.filter((item) => item.id !== draft.id));
      setThumbnails((current) => {
        if (!(draft.id in current)) return current;
        const next = { ...current };
        delete next[draft.id];
        return next;
      });
      if (presetId === draft.id) {
        choosePreset("dither").catch((presetError) =>
          setError(presetError.message || String(presetError))
        );
      }
    },
    [choosePreset, presetId]
  );

  const goHome = useCallback(
    (event) => {
      event?.preventDefault();
      replaceShaderUrl();
      choosePreset(INITIAL.id, { syncUrl: false }).catch((presetError) =>
        setError(presetError.message || String(presetError))
      );
    },
    [choosePreset]
  );

  useEffect(() => {
    if (!runtimeReady || authLoading || sharedLoadedRef.current) return;
    sharedLoadedRef.current = true;
    const routeId = getShaderRouteId();
    if (routeId) {
      if (getPreset(routeId).id === routeId) {
        choosePreset(routeId).catch((presetError) =>
          setError(presetError.message || String(presetError))
        );
      } else {
        getShader(routeId)
          .then(openCloudShader)
          .catch(() =>
            setError("This shader is private, missing, or unavailable.")
          );
      }
      return;
    }
    const activeDraftId = savedActiveDraftId();
    const draft = drafts.find((item) => item.id === activeDraftId);
    if (draft) {
      openDraft(draft).catch((draftError) =>
        setError(draftError.message || String(draftError))
      );
    }
  }, [
    authLoading,
    choosePreset,
    drafts,
    openCloudShader,
    openDraft,
    runtimeReady,
  ]);

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

  useEffect(() => {
    const chooser = chooserRef.current;
    if (!chooser) return;
    const handleChange = (event) => {
      if (typeof event.detail === "string") chooseItem(event.detail);
    };
    chooser.addEventListener("change", handleChange);
    return () => chooser.removeEventListener("change", handleChange);
  }, [chooseItem]);

  const updateControl = useCallback(
    (name, value) => {
      setRuntimeValues({ ...valuesRef.current, [name]: value });
      setError(null);
      setDirty(true);
    },
    [setRuntimeValues]
  );

  const previewControl = useCallback((name, value) => {
    const next = { ...valuesRef.current, [name]: value };
    valuesRef.current = next;
    hostRef.current?.setParams(next);
    setError(null);
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
      setUploading(true);
      try {
        await applyMediaBlob(file, mimeType);
        setPendingMedia(file);
        setDirty(true);
      } finally {
        setUploading(false);
      }
    },
    [applyMediaBlob]
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

  const saveShader = useCallback(async () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        owner_id: user.id,
        name: shaderName.trim() || "Untitled Shader",
        source: sourceRef.current,
        kind: detectKind(sourceRef.current),
        parameter_values: valuesRef.current,
        features: inferFeatures(sourceRef.current),
        is_public: isPublic,
      };

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

      const thumbnail = thumbnails[presetId];
      if (thumbnail?.startsWith("data:image/webp")) {
        const thumbnailBlob = await fetch(thumbnail).then((response) =>
          response.blob()
        );
        assetChanges.thumbnail_path = await uploadAsset({
          ownerId: user.id,
          shaderId: saved.id,
          role: "thumbnail",
          blob: thumbnailBlob,
          fileName: "thumbnail.webp",
          contentType: "image/webp",
        });
      }

      if (Object.keys(assetChanges).length) {
        saved = await updateShader(saved.id, assetChanges);
      }

      setCurrentShader(saved);
      setPresetId(cloudChoiceId(saved.id));
      replaceShaderUrl(saved.id);
      setPendingMedia(null);
      setDirty(false);
      if (isDraftId(presetId)) {
        setDrafts((current) =>
          current.filter((item) => item.id !== presetId)
        );
        setThumbnails((current) => {
          if (!(presetId in current)) return current;
          const next = { ...current };
          delete next[presetId];
          return next;
        });
      }
      setCloudShaders((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      if (saved.thumbnail_path) {
        const url = await getAssetUrl(saved.thumbnail_path);
        setCloudThumbnails((current) => ({ ...current, [saved.id]: url }));
      }
      showNotice("Shader saved");
    } catch (saveError) {
      setError(saveError.message || String(saveError));
    } finally {
      setSaving(false);
    }
  }, [
    currentShader,
    isOwner,
    isPublic,
    pendingMedia,
    presetId,
    shaderName,
    showNotice,
    thumbnails,
    user,
  ]);

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
    setDrafts((current) => [draft, ...current]);
    setCurrentShader(null);
    setPresetId(id);
    replaceShaderUrl();
    setShaderName(name);
    setIsPublic(false);
    setPendingMedia(mediaFile);
    setDirty(true);
    showNotice("Unsaved copy created");
  }, [
    currentShader,
    pendingMedia,
    persistActiveDraft,
    shaderName,
    showNotice,
  ]);

  const removeCloudShader = useCallback(
    async (shader) => {
      if (!user || !shader || shader.owner_id !== user.id) return;
      if (!window.confirm(`Delete “${shader.name}”?`)) return;
      try {
        await removeAssets([shader.input_path, shader.thumbnail_path]);
        await deleteShader(shader.id);
        setCloudShaders((current) =>
          current.filter((item) => item.id !== shader.id)
        );
        if (currentShader?.id === shader.id) {
          await choosePreset("dither");
        }
        showNotice("Shader deleted");
      } catch (deleteError) {
        setError(deleteError.message || String(deleteError));
      }
    },
    [choosePreset, currentShader, showNotice, user]
  );

  const removeCurrentShader = useCallback(async () => {
    if (!isOwner || !currentShader) return;
    await removeCloudShader(currentShader);
  }, [currentShader, isOwner, removeCloudShader]);

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

  const resizeCodePane = useCallback(
    (event) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const handle = event.currentTarget;
      const viewer = viewerRef.current;
      if (!viewer) return;

      if (stacked) {
        const visualizer = handle.nextElementSibling;
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

      const codePane = handle.previousElementSibling;
      if (!codePane) return;

      const startX = event.clientX;
      const startWidth = codePane.getBoundingClientRect().width;
      const available =
        viewer.getBoundingClientRect().width -
        handle.getBoundingClientRect().width -
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
    let frameId = 0;
    const timer = window.setTimeout(() => {
      frameId = requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas?.width || !canvas?.height) return;
        try {
          const thumbnail = document.createElement("canvas");
          thumbnail.width = 64;
          thumbnail.height = 64;
          const context = thumbnail.getContext("2d");
          if (!context) return;
          context.fillStyle = "#d9d9d9";
          context.fillRect(0, 0, 64, 64);
          const scale = Math.max(64 / canvas.width, 64 / canvas.height);
          const width = canvas.width * scale;
          const height = canvas.height * scale;
          context.drawImage(
            canvas,
            (64 - width) / 2,
            (64 - height) / 2,
            width,
            height
          );
          const dataUrl = thumbnail.toDataURL("image/webp", 0.82);
          setThumbnails((current) => ({ ...current, [presetId]: dataUrl }));
        } catch {
          // Keep the previous thumbnail if this browser cannot capture WebGPU.
        }
      });
    }, 600);
    return () => {
      window.clearTimeout(timer);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [source, values, presetId, previewRevision]);

  return (
    <>
      <nav className="app-nav">
        <a className="app-logo-link" href={makeHomeUrl()} onClick={goHome}>
          <img className="app-logo" src={logo} alt="Shader Studio" />
        </a>
        <fig-chooser
          ref={chooserRef}
          value={presetId}
          layout="vertical"
          drag="true"
          loop=""
        >
          <fig-menu class="new-shader-menu" position="bottom right">
            <fig-tooltip text="New Figma shader">
              <fig-button
                fig-menu-trigger=""
                type="button"
                variant="secondary"
                icon="true"
                size="large"
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
          {PRESETS.map((preset, index) => (
            <fig-choice
              key={preset.id}
              value={preset.id}
              aria-label={preset.name}
            >
              <fig-tooltip text={preset.name}>
                <fig-swatch
                  size="large"
                  background={`url("${thumbnails[preset.id] || thumbnailData(index, preset.name)}") center / cover no-repeat`}
                  aria-label={preset.name}
                />
              </fig-tooltip>
            </fig-choice>
          ))}
          {drafts.map((draft, index) => {
            const name = draft.id === presetId ? shaderName : draft.name;
            return (
              <fig-choice
                key={draft.id}
                value={draft.id}
                aria-label={name}
              >
                <fig-menu
                  class="shader-context-menu"
                  trigger="contextmenu"
                  position="center right"
                >
                  <div fig-menu-trigger="">
                    <fig-tooltip text={name}>
                      <fig-swatch
                        size="large"
                        background={`url("${thumbnails[draft.id] || thumbnailData(PRESETS.length + index, name)}") center / cover no-repeat`}
                        aria-label={name}
                      />
                    </fig-tooltip>
                  </div>
                  <fig-menu-item
                    value="delete"
                    onClick={() => removeDraft(draft)}
                  >
                    Delete
                  </fig-menu-item>
                </fig-menu>
              </fig-choice>
            );
          })}
          {cloudShaders.map((shader, index) => (
            <fig-choice
              key={shader.id}
              value={cloudChoiceId(shader.id)}
              aria-label={shader.name}
            >
              <fig-menu
                class="shader-context-menu"
                trigger="contextmenu"
                position="center right"
              >
                <div fig-menu-trigger="">
                  <fig-tooltip text={shader.name}>
                    <fig-swatch
                      size="large"
                      background={`url("${cloudThumbnails[shader.id] || thumbnailData(PRESETS.length + drafts.length + index, shader.name)}") center / cover no-repeat`}
                      aria-label={shader.name}
                    />
                  </fig-tooltip>
                </div>
                <fig-menu-item
                  value="delete"
                  onClick={() => removeCloudShader(shader)}
                >
                  Delete
                </fig-menu-item>
              </fig-menu>
            </fig-choice>
          ))}
        </fig-chooser>
        <footer className="app-nav-actions">
          <AccountMenu
            open={authOpen}
            onOpenChange={setAuthOpen}
            theme={theme}
            onThemeChange={setTheme}
            settingsOpen={settingsOpen}
            onSettingsOpenChange={setSettingsOpen}
          />
        </footer>
      </nav>

      <main
        ref={viewerRef}
        className="shader-viewer"
        style={{
          "--code-width": `${codeWidth}px`,
          "--chat-height": `${chatHeight}px`,
          ...(previewHeight != null
            ? { "--preview-height": `${previewHeight}px` }
            : {}),
        }}
      >
        <div ref={sidebarRef} className="shader-viewer-sidebar">
          <section className="shader-viewer-code">
            <fig-header borderless>
              <div
                className={
                  renaming ? "shader-title is-renaming" : "shader-title"
                }
              >
                <fig-input-text
                  ref={nameInputRef}
                  name="name"
                  class="shader-name"
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
                  <fig-menu position="bottom right">
                    <fig-tooltip text="More">
                      <fig-button
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
                      onClick={saveShader}
                    >
                      {saving ? "Saving…" : "Save"}
                    </fig-menu-item>
                    <fig-menu-separator />
                    <fig-menu-item value="duplicate" onClick={duplicateShader}>
                      Duplicate
                    </fig-menu-item>
                    <fig-menu-item value="share" onClick={copyShareLink}>
                      Copy link
                    </fig-menu-item>
                    {isOwner && (
                      <fig-menu-item
                        value="delete"
                        onClick={removeCurrentShader}
                      >
                        Delete
                      </fig-menu-item>
                    )}
                    <fig-menu-separator />
                    <fig-menu-item value="export" onClick={exportFiles}>
                      Download
                    </fig-menu-item>
                  </fig-menu>
                  <fig-tooltip
                    text={
                      propertiesOpen ? "Hide properties" : "Show properties"
                    }
                  >
                    <fig-button
                      type="toggle"
                      variant="ghost"
                      icon="true"
                      selected={propertiesOpen}
                      aria-label={
                        propertiesOpen
                          ? "Hide properties"
                          : "Show properties"
                      }
                      onClick={() => setPropertiesOpen((open) => !open)}
                    >
                      <fig-icon class="properties-toggle-icon" name="adjust" />
                    </fig-button>
                  </fig-tooltip>
                </hstack>
              )}
            </fig-header>
            <div className="code-editor">
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

          <section className="shader-viewer-chat">
            <fig-header borderless>
              <h3>AI chat</h3>
              <hstack>
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
              </hstack>
            </fig-header>
            <ChatPane
              ref={chatPaneRef}
              source={source}
              kind={kind}
              fileName={shaderModuleFileName(presetId, shaderName)}
              shaderKey={chatShaderKey}
              features={shaderFeatures}
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
              const visualizer = handle.nextElementSibling;
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
              <fig-tooltip text="Upload input">
                <fig-button
                  variant="ghost"
                  icon="true"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <fig-icon name="upload" />
                </fig-button>
              </fig-tooltip>
            )}
          </div>
        </section>
      </main>

      <dialog
        is="fig-dialog"
        ref={propertiesDialogRef}
        class="shader-properties-dialog"
        drag
        position="top right"
        closedby="closerequest"
        autoresize=""
      >
        <fig-header dialog-header>
          <h3>Properties</h3>
          <hstack>
            <fig-menu position="bottom right">
              <fig-tooltip text="More">
                <fig-button
                  fig-menu-trigger=""
                  variant="ghost"
                  icon="true"
                  aria-label="More property actions"
                >
                  <fig-icon name="more" />
                </fig-button>
              </fig-tooltip>
              <fig-menu-item value="reset" onClick={resetProperties}>
                Reset
              </fig-menu-item>
            </fig-menu>
            <fig-tooltip text="Close">
              <fig-button
                variant="ghost"
                icon="true"
                aria-label="Close dialog"
                close-dialog=""
                onClick={() => setPropertiesOpen(false)}
              >
                <fig-icon name="close" />
              </fig-button>
            </fig-tooltip>
          </hstack>
        </fig-header>

        <fig-content>
          <div className="shader-properties-dialog-content">
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
          </div>
        </fig-content>
      </dialog>

      {notice && <div className="status-toast">{notice}</div>}
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
