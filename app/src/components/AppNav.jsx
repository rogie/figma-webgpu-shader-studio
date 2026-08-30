import { useEffect, useRef } from "react";
import { portalToFigOverlay } from "../lib/figOverlay.js";
import AccountMenu from "./AccountMenu.jsx";
import CodeIcon from "./CodeIcon.jsx";
import LibraryFilterMenu from "./LibraryFilterMenu.jsx";
import ShaderStudioIcon from "./ShaderStudioIcon.jsx";

const opaqueContent = { __html: "" };

function NavButton({
  label,
  active = false,
  toggle = true,
  buttonRef,
  onClick,
  children,
}) {
  return (
    <fig-tooltip text={label} position="right">
      <fig-button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="large"
        icon="true"
        aria-label={label}
        selected={toggle && active ? "" : undefined}
        aria-pressed={toggle ? (active ? "true" : "false") : undefined}
        aria-current={toggle && active ? "page" : undefined}
        onClick={onClick}
      >
        {children}
      </fig-button>
    </fig-tooltip>
  );
}

export default function AppNav({
  activeView,
  onHome,
  onEditor,
  onSearch,
  onSearchClose,
  searchOpen = false,
  createMenuRef,
  query,
  onQueryChange,
  kind,
  onKindChange,
  author,
  onAuthorChange,
  publishedAuthors,
  showFigmaImport = false,
  authOpen,
  onAuthOpenChange,
  theme,
  onThemeChange,
  canvasTheme,
  onCanvasThemeChange,
  settingsOpen,
  onSettingsOpenChange,
  onProfileChange,
  onViewProfile,
  onNotice,
}) {
  const searchAnchorRef = useRef(null);
  const searchPopupRef = useRef(null);
  const searchInputRef = useRef(null);
  useEffect(() => {
    const popup = searchPopupRef.current;
    if (!popup) return;
    if (searchOpen) {
      popup.anchor = searchAnchorRef.current;
      popup.open = true;
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else {
      popup.open = false;
    }
  }, [searchOpen]);

  return (
    <>
      <nav className="global-app-nav" aria-label="App navigation">
        <fig-tooltip text="Shader Studio">
          <fig-button
            class="global-app-nav-main"
            type="button"
            variant="ghost"
            size="large"
            icon="true"
            aria-label="Shader Studio"
            onClick={onHome}
          >
            <ShaderStudioIcon />
          </fig-button>
        </fig-tooltip>
        <fig-separator />
        <div className="global-app-nav-actions">
          <NavButton
            label="Explore"
            active={activeView === "home"}
            onClick={onHome}
          >
            <fig-icon name="globe" />
          </NavButton>
          <NavButton
            label="Editor"
            active={activeView === "editor"}
            onClick={onEditor}
          >
            <CodeIcon />
          </NavButton>
          <fig-separator />
          <NavButton
            label="Search"
            toggle={false}
            buttonRef={searchAnchorRef}
            onClick={onSearch}
          >
            <fig-icon name="search" />
          </NavButton>
          <fig-menu ref={createMenuRef} position="right top">
            <fig-tooltip text="Create" position="right">
              <fig-button
                fig-menu-trigger=""
                type="button"
                variant="ghost"
                size="large"
                icon="true"
                aria-label="Create"
              >
                <fig-icon name="add" />
              </fig-button>
            </fig-tooltip>
            <fig-menu-item value="effect">Shader effect</fig-menu-item>
            <fig-menu-item value="fill">Shader fill</fig-menu-item>
            <fig-menu-item value="composition">Composition</fig-menu-item>
            {showFigmaImport && (
              <>
                <fig-separator />
                <fig-menu-item value="from-figma">From Figma…</fig-menu-item>
              </>
            )}
          </fig-menu>
        </div>
        <div className="global-app-nav-account">
          <AccountMenu
            layout="rail"
            position="top right"
            open={authOpen}
            onOpenChange={onAuthOpenChange}
            theme={theme}
            onThemeChange={onThemeChange}
            canvasTheme={canvasTheme}
            onCanvasThemeChange={onCanvasThemeChange}
            settingsOpen={settingsOpen}
            onSettingsOpenChange={onSettingsOpenChange}
            onProfileChange={onProfileChange}
            onViewProfile={onViewProfile}
            onNotice={onNotice}
          />
        </div>
      </nav>
      {portalToFigOverlay(
        <dialog
          is="fig-popup"
          ref={searchPopupRef}
          class="app-search-popup"
          position="right"
          offset="8 0"
          variant="popover"
          popover="manual"
          closedby="any"
          onClose={onSearchClose}
          onCancel={onSearchClose}
        >
          <fig-content padding="none">
            <fig-header class="app-nav-home-tools" borderless="">
              <fig-input-text
                ref={searchInputRef}
                class="app-nav-search"
                type="search"
                placeholder="Search"
                value={query}
                full=""
                onInput={(event) => onQueryChange(event.target.value)}
                dangerouslySetInnerHTML={opaqueContent}
              />
              <LibraryFilterMenu
                kind={kind}
                onKindChange={onKindChange}
                author={author}
                onAuthorChange={onAuthorChange}
                authors={publishedAuthors}
                showOrigin={false}
              />
            </fig-header>
          </fig-content>
        </dialog>,
      )}
    </>
  );
}
