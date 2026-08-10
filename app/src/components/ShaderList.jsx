import { forwardRef } from "react";
import "./ShaderList.css";
import ShaderListItem from "./ShaderListItem.jsx";

const ShaderList = forwardRef(function ShaderList(
  { cards, value, onPublish, onDelete },
  ref
) {
  return (
    <fig-chooser
      ref={ref}
      class="shader-list"
      value={value}
      layout="vertical"
      overflow="scrollbar"
      drag="true"
      loop=""
    >
      {cards.map((card) => {
        if (card.separatorLabel) {
          return <fig-separator key={card.key} label={card.separatorLabel} />;
        }

        const item = (
          <ShaderListItem
            src={card.thumbnailUrl}
            label={card.name}
            authorName={card.authorName || card.authorLabel}
            published={card.origin === "public"}
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

export default ShaderList;
