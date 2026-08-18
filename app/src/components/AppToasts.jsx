export default function AppToasts({
  videoExportToastRef,
  videoExportedToastRef,
  videoExportProgress,
  inputLoadingToastRef,
  noticeToastRef,
  notice,
  onNoticeClose,
  publishToastRef,
  publishToast,
  onPublishToastClose,
}) {
  return (
    <>
      <dialog
        is="fig-toast"
        ref={videoExportToastRef}
        class="video-export-toast"
        theme="dark"
        live="polite"
        duration="0"
        offset="24"
      >
        <fig-spinner aria-label="Exporting video" />
        <span>
          Exporting video…{" "}
          {Math.round((videoExportProgress?.progress || 0) * 100)}%
        </span>
      </dialog>
      <dialog
        is="fig-toast"
        ref={inputLoadingToastRef}
        class="input-loading-toast"
        theme="dark"
        live="polite"
        duration="0"
        offset="24"
      >
        <fig-spinner aria-label="Loading input" />
        <span>Loading input…</span>
      </dialog>
      <dialog
        is="fig-toast"
        ref={videoExportedToastRef}
        class="video-exported-toast"
        theme="brand"
        live="polite"
        duration="3200"
        offset="24"
        icon="checkmark"
      >
        <span>Video exported</span>
      </dialog>
      <dialog
        is="fig-toast"
        ref={noticeToastRef}
        class="notice-toast"
        theme={notice?.error ? "danger" : notice?.brand ? "brand" : "dark"}
        live={notice?.error ? "assertive" : "polite"}
        duration={notice?.error ? "0" : notice?.brand ? "5000" : "3200"}
        offset="24"
        dismiss={notice?.error ? "" : undefined}
        onClose={onNoticeClose}
      >
        <span>{notice?.message}</span>
      </dialog>
      <dialog
        is="fig-toast"
        ref={publishToastRef}
        class="publish-toast"
        theme="brand"
        duration="0"
        offset="24"
        onClose={onPublishToastClose}
      >
        {publishToast?.phase === "publishing" ? (
          <>
            <fig-spinner aria-label="Publishing" />
            <span>Publishing…</span>
          </>
        ) : publishToast?.phase === "done" ? (
          <span className="publish-toast-body">
            Published to{" "}
            <a href={publishToast.url} target="_blank" rel="noreferrer">
              community
            </a>
          </span>
        ) : null}
      </dialog>
    </>
  );
}
