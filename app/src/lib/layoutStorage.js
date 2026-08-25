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
export const PLAY_STORAGE_KEY = "figma-shader-studio:play";
export const LIBRARY_VIEW_STORAGE_KEY = "figma-shader-studio:library-view";

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
