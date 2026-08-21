import { useEffect, useRef } from "react";
import AccountMenu from "./AccountMenu.jsx";

const opaqueContent = { __html: "" };

function filterValue(event) {
  return String(event.detail ?? event.target.value ?? "all") || "all";
}

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
  const kindRef = useRef(null);
  const originRef = useRef(null);
  const authorRef = useRef(null);

  useEffect(() => {
    const node = chooserRef.current;
    if (!node || !onChoice) return;
    const handleChange = (event) => {
      if (typeof event.detail === "string") onChoice(event.detail);
    };
    node.addEventListener("change", handleChange);
    return () => node.removeEventListener("change", handleChange);
  }, [onChoice]);

  useEffect(() => {
    const kindControl = kindRef.current;
    const originControl = originRef.current;
    const authorControl = authorRef.current;
    const onKind = (event) => onKindChange?.(filterValue(event));
    const onOrigin = (event) => onOriginChange?.(filterValue(event));
    const onAuthor = (event) => onAuthorChange?.(filterValue(event));
    kindControl?.addEventListener("change", onKind);
    originControl?.addEventListener("change", onOrigin);
    authorControl?.addEventListener("change", onAuthor);
    return () => {
      kindControl?.removeEventListener("change", onKind);
      originControl?.removeEventListener("change", onOrigin);
      authorControl?.removeEventListener("change", onAuthor);
    };
  }, [onAuthorChange, onKindChange, onOriginChange]);

  return (
    <nav className="home-nav">
      <div className="app-nav-headers">
        <fig-header class="app-nav-header">
          <h2 className="app-title">Studio</h2>
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
            <fig-select
              ref={kindRef}
              class="app-nav-filter"
              aria-label="Filter by kind"
              value={kind}
              options={JSON.stringify([
                { value: "all", label: "All types" },
                { value: "effect", label: "Shader effects" },
                { value: "fill", label: "Shader fills" },
                { value: "composition", label: "Compositions" },
              ])}
              dangerouslySetInnerHTML={opaqueContent}
            />
            <fig-select
              ref={originRef}
              class="app-nav-filter"
              aria-label="Filter by source"
              value={origin}
              options={JSON.stringify([
                { value: "all", label: "All sources" },
                { value: "draft", label: "Drafts" },
                { value: "public", label: "Published" },
              ])}
              dangerouslySetInnerHTML={opaqueContent}
            />
            <fig-select
              ref={authorRef}
              class="app-nav-filter"
              aria-label="Filter by author"
              value={author}
              options={JSON.stringify([
                { value: "all", label: "All authors" },
                ...publishedAuthors,
              ])}
              disabled={publishedAuthors.length ? undefined : ""}
              dangerouslySetInnerHTML={opaqueContent}
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
