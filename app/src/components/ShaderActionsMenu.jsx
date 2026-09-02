import { useCallback } from "react";
import { useFigMenuChange } from "../hooks/useFigMenuChange.js";
import { figmaShaderActionLabel } from "../lib/figmaShaderSync.js";

export default function ShaderActionsMenu({
  signedIn = false,
  owner = false,
  published = false,
  saving = false,
  saveDisabled = false,
  saveLabel = "Save",
  showDownload = true,
  showFigmaPush = false,
  figmaLinked = false,
  figmaKind = "effect",
  figmaSyncing = false,
  figmaPushBlocked = false,
  showRename = true,
  showSave = true,
  showTrigger = true,
  position = "bottom right",
  triggerRef,
  menuRef,
  onAction,
}) {
  const changeRef = useFigMenuChange((value, menu) =>
    onAction?.(value, menu)
  );
  const bindMenu = useCallback(
    (node) => {
      changeRef(node);
      if (typeof menuRef === "function") menuRef(node);
      else if (menuRef) menuRef.current = node;
    },
    [changeRef, menuRef]
  );

  return (
    <fig-menu
      ref={bindMenu}
      position={position}
    >
      {showTrigger && (
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
      )}
      {showRename && <fig-menu-item value="rename">Rename</fig-menu-item>}
      {showSave && (
        <fig-menu-item value="save" disabled={saveDisabled ? "" : undefined}>
          {saveLabel}
        </fig-menu-item>
      )}
      {(showRename || showSave) && <fig-separator />}
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
      {showDownload && <fig-separator />}
      {showDownload && (
        <fig-menu-item value="export">Download</fig-menu-item>
      )}
      {showFigmaPush && (
        <>
          <fig-separator label="Figma" />
          <fig-menu-item
            value="sync-figma"
            disabled={figmaSyncing || figmaPushBlocked ? "" : undefined}
          >
            {figmaPushBlocked
              ? "Can't push audio shaders"
              : figmaShaderActionLabel({
                  linked: figmaLinked,
                  kind: figmaKind,
                })}
          </fig-menu-item>
        </>
      )}
    </fig-menu>
  );
}
