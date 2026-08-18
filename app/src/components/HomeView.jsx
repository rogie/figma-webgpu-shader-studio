import AccountMenu from "./AccountMenu.jsx";

const opaqueContent = { __html: "" };

export default function HomeView({
  chooserRef,
  kindRef,
  originRef,
  authorRef,
  query,
  onQueryChange,
  kind,
  origin,
  author,
  publishedAuthors,
  choices,
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
                { value: "all", label: "Types" },
                { value: "effect", label: "Effects" },
                { value: "fill", label: "Fills" },
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
                { value: "all", label: "Author" },
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
