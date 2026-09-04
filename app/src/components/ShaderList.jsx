import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useFigMenuChange } from "../hooks/useFigMenuChange.js";
import { useOverflowFade } from "../hooks/useOverflowFade.js";
import { visibleLibrarySelection } from "../lib/shaderLibrary.js";
import "./ShaderList.css";
import ShaderListItem from "./ShaderListItem.jsx";

const ADD_LABELS = {
  composition: "Add composition",
  effect: "Add shader effect",
  fill: "Add shader fill",
};

function librarySections(cards) {
  const sections = [];
  for (const card of cards || []) {
    if (card.separatorLabel) {
      sections.push({
        key: card.key,
        label: card.separatorLabel,
        kind: card.separatorKind || null,
        cards: [],
      });
      continue;
    }
    if (!sections.length) {
      sections.push({ key: "section", label: null, kind: null, cards: [] });
    }
    sections[sections.length - 1].cards.push(card);
  }
  return sections.filter((section) => section.cards.length > 0);
}

const ShaderList = forwardRef(function ShaderList(
  {
    cards,
    value,
    onChoice,
    onAdd,
    className,
    layout = "list",
    showPreview = true,
    renderActions,
    onContextMenu,
    onThumbnailError,
    drag = true,
    emptyMessage = "No shaders found.",
    showEmptyCreate = false,
    onResetFilters,
  },
  ref
) {
  const innerRef = useRef(null);
  const bindRoot = useCallback(
    (node) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );
  const rootRef = useOverflowFade(bindRoot);
  const sections = useMemo(() => librarySections(cards), [cards]);
  const chooserValue = visibleLibrarySelection(cards, value);
  const chooserCardKeys = cards
    .filter((card) => card?.key && !card.separatorLabel)
    .map((card) => card.key)
    .join("\u0000");
  const previousCardKeysRef = useRef(chooserCardKeys);
  const grid = layout === "grid";
  const emptyCreateMenuRef = useFigMenuChange((kind) => {
    if (kind === "composition" || kind === "effect" || kind === "fill") {
      onAdd?.(kind);
    }
  });

  useLayoutEffect(() => {
    const root = innerRef.current;
    if (!root) return undefined;
    const visibleCardsChanged = previousCardKeysRef.current !== chooserCardKeys;
    previousCardKeysRef.current = chooserCardKeys;

    let selectedChoice = null;
    for (const chooser of root.querySelectorAll("fig-chooser")) {
      const match = chooser.choices?.find(
        (item) => item.getAttribute("value") === chooserValue,
      );
      if (match) {
        selectedChoice = match;
        if (chooser.selectedChoice !== match) chooser.selectedChoice = match;
      } else if (chooser.value !== "") {
        chooser.value = "";
      }
    }
    if (!visibleCardsChanged || !chooserValue || !selectedChoice) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      selectedChoice.scrollIntoView({
        behavior: "auto",
        block: "center",
        inline: "nearest",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [chooserCardKeys, chooserValue]);

  useEffect(() => {
    const root = innerRef.current;
    if (!root || !onChoice) return;
    const handleChange = (event) => {
      if (event.target?.localName !== "fig-chooser") return;
      if (typeof event.detail !== "string") return;
      onChoice(event.detail);
      event.target.scrollSelectionIntoView?.({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });
    };
    root.addEventListener("change", handleChange);
    return () => root.removeEventListener("change", handleChange);
  }, [onChoice]);

  return (
    <div
      ref={rootRef}
      className={className ? `shader-list ${className}` : "shader-list"}
      data-layout={grid ? "grid" : "list"}
    >
      {!sections.length ? (
        <div className="shader-list-empty">
          <p role="status">{emptyMessage}</p>
          {showEmptyCreate && onAdd ? (
            <fig-menu ref={emptyCreateMenuRef} position="bottom center">
              <fig-button
                fig-menu-trigger=""
                type="button"
                variant="secondary"
              >
                Create
              </fig-button>
              <fig-menu-item value="effect">Shader effect</fig-menu-item>
              <fig-menu-item value="fill">Shader fill</fig-menu-item>
              <fig-menu-item value="composition">Composition</fig-menu-item>
            </fig-menu>
          ) : onResetFilters ? (
            <fig-button
              type="button"
              variant="secondary"
              onClick={onResetFilters}
            >
              Reset filters
            </fig-button>
          ) : null}
        </div>
      ) : null}
      {sections.map((section) => {
        const sectionValue = visibleLibrarySelection(section.cards, value);
        const addLabel = section.kind ? ADD_LABELS[section.kind] : null;
        return (
          <section key={section.key} className="shader-list-section">
            {section.label ? (
              <fig-header class="shader-list-header" borderless="">
                <h3>{section.label}</h3>
                {onAdd && addLabel ? (
                  <fig-tooltip text={addLabel}>
                    <fig-button
                      class="shader-list-header-add"
                      type="button"
                      variant="ghost"
                      icon="true"
                      aria-label={addLabel}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onAdd(section.kind);
                      }}
                    >
                      <fig-icon name="add" />
                    </fig-button>
                  </fig-tooltip>
                ) : null}
              </fig-header>
            ) : null}
            {section.cards.length ? (
              <fig-chooser
                class="shader-list-chooser"
                value={sectionValue}
                layout={grid ? "grid" : "vertical"}
                columns={grid ? "2" : undefined}
                overflow="scrollbar"
                drag={drag ? "true" : "false"}
                loop=""
                auto-scroll="false"
                scroll-behavior="auto"
              >
                {section.cards.map((card) => {
                  const item = (
                    <ShaderListItem
                      src={card.thumbnailSmallUrl || card.thumbnailUrl}
                      label={card.name}
                      layout={layout}
                      showPreview={showPreview}
                      published={card.origin === "public"}
                      figmaLinked={Boolean(card.figmaLinked)}
                      actions={renderActions?.(card)}
                      onThumbnailError={() => onThumbnailError?.(card)}
                    />
                  );

                  return (
                    <fig-choice
                      key={card.key}
                      value={card.key}
                      selected={card.key === value ? "" : undefined}
                      aria-label={card.name}
                      onContextMenu={(event) => onContextMenu?.(card, event)}
                    >
                      {item}
                    </fig-choice>
                  );
                })}
              </fig-chooser>
            ) : null}
          </section>
        );
      })}
    </div>
  );
});

export default memo(ShaderList);
