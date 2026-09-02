import "./Composer.css";

export default function ComposerView({
  viewerRef,
  visualizerRef,
  className,
  header,
  preview,
  properties,
}) {
  return (
    <main
      ref={viewerRef}
      className={["composer-viewer", className].filter(Boolean).join(" ")}
    >
      {header}
      <div className="composer-body">
        <div className="composer-stage">
          <section
            ref={visualizerRef}
            className="composer-preview shader-viewer-visualizer background--light"
          >
            {preview}
          </section>
        </div>
        {properties}
      </div>
    </main>
  );
}
