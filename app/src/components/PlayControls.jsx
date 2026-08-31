import { useEffect, useRef } from "react";
import { readPropskitSliderNumber } from "./controls/controlValues.js";

const opaqueContent = { __html: "" };
const TIME_PRECISION = 0;

function secondsFromHost(host) {
  const ms = Number(host?.frame?.time) || 0;
  return Number((ms / 1000).toFixed(TIME_PRECISION));
}

function isWheelBusy(wheel) {
  return (
    wheel.matches(":focus-within") ||
    wheel.hasAttribute("data-propskit-wheel-elastic-dragging") ||
    wheel.hasAttribute("data-number-scrubbing")
  );
}

export default function PlayControls({ running, onTogglePlay, hostRef }) {
  const wheelRef = useRef(null);
  const draggingRef = useRef(false);
  const label = running ? "Pause" : "Play";

  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return undefined;

    const applySeconds = (event) => {
      const next = readPropskitSliderNumber(event);
      if (!Number.isFinite(next)) return;
      hostRef.current?.seek?.(Math.max(0, next) * 1000);
    };
    const handleInput = (event) => {
      draggingRef.current = true;
      applySeconds(event);
    };
    const handleChange = (event) => {
      draggingRef.current = false;
      applySeconds(event);
    };
    const endDrag = () => {
      draggingRef.current = false;
    };

    wheel.addEventListener("input", handleInput);
    wheel.addEventListener("change", handleChange);
    wheel.addEventListener("pointerup", endDrag);
    wheel.addEventListener("pointercancel", endDrag);
    return () => {
      wheel.removeEventListener("input", handleInput);
      wheel.removeEventListener("change", handleChange);
      wheel.removeEventListener("pointerup", endDrag);
      wheel.removeEventListener("pointercancel", endDrag);
    };
  }, [hostRef]);

  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return undefined;

    const sync = () => {
      if (draggingRef.current || isWheelBusy(wheel)) return;
      const next = String(secondsFromHost(hostRef.current));
      if (wheel.getAttribute("value") === next) return;
      wheel.setAttribute("value", next);
    };

    sync();
    let rafId = requestAnimationFrame(function loop() {
      sync();
      rafId = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(rafId);
  }, [hostRef]);

  return (
    <div className="play-controls">
      <fig-tooltip text={label}>
        <fig-button
          type="toggle"
          variant="ghost"
          icon="true"
          selected={running}
          aria-label={label}
          onClick={onTogglePlay}
        >
          <fig-icon name={running ? "pause" : "play"} />
        </fig-button>
      </fig-tooltip>
      <div className="play-controls-time">
        <propskit-wheel
          ref={wheelRef}
          label=""
          units="seconds"
          min="0"
          default="0"
          precision="0"
          size="small"
          aria-label="Time"
          spin={running ? "false" : "true"}
          disabled={running ? "" : undefined}
          dangerouslySetInnerHTML={opaqueContent}
        />
      </div>
    </div>
  );
}
