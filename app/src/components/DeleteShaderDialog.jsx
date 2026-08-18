export default function DeleteShaderDialog({
  dialogRef,
  name,
  deleting,
  onCancel,
  onConfirm,
}) {
  return (
    <dialog
      is="fig-dialog"
      ref={dialogRef}
      class="delete-shader-dialog"
      title="Delete shader"
      modal=""
      closedby="closerequest"
      position="center center"
      autoresize=""
    >
      <fig-content padding>
        <p>
          Delete “{name || "this shader"}”? This action cannot be undone.
        </p>
      </fig-content>
      <fig-footer>
        <fig-button
          type="button"
          variant="secondary"
          disabled={deleting ? "" : undefined}
          onClick={onCancel}
        >
          Cancel
        </fig-button>
        <fig-button
          type="button"
          variant="destructive"
          disabled={deleting ? "" : undefined}
          onClick={onConfirm}
        >
          {deleting ? "Deleting…" : "Delete"}
        </fig-button>
      </fig-footer>
    </dialog>
  );
}
