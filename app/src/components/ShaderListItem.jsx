import { memo } from "react";
import FigmaIcon from "./FigmaIcon.jsx";
import "./ShaderListItem.css";

const opaqueContent = { __html: "" };

function ShaderListItem({
  src,
  label,
  sublabel,
  layout = "list",
  showPreview = true,
  selected = false,
  published = false,
  figmaLinked = false,
  actions,
}) {
  if (layout === "grid") {
    const previewSrc = showPreview && src ? src : undefined;
    const selectedAttr = selected ? { selected: "" } : {};
    if (previewSrc) {
      return (
        <fig-card
          src={previewSrc}
          label={label}
          alt={label}
          aspect-ratio="1/1"
          dangerouslySetInnerHTML={opaqueContent}
          {...selectedAttr}
        />
      );
    }
    return (
      <fig-card label={label} alt={label} aspect-ratio="1/1" {...selectedAttr}>
        <fig-preview aspect-ratio="1/1" />
      </fig-card>
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
      {(published || figmaLinked) && (
        <div className="shader-list-item-status">
          {figmaLinked && (
            <fig-tooltip text="Figma shader">
              <FigmaIcon size="small" color="tertiary" />
            </fig-tooltip>
          )}
          {published && (
            <fig-tooltip text="Published">
              <fig-icon name="globe" size="small" color="tertiary" />
            </fig-tooltip>
          )}
        </div>
      )}
      {actions ? (
        <div className="shader-list-item-actions">{actions}</div>
      ) : null}
    </div>
  );
}

export default memo(ShaderListItem);
