export default function EmbedDialog({
  dialogRef,
  tabsRef,
  tab,
  code,
  onClose,
  onDownload,
  onCopy,
}) {
  return (
    <dialog
      is="fig-dialog"
      ref={dialogRef}
      class="embed-dialog"
      title="Embed"
      modal=""
      closedby="closerequest"
      position="center center"
      autoresize=""
      onClose={onClose}
      onCancel={onClose}
    >
      <fig-tabs
        ref={tabsRef}
        class="embed-tabs"
        name="embed-format"
        value={tab}
      >
        <fig-tab value="code">Code</fig-tab>
        <fig-tab value="iframe">iFrame</fig-tab>
      </fig-tabs>
      <fig-field>
        <textarea
          id="shader-embed-code"
          className="embed-code"
          value={code}
          readOnly
          rows="5"
          spellCheck="false"
          onFocus={(event) => event.currentTarget.select()}
        />
      </fig-field>
      <fig-footer borderless>
        <fig-button type="button" variant="secondary" onClick={onDownload}>
          Download
        </fig-button>
        <fig-button type="button" variant="primary" onClick={onCopy}>
          Copy
        </fig-button>
      </fig-footer>
    </dialog>
  );
}
