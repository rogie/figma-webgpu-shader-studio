import { useFigMenuChange } from "../hooks/useFigMenuChange.js";

const KIND_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "effect", label: "Shader effects" },
  { value: "fill", label: "Shader fills" },
  { value: "composition", label: "Compositions" },
];

function FilterMenuItem({ value, checked, children }) {
  return (
    <fig-menu-item
      value={value}
      role="menuitemradio"
      aria-checked={checked ? "true" : "false"}
    >
      <fig-icon
        slot="prepend"
        name="checkmark"
        aria-hidden="true"
        style={{ visibility: checked ? "visible" : "hidden" }}
      />
      {children}
    </fig-menu-item>
  );
}

export default function LibraryFilterMenu({
  kind = "all",
  onKindChange,
  author = "all",
  onAuthorChange,
  origin = "all",
  onOriginChange,
  authors = [],
  showAuthors = true,
  showOrigin = true,
  view = null,
  onViewChange,
}) {
  const filtersActive =
    kind !== "all" ||
    (showAuthors && author !== "all") ||
    (showOrigin && origin !== "all");

  const onMenuChange = useFigMenuChange((value) => {
    const colon = value.indexOf(":");
    if (colon <= 0) return;
    const group = value.slice(0, colon);
    const next = value.slice(colon + 1) || "all";
    if (group === "kind") onKindChange?.(next);
    else if (group === "author") onAuthorChange?.(next);
    else if (group === "origin") onOriginChange?.(next);
    else if (group === "view") onViewChange?.(next);
  });

  return (
    <fig-menu ref={onMenuChange} position="bottom right">
      <fig-tooltip text="Filter">
        <fig-button
          fig-menu-trigger=""
          type="button"
          variant="ghost"
          icon="true"
          selected={filtersActive ? "" : undefined}
          aria-pressed={filtersActive ? "true" : "false"}
          aria-label="Filter library"
        >
          <fig-icon name="adjust" />
        </fig-button>
      </fig-tooltip>
      <fig-separator label="Types" />
      {KIND_OPTIONS.map((option) => (
        <FilterMenuItem
          key={option.value}
          value={`kind:${option.value}`}
          checked={kind === option.value}
        >
          {option.label}
        </FilterMenuItem>
      ))}
      {showAuthors && (
        <>
          <fig-separator label="Authors" />
          <FilterMenuItem value="author:all" checked={author === "all"}>
            All authors
          </FilterMenuItem>
          {authors.map((option) => (
            <FilterMenuItem
              key={option.value}
              value={`author:${option.value}`}
              checked={author === option.value}
            >
              {option.label}
            </FilterMenuItem>
          ))}
        </>
      )}
      {showOrigin && (
        <>
          <fig-separator label="Published" />
          <FilterMenuItem value="origin:all" checked={origin === "all"}>
            All
          </FilterMenuItem>
          <FilterMenuItem value="origin:draft" checked={origin === "draft"}>
            Drafts
          </FilterMenuItem>
          <FilterMenuItem
            value="origin:public"
            checked={origin === "public"}
          >
            Published
          </FilterMenuItem>
        </>
      )}
      {view && onViewChange && (
        <>
          <fig-separator label="View options" />
          <FilterMenuItem value="view:grid" checked={view === "grid"}>
            Grid
          </FilterMenuItem>
          <FilterMenuItem value="view:list" checked={view === "list"}>
            List
          </FilterMenuItem>
        </>
      )}
    </fig-menu>
  );
}
