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
  published = false,
  figmaLinked = false,
  actions,
  onThumbnailError,
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
          loading="lazy"
          decoding="async"
          onErrorCapture={onThumbnailError}
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
    <fig-card class="shader-list-item" direction="horizontal">
      {showPreview && (
        <fig-image
          src={src || undefined}
          alt={label}
          fit="contain"
          aspect-ratio="1/1"
          loading="lazy"
          decoding="async"
          onErrorCapture={onThumbnailError}
          dangerouslySetInnerHTML={opaqueContent}
        />
      )}
      <fig-footer>
        <label className="fig-card-label">{label}</label>
        {sublabel && (
          <label className="fig-card-sublabel">{sublabel}</label>
        )}
      </fig-footer>
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
    </fig-card>
  );
}

export default memo(ShaderListItem);
