import { memo } from "react";
import FigmaIcon from "./FigmaIcon.jsx";
import "./ShaderListItem.css";

const opaqueContent = { __html: "" };

function ShaderListItem({
  src,
  label,
  sublabel,
  showPreview = true,
  figmaLinked = false,
  actions,
  onPublish,
  onDelete,
}) {
  return (
    <div className="shader-list-item">
      {showPreview && (
        <fig-image
          class="shader-list-item-preview"
          src={src || undefined}
          alt={label}
          fit="contain"
          aspect-ratio="1/1"
          dangerouslySetInnerHTML={opaqueContent}
        />
      )}
      <div className="shader-list-item-text">
        <label className="shader-list-item-label">{label}</label>
        {sublabel && (
          <span className="shader-list-item-sublabel">{sublabel}</span>
        )}
      </div>
      {figmaLinked && (
        <fig-tooltip text="Figma shader">
          <FigmaIcon class="shader-list-item-figma" />
        </fig-tooltip>
      )}
      {(actions || onDelete) && (
        <div className="shader-list-item-actions">
          {actions}
          {onDelete && (
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
          )}
        </div>
      )}
    </div>
  );
}

export default memo(ShaderListItem);
