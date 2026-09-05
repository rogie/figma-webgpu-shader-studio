import { useEffect, useState } from "react";
import "./Composer.css";

function isWindowFocused() {
  return document.visibilityState !== "hidden" && document.hasFocus();
}

export default function ComposerView({
  viewerRef,
  visualizerRef,
  className,
  header,
  preview,
  properties,
}) {
  const isViewPage = /\bshader-view-page\b/.test(className ?? "");
  const [windowFocused, setWindowFocused] = useState(isWindowFocused);

  useEffect(() => {
    if (!isViewPage) return undefined;
    const sync = () => setWindowFocused(isWindowFocused());
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [isViewPage]);

  return (
    <main
      ref={viewerRef}
      className={[
        "composer-viewer",
        className,
        isViewPage && !windowFocused ? "is-window-blurred" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="composer-body">
        <div className="composer-stage">
          {header}
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
