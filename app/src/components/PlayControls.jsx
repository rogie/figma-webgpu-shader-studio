import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { readControlEventValue } from "./controls/controlValues.js";

const opaqueContent = { __html: "" };
const TIME_PRECISION = 1;

function secondsFromHost(host) {
  const ms = Math.max(0, Number(host?.frame?.time) || 0);
  return Number((ms / 1000).toFixed(TIME_PRECISION));
}

function isEditingTime(wheel) {
  return (
    wheel.hasAttribute("data-wheel-active") ||
    wheel.hasAttribute("data-dragging") ||
    Boolean(wheel.querySelector("fig-input-number:focus-within"))
  );
}

function PlayControls({ running, onTogglePlay, onSeek, hostRef }) {
  const wheelRef = useRef(null);
  const pointerActiveRef = useRef(false);
  const wasRunningRef = useRef(running);
  const didStampRef = useRef(false);
  const label = running ? "Pause" : "Play";

  const applyValue = useCallback(
    (event) => {
      if (event.target !== wheelRef.current) return;
      const next = Number(readControlEventValue(event));
      if (!Number.isFinite(next)) return;
      hostRef.current?.seek?.(Math.max(0, next) * 1000, {
        present: "frame",
      });
      onSeek?.();
    },
    [hostRef, onSeek]
  );

  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return undefined;

    const handlePointerDown = (event) => {
      if (event.composedPath?.().includes(wheel)) {
        pointerActiveRef.current = true;
      }
    };
    const handlePointerEnd = () => {
      pointerActiveRef.current = false;
    };
    wheel.addEventListener("input", applyValue);
    wheel.addEventListener("change", applyValue);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerEnd, true);
    window.addEventListener("pointercancel", handlePointerEnd, true);
    window.addEventListener("blur", handlePointerEnd);
    return () => {
      wheel.removeEventListener("input", applyValue);
      wheel.removeEventListener("change", applyValue);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerEnd, true);
      window.removeEventListener("pointercancel", handlePointerEnd, true);
      window.removeEventListener("blur", handlePointerEnd);
    };
  }, [applyValue]);

  useLayoutEffect(() => {
    const wheel = wheelRef.current;
    if (
      !wheel ||
      running ||
      pointerActiveRef.current ||
      isEditingTime(wheel)
    ) {
      wasRunningRef.current = running;
      return;
    }
    const shouldStamp = !didStampRef.current || wasRunningRef.current;
    wasRunningRef.current = running;
    didStampRef.current = true;
    if (!shouldStamp) return;
    wheel.spinTo(secondsFromHost(hostRef.current), { animateHandle: false });
  }, [hostRef, running]);

  useEffect(() => {
    if (!running) return undefined;
    const wheel = wheelRef.current;
    if (!wheel) return undefined;

    const sync = () => {
      if (pointerActiveRef.current || isEditingTime(wheel)) return;
      const next = secondsFromHost(hostRef.current);
      if (Number(wheel.value) === next) return;
      wheel.spinTo(next, { animateHandle: false });
    };

    let rafId = requestAnimationFrame(function loop() {
      sync();
      rafId = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(rafId);
  }, [hostRef, running]);

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
        <fig-input-slider-wheel
          ref={wheelRef}
          min="0"
          default="0"
          step="0.1"
          precision="1"
          aria-label="Time"
        >
          <fig-input-number
            variant="ghost"
            tabular=""
            min="0"
            default="0"
            step="0.1"
            precision="1"
            units="s"
            steppers="false"
            aria-label="Time in seconds"
            dangerouslySetInnerHTML={opaqueContent}
          />
        </fig-input-slider-wheel>
      </div>
    </div>
  );
}

export default memo(PlayControls);
