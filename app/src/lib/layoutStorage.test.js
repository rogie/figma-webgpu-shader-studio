import assert from "node:assert/strict";
import test from "node:test";
import {
  canvasColorFillValue,
  canvasColorFromControlEvent,
  DEFAULT_DARK_CANVAS_COLOR,
  DEFAULT_CANVAS_COLOR,
  DEFAULT_APP_NAV_WIDTH,
  DEFAULT_CHAT_HEIGHT,
  readAppNavWidth,
  readCanvasColor,
  readCanvasColorOverride,
  readCanvasControlsVisible,
  readChatHeight,
  readCodeWidth,
  readEditorFilters,
  readExperimentalAudio,
  readAppNavCollapsed,
  readLibraryView,
  readLibrarySectionOpen,
  readPlayState,
  readPreviewHeight,
  readSidebarSections,
  readTheme,
  resolveTheme,
  writeLibrarySectionOpen,
} from "./layoutStorage.js";

function storage(values = {}) {
  return { getItem: (key) => values[key] ?? null };
}

function writableStorage(values = {}) {
  const data = { ...values };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

test("layout readers validate persisted numeric bounds", () => {
  assert.equal(readAppNavWidth(storage()), DEFAULT_APP_NAV_WIDTH);
  assert.equal(
    readAppNavWidth(
      storage({ "figma-shader-studio:app-nav-width": "320" }),
    ),
    320,
  );
  assert.equal(
    readAppNavWidth(
      storage({ "figma-shader-studio:app-nav-width": "999" }),
    ),
    DEFAULT_APP_NAV_WIDTH,
  );
  assert.equal(readCodeWidth(storage(), 1000), 380);
  assert.equal(readCodeWidth(storage(), 1400), 480);
  assert.equal(readChatHeight(storage()), DEFAULT_CHAT_HEIGHT);
  assert.equal(readPreviewHeight(storage()), null);
});

test("sidebar, theme, and play readers tolerate malformed values", () => {
  assert.deepEqual(
    readSidebarSections(
      storage({ "figma-shader-studio:sidebar-sections": "{" }),
    ),
    { codeCollapsed: false, chatCollapsed: false },
  );
  assert.equal(
    readTheme(storage()),
    "system",
  );
  assert.equal(
    readTheme(storage({ "figma-shader-studio:theme": "light" })),
    "light",
  );
  assert.equal(
    readTheme(storage({ "figma-shader-studio:theme": "system" })),
    "system",
  );
  assert.equal(resolveTheme("system", () => ({ matches: true })), "dark");
  assert.equal(resolveTheme("system", () => ({ matches: false })), "light");
  assert.equal(resolveTheme("light", () => ({ matches: true })), "light");
  assert.equal(readCanvasColor(storage()), DEFAULT_CANVAS_COLOR);
  assert.equal(
    readCanvasColor(storage(), "dark"),
    DEFAULT_DARK_CANVAS_COLOR,
  );
  assert.equal(readCanvasColorOverride(storage()), null);
  assert.equal(
    readCanvasColor(
      storage({ "figma-shader-studio:canvas-color": "#12345678" }),
    ),
    "#12345678",
  );
  assert.equal(
    readCanvasColorOverride(
      storage({ "figma-shader-studio:canvas-color": "#FFFFFFB8" }),
    ),
    null,
  );
  assert.equal(
    readCanvasColor(
      storage({ "figma-shader-studio:canvas-theme": "dark" }),
    ),
    DEFAULT_DARK_CANVAS_COLOR,
  );
  assert.equal(readCanvasControlsVisible(storage()), true);
  assert.equal(
    readCanvasControlsVisible(
      storage({ "figma-shader-studio:show-canvas-handles": "false" }),
    ),
    false,
  );
  assert.equal(readPlayState(storage()), true);
  assert.equal(
    readPlayState(storage({ "figma-shader-studio:play": "false" })),
    false,
  );
  assert.equal(readExperimentalAudio(storage()), false);
  assert.equal(
    readExperimentalAudio(
      storage({ "figma-shader-studio:experimental-audio": "true" }),
    ),
    true,
  );
  assert.equal(readLibraryView(storage()), "list");
  assert.equal(
    readLibraryView(storage({ "figma-shader-studio:library-view": "grid" })),
    "grid",
  );
  assert.equal(
    readLibraryView(storage({ "figma-shader-studio:library-view": "cards" })),
    "list",
  );
  assert.equal(readAppNavCollapsed(storage()), false);
  assert.equal(
    readAppNavCollapsed(
      storage({ "figma-shader-studio:app-nav-collapsed": "true" }),
    ),
    true,
  );
});

test("canvas color controls normalize color and alpha", () => {
  assert.equal(
    canvasColorFromControlEvent({
      detail: { type: "solid", color: "#aabbcc", alpha: 0.5 },
    }),
    "#AABBCC80",
  );
  assert.equal(
    canvasColorFromControlEvent({
      detail: { color: "#123456", opacity: 25 },
    }),
    "#12345640",
  );
  assert.equal(
    canvasColorFromControlEvent({ target: { value: "#abc" } }),
    "#AABBCCFF",
  );
  assert.deepEqual(JSON.parse(canvasColorFillValue("#AABBCC80")), {
    type: "solid",
    color: "#AABBCC",
    alpha: 128 / 255,
  });
});

test("editor filters default to your items and restore saved choices", () => {
  assert.deepEqual(readEditorFilters(storage()), {
    kind: "all",
    origin: "all",
    author: "me",
  });
  assert.deepEqual(
    readEditorFilters(
      storage({
        "figma-shader-studio:editor-filters": JSON.stringify({
          kind: "fill",
          origin: "public",
          author: "author-1",
        }),
      }),
    ),
    { kind: "fill", origin: "public", author: "author-1" },
  );
  assert.deepEqual(
    readEditorFilters(
      storage({ "figma-shader-studio:editor-filters": "{" }),
    ),
    { kind: "all", origin: "all", author: "me" },
  );
});

test("library sections default open and persist closed per section", () => {
  assert.equal(readLibrarySectionOpen("composition", storage()), true);
  assert.equal(
    readLibrarySectionOpen(
      "composition",
      storage({
        "figma-shader-studio:library-sections": JSON.stringify({
          composition: false,
        }),
      }),
    ),
    false,
  );
  assert.equal(
    readLibrarySectionOpen(
      "effect",
      storage({
        "figma-shader-studio:library-sections": JSON.stringify({
          composition: false,
        }),
      }),
    ),
    true,
  );
  assert.equal(
    readLibrarySectionOpen(
      "composition",
      storage({ "figma-shader-studio:library-sections": "{" }),
    ),
    true,
  );

  const saved = writableStorage();
  writeLibrarySectionOpen("composition", false, saved);
  assert.equal(readLibrarySectionOpen("composition", saved), false);
  writeLibrarySectionOpen("effect", false, saved);
  assert.equal(readLibrarySectionOpen("effect", saved), false);
  writeLibrarySectionOpen("composition", true, saved);
  assert.equal(readLibrarySectionOpen("composition", saved), true);
  assert.equal(readLibrarySectionOpen("effect", saved), false);
  writeLibrarySectionOpen("effect", true, saved);
  assert.equal(saved.getItem("figma-shader-studio:library-sections"), null);
});
