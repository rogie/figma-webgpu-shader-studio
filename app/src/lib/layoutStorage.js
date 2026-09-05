export const DEFAULT_APP_NAV_WIDTH = 240;
export const MIN_APP_NAV_WIDTH = 112;
export const MAX_APP_NAV_WIDTH = 400;
export const DEFAULT_CODE_WIDTH = 480;
export const MIN_CODE_WIDTH = 320;
export const MIN_PREVIEW_WIDTH = 220;
export const MIN_PREVIEW_HEIGHT = 160;
export const MIN_STACKED_SIDEBAR = 280;
export const DEFAULT_CHAT_HEIGHT = 260;
export const MIN_CHAT_HEIGHT = 220;
export const MIN_CODE_EDITOR_HEIGHT = 140;
export const STACKED_BREAKPOINT = 1180;
export const STACKED_MEDIA_QUERY = `(max-width: ${STACKED_BREAKPOINT}px)`;

export const APP_NAV_WIDTH_STORAGE_KEY =
  "figma-shader-studio:app-nav-width";
export const CODE_WIDTH_STORAGE_KEY = "figma-shader-studio:code-width";
export const CHAT_HEIGHT_STORAGE_KEY = "figma-shader-studio:chat-height";
export const PREVIEW_HEIGHT_STORAGE_KEY =
  "figma-shader-studio:preview-height";
export const SIDEBAR_SECTIONS_STORAGE_KEY =
  "figma-shader-studio:sidebar-sections";
export const THEME_STORAGE_KEY = "figma-shader-studio:theme";
export const CANVAS_THEME_STORAGE_KEY = "figma-shader-studio:canvas-theme";
export const CANVAS_CONTROLS_STORAGE_KEY =
  "figma-shader-studio:show-canvas-handles";
export const PLAY_STORAGE_KEY = "figma-shader-studio:play";
export const LIBRARY_VIEW_STORAGE_KEY = "figma-shader-studio:library-view";
export const LIBRARY_SECTIONS_STORAGE_KEY =
  "figma-shader-studio:library-sections";
export const APP_NAV_COLLAPSED_STORAGE_KEY =
  "figma-shader-studio:app-nav-collapsed";
export const EDITOR_FILTERS_STORAGE_KEY =
  "figma-shader-studio:editor-filters";
export const EXPERIMENTAL_AUDIO_STORAGE_KEY =
  "figma-shader-studio:experimental-audio";

const experimentalAudioListeners = new Set();

export function defaultCodeWidth(viewportWidth = globalThis.innerWidth) {
  return viewportWidth <= 1180 ? 380 : DEFAULT_CODE_WIDTH;
}

export function readAppNavWidth(storage = globalThis.localStorage) {
  const value = Number(storage?.getItem(APP_NAV_WIDTH_STORAGE_KEY));
  return Number.isFinite(value) &&
    value >= MIN_APP_NAV_WIDTH &&
    value <= MAX_APP_NAV_WIDTH
    ? value
    : DEFAULT_APP_NAV_WIDTH;
}

export function readCodeWidth(
  storage = globalThis.localStorage,
  viewportWidth = globalThis.innerWidth,
) {
  const value = Number(storage?.getItem(CODE_WIDTH_STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_CODE_WIDTH
    ? value
    : defaultCodeWidth(viewportWidth);
}

export function readChatHeight(storage = globalThis.localStorage) {
  const value = Number(storage?.getItem(CHAT_HEIGHT_STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_CHAT_HEIGHT
    ? value
    : DEFAULT_CHAT_HEIGHT;
}

export function readPreviewHeight(storage = globalThis.localStorage) {
  const value = Number(storage?.getItem(PREVIEW_HEIGHT_STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_PREVIEW_HEIGHT ? value : null;
}

export function readSidebarSections(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(
      storage?.getItem(SIDEBAR_SECTIONS_STORAGE_KEY) || "{}",
    );
    return {
      codeCollapsed: Boolean(parsed.codeCollapsed),
      chatCollapsed: Boolean(parsed.chatCollapsed),
    };
  } catch {
    return { codeCollapsed: false, chatCollapsed: false };
  }
}

export function isStackedLayout(
  matchMedia = globalThis.matchMedia?.bind(globalThis),
) {
  return Boolean(matchMedia?.(STACKED_MEDIA_QUERY).matches);
}

export function readTheme(
  storage = globalThis.localStorage,
  matchMedia = globalThis.matchMedia?.bind(globalThis),
) {
  const stored = storage?.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readCanvasTheme(storage = globalThis.localStorage) {
  return storage?.getItem(CANVAS_THEME_STORAGE_KEY) === "dark"
    ? "dark"
    : "light";
}

export function readCanvasControlsVisible(storage = globalThis.localStorage) {
  return storage?.getItem(CANVAS_CONTROLS_STORAGE_KEY) !== "false";
}

export function readPlayState(storage = globalThis.localStorage) {
  const stored = storage?.getItem(PLAY_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return true;
}

export function readLibraryView(storage = globalThis.localStorage) {
  return storage?.getItem(LIBRARY_VIEW_STORAGE_KEY) === "grid"
    ? "grid"
    : "list";
}

function readLibrarySectionState(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(
      storage?.getItem(LIBRARY_SECTIONS_STORAGE_KEY) || "{}",
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
  storage = globalThis.localStorage,
) {
  if (!sectionId) return true;
  return readLibrarySectionState(storage)[sectionId] !== false;
}

export function writeLibrarySectionOpen(
  sectionId,
  open,
  storage = globalThis.localStorage,
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

export function readAppNavCollapsed(storage = globalThis.localStorage) {
  return storage?.getItem(APP_NAV_COLLAPSED_STORAGE_KEY) === "true";
}

export function readExperimentalAudio(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(EXPERIMENTAL_AUDIO_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeExperimentalAudio(
  enabled,
  storage = globalThis.localStorage,
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

export function readEditorFilters(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(
      storage?.getItem(EDITOR_FILTERS_STORAGE_KEY) || "{}",
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
