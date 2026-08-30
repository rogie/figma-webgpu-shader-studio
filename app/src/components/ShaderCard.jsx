import { useEffect, useRef, useState } from "react";
import AnimatedIcon from "./AnimatedIcon.jsx";
import InteractiveIcon from "./InteractiveIcon.jsx";
import UserAvatar from "./UserAvatar.jsx";

export default function ShaderCard({
  src,
  label,
  sublabel,
  selected,
  size,
  published,
  authorName,
  authorAvatarUrl,
  onAuthorClick,
  isYou = false,
  showAvatar = true,
  showPublishedIcon = true,
  previewId,
  previewKind,
  previewRevision,
  animated = false,
  interactive = false,
}) {
  const [previewActive, setPreviewActive] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const cardRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const previewControllerRef = useRef(null);
  const previewActiveRef = useRef(previewActive);
  previewActiveRef.current = previewActive;

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !previewId || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        import("../embedPage.js")
          .then(({ prefetchEmbedPreview }) =>
            prefetchEmbedPreview({
              id: previewId,
              kind: previewKind,
              revision: previewRevision,
            }),
          )
          .catch(() => {});
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [previewId, previewKind, previewRevision]);

  useEffect(() => {
    if (!previewLoaded || !previewId || !previewCanvasRef.current) return;
    let disposed = false;
    import("../embedPage.js")
      .then(({ mountEmbedPreview }) =>
        mountEmbedPreview(
          {
            id: previewId,
            kind: previewKind,
            revision: previewRevision,
          },
          previewCanvasRef.current,
        ),
      )
      .then((controller) => {
        if (disposed) {
          controller?.destroy?.();
          return;
        }
        previewControllerRef.current = controller;
        controller?.setActive?.(previewActiveRef.current);
        setPreviewLoading(false);
        setPreviewReady(true);
      })
      .catch(() => {
        setPreviewActive(false);
        setPreviewLoaded(false);
        setPreviewLoading(false);
        setPreviewReady(false);
      });
    return () => {
      disposed = true;
      previewControllerRef.current?.destroy?.();
      previewControllerRef.current = null;
    };
  }, [previewId, previewKind, previewLoaded, previewRevision]);

  useEffect(() => {
    previewControllerRef.current?.setActive?.(previewActive);
  }, [previewActive]);

  const statusLabels = [
    previewLoading ? `Loading ${label} preview` : null,
    animated ? "Animated" : null,
    interactive ? "Interactive" : null,
    published && showPublishedIcon ? "Published" : null,
  ].filter(Boolean);
  const showStatus =
    statusLabels.length > 0 || (!published && Boolean(sublabel));

  return (
    <fig-card
      ref={cardRef}
      class={published ? "shader-card is-published" : "shader-card"}
      size={size}
      full=""
      {...(selected ? { selected: "" } : {})}
      onPointerEnter={() => {
        if (previewId) {
          if (!previewLoaded) setPreviewLoading(true);
          setPreviewLoaded(true);
          setPreviewActive(true);
        }
      }}
      onPointerLeave={() => setPreviewActive(false)}
    >
      <fig-preview class="shader-card-preview">
        {src && !previewReady && (
          <img
            className="shader-card-thumbnail"
            src={src}
            alt={label}
            loading="lazy"
            decoding="async"
          />
        )}
        {previewLoaded && previewId && (
          <canvas
            ref={previewCanvasRef}
            className="shader-card-preview-canvas"
            aria-label={`${label} interactive preview`}
          />
        )}
      </fig-preview>
      <fig-footer>
        <label className="fig-card-label">
          {showAvatar && (
            <UserAvatar
              tooltip={authorName || "Anon"}
              src={authorAvatarUrl}
              name={authorName || "Anon"}
              onClick={onAuthorClick}
              isYou={isYou}
            />
          )}
          <h3>{label}</h3>
        </label>
        {showStatus && (
          <label
            className="fig-card-sublabel"
            aria-label={statusLabels.join(", ") || undefined}
          >
            {previewLoading && (
              <fig-spinner
                size="small"
                aria-label={`Loading ${label} preview`}
              />
            )}
            {animated && (
              <fig-tooltip text="Animated">
                <AnimatedIcon />
              </fig-tooltip>
            )}
            {interactive && (
              <fig-tooltip text="Interactive">
                <InteractiveIcon />
              </fig-tooltip>
            )}
            {published && showPublishedIcon && (
              <fig-tooltip text="Published">
                <fig-icon name="globe" />
              </fig-tooltip>
            )}
            {!published && sublabel}
          </label>
        )}
      </fig-footer>
    </fig-card>
  );
}
