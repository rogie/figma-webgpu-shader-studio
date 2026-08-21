import { useCallback } from "react";
import { useFigMenuChange } from "../hooks/useFigMenuChange.js";
import FilterFilledIcon from "./FilterFilledIcon.jsx";
import FilterIcon from "./FilterIcon.jsx";
import "./LibraryFilterMenu.css";

const KIND_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "effect", label: "Shader effects" },
  { value: "fill", label: "Shader fills" },
  { value: "composition", label: "Compositions" },
];

function FilterMenuItem({ value, checked, children }) {
  return (
    <fig-menu-item value={value} selected={checked ? "" : undefined}>
      <fig-icon
        name="checkmark"
        size="small"
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
}) {
  const filtersActive =
    kind !== "all" || author !== "all" || origin !== "all";

  const onMenuChange = useFigMenuChange((value) => {
    const colon = value.indexOf(":");
    if (colon <= 0) return;
    const group = value.slice(0, colon);
    const next = value.slice(colon + 1) || "all";
    if (group === "kind") onKindChange?.(next);
    else if (group === "author") onAuthorChange?.(next);
    else if (group === "origin") onOriginChange?.(next);
  });

  const menuRef = useCallback(
    (node) => {
      onMenuChange(node);
      const items = node?.shadowRoot?.querySelector(".fig-menu-items");
      if (items) items.style.marginTop = "0";
    },
    [onMenuChange]
  );

  return (
    <fig-menu ref={menuRef} class="library-filter-menu" position="bottom right">
      <fig-tooltip text="Filter">
        <fig-button
          fig-menu-trigger=""
          variant="ghost"
          icon="true"
          selected={filtersActive ? "" : undefined}
          aria-pressed={filtersActive ? "true" : "false"}
          aria-label="Filter library"
        >
          {filtersActive ? <FilterFilledIcon /> : <FilterIcon />}
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
    </fig-menu>
  );
}
