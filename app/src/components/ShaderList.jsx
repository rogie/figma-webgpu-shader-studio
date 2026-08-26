import { forwardRef, memo, useCallback, useEffect, useRef } from "react";
import { useOverflowFade } from "../hooks/useOverflowFade.js";
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

  useEffect(() => {
    const node = innerRef.current;
    if (!node || !onChoice) return;
    const handleChange = (event) => {
      if (typeof event.detail === "string") onChoice(event.detail);
    };
    node.addEventListener("change", handleChange);
    return () => node.removeEventListener("change", handleChange);
  }, [onChoice]);

  return (
    <fig-chooser
      ref={chooserRef}
      class={className ? `shader-list ${className}` : "shader-list"}
      value={value}
      layout={layout === "grid" ? "grid" : "vertical"}
      columns={layout === "grid" ? "2" : undefined}
      overflow="scrollbar"
      drag={drag ? "true" : undefined}
      loop=""
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
