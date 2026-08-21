import "./Composer.css";

export default function Composer({ header, properties, visualizerRef, children }) {
  return (
    <div className="composer">
      <div className="composer-stage">
        {header}
        <section
          ref={visualizerRef}
          className="composer-preview shader-viewer-visualizer background--light"
        >
          {children}
        </section>
      </div>
      {properties}
    </div>
  );
}
