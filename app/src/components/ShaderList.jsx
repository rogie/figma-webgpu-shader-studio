import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { useOverflowFade } from "../hooks/useOverflowFade.js";
import { visibleLibrarySelection } from "../lib/shaderLibrary.js";
import "./ShaderList.css";
import ShaderListItem from "./ShaderListItem.jsx";

const ShaderList = forwardRef(function ShaderList(
  {
    cards,
    value,
    onChoice,
    className,
    layout = "list",
    showPreview = true,
    renderActions,
    onContextMenu,
    drag = true,
  },
  ref
) {
  const innerRef = useRef(null);
  const bindChooser = useCallback(
    (node) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );
  const chooserRef = useOverflowFade(bindChooser);
  const chooserValue = visibleLibrarySelection(cards, value);
  const chooserCardKeys = cards
    .filter((card) => card?.key && !card.separatorLabel)
    .map((card) => card.key)
    .join("\u0000");
  const previousCardKeysRef = useRef(chooserCardKeys);

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return undefined;
    const visibleCardsChanged = previousCardKeysRef.current !== chooserCardKeys;
    previousCardKeysRef.current = chooserCardKeys;

    const selectedChoice = node.choices?.find(
      (item) => item.getAttribute("value") === chooserValue,
    );
    if (selectedChoice && node.selectedChoice !== selectedChoice) {
      node.selectedChoice = selectedChoice;
    } else if (!selectedChoice && node.value !== "") {
      node.value = chooserValue;
    }
    if (!visibleCardsChanged || !chooserValue) return undefined;

    const frame = requestAnimationFrame(() => {
      node.scrollSelectionIntoView?.({
        behavior: "auto",
        block: "center",
        inline: "center",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [chooserCardKeys, chooserValue]);

  useEffect(() => {
    const node = innerRef.current;
    if (!node || !onChoice) return;
    const handleChange = (event) => {
      if (typeof event.detail !== "string") return;
      onChoice(event.detail);
      node.scrollSelectionIntoView?.({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });
    };
    node.addEventListener("change", handleChange);
    return () => node.removeEventListener("change", handleChange);
  }, [onChoice]);

  return (
    <fig-chooser
      ref={chooserRef}
      class={className ? `shader-list ${className}` : "shader-list"}
      value={chooserValue}
      layout={layout === "grid" ? "grid" : "vertical"}
      columns={layout === "grid" ? "2" : undefined}
      overflow="scrollbar"
      drag={drag ? "true" : undefined}
      loop=""
      auto-scroll="false"
      scroll-behavior="auto"
    >
      {cards.map((card) => {
        if (card.separatorLabel) {
          return (
            <fig-separator
              key={card.key}
              label={card.separatorLabel}
              sticky=""
            />
          );
        }

        const item = (
          <ShaderListItem
            src={card.thumbnailUrl}
            label={card.name}
            layout={layout}
            showPreview={showPreview}
            selected={card.key === value}
            published={card.origin === "public"}
            figmaLinked={Boolean(card.figmaLinked)}
            actions={renderActions?.(card)}
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
  );
});

export default memo(ShaderList);
