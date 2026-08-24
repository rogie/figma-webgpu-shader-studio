import { useEffect, useRef } from "react";
import AccountMenu from "./AccountMenu.jsx";
import LibraryFilterMenu from "./LibraryFilterMenu.jsx";

const opaqueContent = { __html: "" };

export default function HomeView({
  query,
  onQueryChange,
  kind,
  onKindChange,
  origin,
  onOriginChange,
  author,
  onAuthorChange,
  publishedAuthors,
  choices,
  onChoice,
  authOpen,
  onAuthOpenChange,
  theme,
  onThemeChange,
  canvasTheme,
  onCanvasThemeChange,
  settingsOpen,
  onSettingsOpenChange,
  onProfileChange,
}) {
  const chooserRef = useRef(null);

  useEffect(() => {
    const node = chooserRef.current;
    if (!node || !onChoice) return;
    const handleChange = (event) => {
      if (typeof event.detail === "string") onChoice(event.detail);
    };
    node.addEventListener("change", handleChange);
    return () => node.removeEventListener("change", handleChange);
  }, [onChoice]);

  return (
    <nav className="home-nav">
      <div className="app-nav-headers">
        <fig-header class="app-nav-header">
          <h2 className="app-title">Shader studio</h2>
          <div className="app-nav-home-tools">
            <fig-input-text
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
              origin={origin}
              onOriginChange={onOriginChange}
              authors={publishedAuthors}
            />
          </div>
          <hstack class="app-nav-header-actions">
            <AccountMenu
              open={authOpen}
              onOpenChange={onAuthOpenChange}
              theme={theme}
              onThemeChange={onThemeChange}
              canvasTheme={canvasTheme}
              onCanvasThemeChange={onCanvasThemeChange}
              settingsOpen={settingsOpen}
              onSettingsOpenChange={onSettingsOpenChange}
              onProfileChange={onProfileChange}
            />
          </hstack>
        </fig-header>
      </div>
      <fig-chooser
        ref={chooserRef}
        value=""
        layout="grid"
        overflow="scrollbar"
        loop=""
      >
        {choices}
      </fig-chooser>
    </nav>
  );
}
