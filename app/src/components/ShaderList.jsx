import { forwardRef, memo, useEffect, useRef } from "react";
import "./ShaderList.css";
import ShaderListItem from "./ShaderListItem.jsx";

const ShaderList = forwardRef(function ShaderList(
  {
    cards,
    value,
    onPublish,
    onDelete,
    onChoice,
    className,
    layout = "list",
    showPreview = true,
    renderActions,
    drag = true,
  },
  ref
) {
  const innerRef = useRef(null);

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
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
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
            sublabel={card.description}
            layout={layout}
            showPreview={showPreview}
            figmaLinked={Boolean(card.figmaLinked)}
            actions={renderActions?.(card)}
            onPublish={
              card.canDelete
                ? (anchor) => onPublish?.(card, anchor)
                : undefined
            }
            onDelete={
              card.canDelete ? () => onDelete?.(card) : undefined
            }
          />
        );

        return (
          <fig-choice key={card.key} value={card.key} aria-label={card.name}>
            {item}
          </fig-choice>
        );
      })}
    </fig-chooser>
  );
});

export default memo(ShaderList);
