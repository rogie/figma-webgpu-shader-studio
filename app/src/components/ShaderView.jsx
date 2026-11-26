import "./ShaderView.css";

export default function ShaderView({
  viewerRef,
  sidebarRef,
  visualizerRef,
  style,
  codeCollapsed = false,
  chatCollapsed = false,
  stacked = false,
  codeWidth,
  previewHeight,
  minCodeWidth,
  minPreviewHeight,
  sidebar,
  preview,
  properties,
  onResizeCode,
  onResetCodeSize,
  onKeyResizeCode,
}) {
  return (
    <main ref={viewerRef} className="shader-viewer" style={style}>
      <div
        ref={sidebarRef}
        className="shader-viewer-sidebar"
        data-code-collapsed={codeCollapsed ? "true" : "false"}
        data-chat-collapsed={chatCollapsed ? "true" : "false"}
      >
        {sidebar}
      </div>

      <div
        className="pane-resizer"
        role="separator"
        aria-label="Resize code and preview panes"
        aria-orientation={stacked ? "horizontal" : "vertical"}
        aria-valuemin={stacked ? minPreviewHeight : minCodeWidth}
        aria-valuenow={stacked ? previewHeight ?? undefined : codeWidth}
        tabIndex={0}
        onPointerDown={onResizeCode}
        onDoubleClick={onResetCodeSize}
        onKeyDown={onKeyResizeCode}
      />

      <section
        ref={visualizerRef}
        className="shader-preview shader-viewer-visualizer background--light"
      >
        {preview}
      </section>

      {properties}
    </main>
  );
}
