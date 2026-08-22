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
  figmaLinked = false,
  actions,
}) {
  if (layout === "grid") {
    const previewSrc = showPreview && src ? src : undefined;
    if (previewSrc) {
      return (
        <fig-card
          src={previewSrc}
          label={label}
          alt={label}
          aspect-ratio="1/1"
          dangerouslySetInnerHTML={opaqueContent}
        />
      );
    }
    return (
      <fig-card label={label} alt={label} aspect-ratio="1/1">
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
      {figmaLinked && (
        <fig-tooltip text="Figma shader">
          <FigmaIcon class="shader-list-item-figma" />
        </fig-tooltip>
      )}
      {actions ? (
        <div className="shader-list-item-actions">{actions}</div>
      ) : null}
    </div>
  );
}

export default memo(ShaderListItem);
