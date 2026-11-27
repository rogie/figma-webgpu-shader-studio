import "./ShaderView.css";

export default function ShaderView({
  viewerRef,
  sidebarRef,
  visualizerRef,
  style,
  codeCollapsed = false,
  chatCollapsed = false,
  toolsSideBySide,
  showChat,
  previewHeight,
  minPreviewHeight,
  sidebar,
  preview,
  properties,
  onResizePreview,
  onResetPreviewSize,
  onKeyResizePreview,
  propertiesWidth,
  minPropertiesWidth,
  maxPropertiesWidth,
  onResizeProperties,
  onResetPropertiesSize,
  onKeyResizeProperties,
}) {
  return (
    <main
      ref={viewerRef}
      className="shader-viewer"
      data-layout={sidebar ? undefined : "composition"}
      data-tools-layout={sidebar && (showChat ? (toolsSideBySide ? "columns" : "rows") : "code-only")}
      style={style}
    >
      {sidebar && (
        <>
          <div
            ref={sidebarRef}
            className="shader-viewer-sidebar"
            data-code-collapsed={codeCollapsed ? "true" : "false"}
            data-chat-collapsed={chatCollapsed ? "true" : "false"}
          >
            {sidebar}
          </div>

          <div
            className="pane-resizer shader-preview-resizer"
            role="separator"
            aria-label="Resize code and preview panes"
            aria-orientation="horizontal"
            aria-valuemin={minPreviewHeight}
            aria-valuenow={previewHeight ?? undefined}
            tabIndex={0}
            onPointerDown={onResizePreview}
            onDoubleClick={onResetPreviewSize}
            onKeyDown={onKeyResizePreview}
          />
        </>
      )}

      <section
        ref={visualizerRef}
        className="shader-preview shader-viewer-visualizer background--light"
      >
        {preview}
      </section>

      <div
        className="pane-resizer shader-properties-resizer"
        role="separator"
        aria-label="Resize shader properties"
        aria-orientation="vertical"
        aria-valuemin={minPropertiesWidth}
        aria-valuemax={maxPropertiesWidth}
        aria-valuenow={propertiesWidth}
        tabIndex={0}
        onPointerDown={onResizeProperties}
        onDoubleClick={onResetPropertiesSize}
        onKeyDown={onKeyResizeProperties}
      />
      {properties}
    </main>
  );
}
