export const DEFAULT_APP_NAV_WIDTH = 240;
export const COMPACT_APP_NAV_WIDTH = 64;
export const MIN_APP_NAV_WIDTH = 160;
export const MAX_APP_NAV_WIDTH = 400;
export const MIN_PROPERTIES_WIDTH = 260;
export const MAX_PROPERTIES_WIDTH = MAX_APP_NAV_WIDTH;
export const DEFAULT_CODE_PANE_SHARE = 0.5;
export const MIN_CODE_PANE_SHARE = 0.3;
export const MAX_CODE_PANE_SHARE = 0.7;
export const MIN_PREVIEW_HEIGHT = 160;
export const DEFAULT_CHAT_HEIGHT = 260;
export const MIN_CHAT_HEIGHT = 220;
export const MIN_CODE_EDITOR_HEIGHT = 140;
export const TOOLS_STACK_BREAKPOINT = 1000;
export const COMPACT_EDITOR_BREAKPOINT = 740;

export const APP_NAV_WIDTH_STORAGE_KEY =
  "figma-shader-studio:app-nav-width";
export const CODE_PANE_SHARE_STORAGE_KEY = "figma-shader-studio:code-pane-share";
export const PROPERTIES_WIDTH_STORAGE_KEY = "figma-shader-studio:properties-width";
export const CHAT_HEIGHT_STORAGE_KEY = "figma-shader-studio:chat-height";
export const PREVIEW_HEIGHT_STORAGE_KEY =
  "figma-shader-studio:preview-height";
export const SIDEBAR_SECTIONS_STORAGE_KEY =
  "figma-shader-studio:sidebar-sections";
export const THEME_STORAGE_KEY = "figma-shader-studio:theme";
export const CANVAS_COLOR_STORAGE_KEY = "figma-shader-studio:canvas-color";
export const DEFAULT_LIGHT_CANVAS_COLOR = "#FFFFFF33";
export const DEFAULT_DARK_CANVAS_COLOR = "#00000033";
export const DEFAULT_CANVAS_COLOR = DEFAULT_LIGHT_CANVAS_COLOR;
const LEGACY_CANVAS_THEME_STORAGE_KEY =
  "figma-shader-studio:canvas-theme";
export const CANVAS_CONTROLS_STORAGE_KEY =
  "figma-shader-studio:show-canvas-handles";
export const PLAY_STORAGE_KEY = "figma-shader-studio:play";
export const LIBRARY_VIEW_STORAGE_KEY = "figma-shader-studio:library-view";
export const LIBRARY_SECTIONS_STORAGE_KEY =
  "figma-shader-studio:library-sections";
export const EDITOR_FILTERS_STORAGE_KEY =
  "figma-shader-studio:editor-filters";
export const EXPERIMENTAL_AUDIO_STORAGE_KEY =
  "figma-shader-studio:experimental-audio";

const experimentalAudioListeners = new Set();

function layoutPreferenceStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readLayoutPreference(storage, key) {
  try {
    return storage?.getItem(key);
  } catch {
    return null;
  }
}

export function writeLayoutPreference(key, value, storage = layoutPreferenceStorage()) {
  try {
    if (value == null) storage?.removeItem(key);
    else storage?.setItem(key, String(value));
  } catch {
    // Preferences still apply for the current editor session.
  }
}

export function snapAppNavWidth(width) {
  return width < MIN_APP_NAV_WIDTH ? COMPACT_APP_NAV_WIDTH : Math.round(width);
}

export function readAppNavWidth(
  storage = layoutPreferenceStorage(),
  viewportWidth = globalThis.innerWidth,
) {
  const value = Number(readLayoutPreference(storage, APP_NAV_WIDTH_STORAGE_KEY));
  return Number.isFinite(value) &&
    value >= COMPACT_APP_NAV_WIDTH &&
    value <= MAX_APP_NAV_WIDTH
    ? snapAppNavWidth(value)
    : viewportWidth <= COMPACT_EDITOR_BREAKPOINT ? COMPACT_APP_NAV_WIDTH : DEFAULT_APP_NAV_WIDTH;
}

export function readCodePaneShare(storage = layoutPreferenceStorage()) {
  const value = Number(readLayoutPreference(storage, CODE_PANE_SHARE_STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_CODE_PANE_SHARE && value <= MAX_CODE_PANE_SHARE
    ? value
    : DEFAULT_CODE_PANE_SHARE;
}

export function readPropertiesWidth(storage = layoutPreferenceStorage()) {
  const value = Number(readLayoutPreference(storage, PROPERTIES_WIDTH_STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_PROPERTIES_WIDTH && value <= MAX_PROPERTIES_WIDTH
    ? value
    : MIN_PROPERTIES_WIDTH;
}

export function readChatHeight(storage = layoutPreferenceStorage()) {
  const value = Number(readLayoutPreference(storage, CHAT_HEIGHT_STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_CHAT_HEIGHT
    ? value
    : DEFAULT_CHAT_HEIGHT;
}

export function readPreviewHeight(storage = layoutPreferenceStorage()) {
  const value = Number(readLayoutPreference(storage, PREVIEW_HEIGHT_STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_PREVIEW_HEIGHT ? value : null;
}

export function readSidebarSections(storage = layoutPreferenceStorage()) {
  try {
    const parsed = JSON.parse(
      readLayoutPreference(storage, SIDEBAR_SECTIONS_STORAGE_KEY) || "{}",
    );
    return {
      codeCollapsed: Boolean(parsed.codeCollapsed),
      chatCollapsed: Boolean(parsed.chatCollapsed),
    };
  } catch {
    return { codeCollapsed: false, chatCollapsed: false };
  }
}

export function readTheme(storage = layoutPreferenceStorage()) {
  const stored = readLayoutPreference(storage, THEME_STORAGE_KEY);
  if (stored === "system" || stored === "light" || stored === "dark") {
    return stored;
  }
  return "system";
}

export function resolveTheme(
  theme,
  matchMedia = globalThis.matchMedia?.bind(globalThis),
) {
  if (theme === "light" || theme === "dark") return theme;
  return matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function defaultCanvasColorForTheme(theme) {
  return theme === "dark"
    ? DEFAULT_DARK_CANVAS_COLOR
    : DEFAULT_LIGHT_CANVAS_COLOR;
}

export function normalizeCanvasColor(value, fallback = DEFAULT_CANVAS_COLOR) {
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(
    String(value || "").trim(),
  );
  if (!match) return fallback;
  let hex = match[1];
  if (hex.length <= 4) {
    hex = [...hex].map((digit) => `${digit}${digit}`).join("");
  }
  if (hex.length === 6) hex += "FF";
  return `#${hex.toUpperCase()}`;
}

export function canvasColorFromControlEvent(
  event,
  fallback = DEFAULT_CANVAS_COLOR,
) {
  const rawDetail = event?.nativeEvent?.detail ?? event?.detail;
  const detail =
    rawDetail &&
    typeof rawDetail === "object" &&
    "value" in rawDetail
      ? rawDetail.value
      : rawDetail;
  if (typeof detail === "string") {
    return normalizeCanvasColor(detail, fallback);
  }
  if (!detail || typeof detail !== "object") {
    return normalizeCanvasColor(event?.target?.value, fallback);
  }

  const color = normalizeCanvasColor(
    detail.color ?? detail.hex ?? detail.rgba,
    fallback,
  );
  const alpha =
    Number.isFinite(Number(detail.alpha))
      ? Math.max(0, Math.min(1, Number(detail.alpha)))
      : Number.isFinite(Number(detail.opacity))
        ? Math.max(0, Math.min(100, Number(detail.opacity))) / 100
        : Number.parseInt(color.slice(7, 9), 16) / 255;
  const alphaHex = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `${color.slice(0, 7)}${alphaHex}`;
}

export function readCanvasColorOverride(storage = layoutPreferenceStorage()) {
  const stored = normalizeCanvasColor(
    readLayoutPreference(storage, CANVAS_COLOR_STORAGE_KEY),
    null,
  );
  if (stored === "#FFFFFFB8" || stored === "#0000008F") return null;
  if (stored) return stored;
  const legacyTheme = readLayoutPreference(storage, LEGACY_CANVAS_THEME_STORAGE_KEY);
  if (legacyTheme === "dark" || legacyTheme === "light") {
    return defaultCanvasColorForTheme(legacyTheme);
  }
  return null;
}

export function readCanvasColor(
  storage = layoutPreferenceStorage(),
  theme = resolveTheme(readTheme(storage)),
) {
  return (
    readCanvasColorOverride(storage) ||
    defaultCanvasColorForTheme(theme)
  );
}

export function readCanvasControlsVisible(storage = layoutPreferenceStorage()) {
  return readLayoutPreference(storage, CANVAS_CONTROLS_STORAGE_KEY) !== "false";
}

export function readPlayState(storage = layoutPreferenceStorage()) {
  const stored = readLayoutPreference(storage, PLAY_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return true;
}

export function readLibraryView(storage = layoutPreferenceStorage()) {
  return readLayoutPreference(storage, LIBRARY_VIEW_STORAGE_KEY) === "grid"
    ? "grid"
    : "list";
}

function readLibrarySectionState(storage = layoutPreferenceStorage()) {
  try {
    const parsed = JSON.parse(
      readLayoutPreference(storage, LIBRARY_SECTIONS_STORAGE_KEY) || "{}",
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function readLibrarySectionOpen(
  sectionId,
  storage = layoutPreferenceStorage(),
) {
  if (!sectionId) return true;
  return readLibrarySectionState(storage)[sectionId] !== false;
}

export function writeLibrarySectionOpen(
  sectionId,
  open,
  storage = layoutPreferenceStorage(),
) {
  if (!sectionId) return;
  try {
    const parsed = readLibrarySectionState(storage);
    if (open) delete parsed[sectionId];
    else parsed[sectionId] = false;
    if (Object.keys(parsed).length === 0) {
      storage?.removeItem(LIBRARY_SECTIONS_STORAGE_KEY);
    } else {
      storage?.setItem(
        LIBRARY_SECTIONS_STORAGE_KEY,
        JSON.stringify(parsed),
      );
    }
  } catch {
    // Library should continue when storage is unavailable.
  }
}

export function readExperimentalAudio(storage = layoutPreferenceStorage()) {
  try {
    return readLayoutPreference(storage, EXPERIMENTAL_AUDIO_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeExperimentalAudio(
  enabled,
  storage = layoutPreferenceStorage(),
) {
  const next = Boolean(enabled);
  try {
    storage?.setItem(EXPERIMENTAL_AUDIO_STORAGE_KEY, next ? "true" : "false");
  } catch {
    // Preview should continue when storage is unavailable.
  }
  experimentalAudioListeners.forEach((listener) => listener(next));
  return next;
}

export function subscribeExperimentalAudio(listener) {
  experimentalAudioListeners.add(listener);
  return () => experimentalAudioListeners.delete(listener);
}

export function readEditorFilters(storage = layoutPreferenceStorage()) {
  try {
    const parsed = JSON.parse(
      readLayoutPreference(storage, EDITOR_FILTERS_STORAGE_KEY) || "{}",
    );
    return {
      kind: ["all", "effect", "fill", "composition"].includes(parsed.kind)
        ? parsed.kind
        : "all",
      origin: ["all", "draft", "public"].includes(parsed.origin)
        ? parsed.origin
        : "all",
      author:
        typeof parsed.author === "string" && parsed.author
          ? parsed.author
          : "me",
    };
  } catch {
    return { kind: "all", origin: "all", author: "me" };
  }
}
