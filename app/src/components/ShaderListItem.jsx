import { memo } from "react";
import { useFigMenuChange } from "../hooks/useFigMenuChange.js";
import FigmaIcon from "./FigmaIcon.jsx";
import "./ShaderListItem.css";

const opaqueContent = { __html: "" };

function ShaderListItem({
  src,
  label,
  sublabel,
  layout = "list",
  showPreview = true,
  figmaLinked = false,
  actions,
  onPublish,
  onDelete,
}) {
  const menuRef = useFigMenuChange((value, menu) => {
    if (value === "publish") {
      onPublish?.(menu.closest("fig-choice"));
      return;
    }
    if (value === "delete") onDelete?.();
  });

  const menu = (actions || onDelete) && (
    <div className="shader-list-item-actions">
      {actions}
      {onDelete && (
        <fig-menu
          ref={menuRef}
          class="shader-list-item-menu"
          position="bottom right"
        >
          <fig-button
            fig-menu-trigger=""
            variant="ghost"
            icon="true"
            aria-label={`More actions for ${label}`}
          >
            <fig-icon name="more" />
          </fig-button>
          <fig-menu-item value="publish">
            Publish
          </fig-menu-item>
          <fig-separator />
          <fig-menu-item value="delete">Delete</fig-menu-item>
        </fig-menu>
      )}
    </div>
  );

  if (layout === "grid") {
    return (
      <fig-card
        src={showPreview ? src || undefined : undefined}
        label={label}
        alt={label}
        dangerouslySetInnerHTML={opaqueContent}
      />
    );
  }

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
      {menu}
    </div>
  );
}

export default memo(ShaderListItem);
