import { memo } from "react";
import "./ShaderListItem.css";

const opaqueContent = { __html: "" };

function ShaderListItem({
  src,
  label,
  onPublish,
  onDelete,
}) {
  return (
    <div className="shader-list-item">
      <fig-image
        class="shader-list-item-preview"
        src={src || undefined}
        alt={label}
        fit="contain"
        aspect-ratio="1/1"
        dangerouslySetInnerHTML={opaqueContent}
      />
      <div className="shader-list-item-text">
        <label className="shader-list-item-label">{label}</label>
      </div>
      {onDelete && (
        <div className="shader-list-item-actions">
          <fig-menu class="shader-list-item-menu" position="bottom right">
            <fig-button
              fig-menu-trigger=""
              variant="ghost"
              icon="true"
              aria-label={`More actions for ${label}`}
            >
              <fig-icon name="more" />
            </fig-button>
            <fig-menu-item
              value="publish"
              onClick={(event) =>
                onPublish?.(event.currentTarget.closest("fig-choice"))
              }
            >
              Publish
            </fig-menu-item>
            <fig-separator />
            <fig-menu-item value="delete" onClick={onDelete}>
              Delete
            </fig-menu-item>
          </fig-menu>
        </div>
      )}
    </div>
  );
}

export default memo(ShaderListItem);
