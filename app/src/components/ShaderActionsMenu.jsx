import { useFigMenuChange } from "../hooks/useFigMenuChange.js";

export default function ShaderActionsMenu({
  signedIn = false,
  owner = false,
  published = false,
  saving = false,
  saveDisabled = false,
  saveLabel = "Save",
  showDownload = true,
  showFigmaPush = false,
  position = "bottom right",
  triggerRef,
  onAction,
}) {
  const menuRef = useFigMenuChange((value) => onAction?.(value));

  return (
    <fig-menu
      ref={menuRef}
      key={signedIn ? "signed-in" : "signed-out"}
      position={position}
    >
      <fig-tooltip text="More">
        <fig-button
          ref={triggerRef}
          fig-menu-trigger=""
          variant="ghost"
          icon="true"
          aria-label="More shader actions"
        >
          <fig-icon name="more" />
        </fig-button>
      </fig-tooltip>
      <fig-menu-item value="rename">Rename</fig-menu-item>
      <fig-menu-item value="save" disabled={saveDisabled ? "" : undefined}>
        {saveLabel}
      </fig-menu-item>
      <fig-separator />
      {signedIn && (
        <fig-menu-item value="publish" disabled={saving ? "" : undefined}>
          {published ? "Publish update" : "Publish…"}
        </fig-menu-item>
      )}
      {owner && published && (
        <fig-menu-item value="unpublish" disabled={saving ? "" : undefined}>
          Unpublish
        </fig-menu-item>
      )}
      <fig-menu-item value="share">Copy link</fig-menu-item>
      <fig-separator />
      <fig-menu-item value="duplicate">Duplicate</fig-menu-item>
      {owner && <fig-menu-item value="delete">Delete</fig-menu-item>}
      {(showDownload || showFigmaPush) && <fig-separator />}
      {showDownload && (
        <fig-menu-item value="export">Download</fig-menu-item>
      )}
      {showFigmaPush && (
        <fig-menu-item
          value="push-figma"
          disabled=""
          title="Figma has not shipped create/update for the custom shader library yet."
        >
          Push to Figma (soon)
        </fig-menu-item>
      )}
    </fig-menu>
  );
}
