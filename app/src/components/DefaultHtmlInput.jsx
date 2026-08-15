import { useEffect, useRef, useState } from "react";
import defaultVideoUrl from "../assets/default-input.mp4";

const CHIPS = ["Layout", "Type", "Motion"];

/** Default DOM subject for effect shaders in HTML input mode. */
export default function DefaultHtmlInput() {
  const videoRef = useRef(null);
  const [selectedChip, setSelectedChip] = useState("Motion");

  // Keep the shader input live while the embedded video advances.
  useEffect(() => {
    const video = videoRef.current;
    const canvas = video?.closest("canvas");
    if (!video || typeof canvas?.requestPaint !== "function") return;

    let active = true;
    const paint = () => {
      if (!active) return;
      if (document.visibilityState !== "hidden") canvas.requestPaint();
      if (typeof video.requestVideoFrameCallback === "function") {
        video.requestVideoFrameCallback(paint);
      }
    };

    // Stop the sample video decoding while the tab is backgrounded, then
    // resume when it returns. The autoplay/loop element otherwise keeps
    // decoding frames even though requestPaint() is visibility-guarded.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        video.pause();
      } else {
        Promise.resolve(video.play()).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(paint);
      return () => {
        active = false;
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }

    const id = window.setInterval(() => {
      if (document.visibilityState !== "hidden") canvas.requestPaint();
    }, 1000 / 30);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="html-sample">
      <div className="html-sample-copy">
        <p className="html-sample-eyebrow">Live input</p>
        <h1 className="html-sample-title">HTML in Canvas</h1>
        <p className="html-sample-body">
          Real DOM, video, and CSS — rasterized natively, then run through your
          shader effect.
        </p>
        <div className="html-sample-row">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className={
                chip === selectedChip
                  ? "html-sample-chip is-selected"
                  : "html-sample-chip"
              }
              aria-pressed={chip === selectedChip}
              onClick={() => setSelectedChip(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="html-sample-actions">
          <button
            type="button"
            className="html-sample-button html-sample-button--primary"
          >
            Apply effect
          </button>
          <button
            type="button"
            className="html-sample-button html-sample-button--ghost"
          >
            Learn more
          </button>
        </div>
      </div>
      <div className="html-sample-media">
        <video
          ref={videoRef}
          className="html-sample-video"
          src={defaultVideoUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
        <div className="html-sample-media-caption">Embedded video</div>
      </div>
    </div>
  );
}
