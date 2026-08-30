import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_APP_NAV_WIDTH,
  DEFAULT_CHAT_HEIGHT,
  readAppNavWidth,
  readCanvasControlsVisible,
  readCanvasTheme,
  readChatHeight,
  readCodeWidth,
  readEditorFilters,
  readLibraryView,
  readPlayState,
  readPreviewHeight,
  readSidebarSections,
  readTheme,
} from "./layoutStorage.js";

function storage(values = {}) {
  return { getItem: (key) => values[key] ?? null };
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
    readTheme(storage(), () => ({ matches: true })),
    "dark",
  );
  assert.equal(
    readTheme(
      storage({ "figma-shader-studio:theme": "light" }),
      () => ({ matches: true }),
    ),
    "light",
  );
  assert.equal(readCanvasTheme(storage()), "light");
  assert.equal(
    readCanvasTheme(storage({ "figma-shader-studio:canvas-theme": "dark" })),
    "dark",
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
  assert.equal(readLibraryView(storage()), "list");
  assert.equal(
    readLibraryView(storage({ "figma-shader-studio:library-view": "grid" })),
    "grid",
  );
  assert.equal(
    readLibraryView(storage({ "figma-shader-studio:library-view": "cards" })),
    "list",
  );
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
