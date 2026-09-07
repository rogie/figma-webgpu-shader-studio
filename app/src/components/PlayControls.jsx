import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { readPropskitSliderNumber } from "./controls/controlValues.js";

const opaqueContent = { __html: "" };
const TIME_PRECISION = 1;

function secondsFromHost(host) {
  const ms = Math.max(0, Number(host?.frame?.time) || 0);
  return Number((ms / 1000).toFixed(TIME_PRECISION));
}

function hasWheelDragState(wheel) {
  return (
    wheel.hasAttribute("data-propskit-wheel-elastic-dragging") ||
    wheel.hasAttribute("data-number-scrubbing")
  );
}

function PlayControls({ running, onTogglePlay, onSeek, hostRef }) {
  const wheelRef = useRef(null);
  const pointerActiveRef = useRef(false);
  const numberEditingRef = useRef(false);
  const wasRunningRef = useRef(running);
  const didStampRef = useRef(false);
  const label = running ? "Pause" : "Play";

  const applyValue = useCallback(
    (event) => {
      const next = readPropskitSliderNumber(event);
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
    const handleFocusIn = (event) => {
      if (event.target instanceof Element && event.target.closest("fig-input-number")) {
        numberEditingRef.current = true;
      }
    };
    const handleFocusOut = () => {
      requestAnimationFrame(() => {
        const node = wheelRef.current;
        numberEditingRef.current = Boolean(
          node?.querySelector("fig-input-number:focus-within")
        );
      });
    };

    wheel.addEventListener("change", applyValue);
    wheel.addEventListener("focusin", handleFocusIn);
    wheel.addEventListener("focusout", handleFocusOut);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerEnd, true);
    window.addEventListener("pointercancel", handlePointerEnd, true);
    return () => {
      wheel.removeEventListener("change", applyValue);
      wheel.removeEventListener("focusin", handleFocusIn);
      wheel.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerEnd, true);
      window.removeEventListener("pointercancel", handlePointerEnd, true);
    };
  }, [applyValue]);

  useLayoutEffect(() => {
    const wheel = wheelRef.current;
    if (
      !wheel ||
      running ||
      pointerActiveRef.current ||
      numberEditingRef.current ||
      hasWheelDragState(wheel)
    ) {
      wasRunningRef.current = running;
      return;
    }
    const shouldStamp = !didStampRef.current || wasRunningRef.current;
    wasRunningRef.current = running;
    didStampRef.current = true;
    if (!shouldStamp) return;
    wheel.setAttribute("value", String(secondsFromHost(hostRef.current)));
  }, [hostRef, running]);

  useEffect(() => {
    if (!running) return undefined;
    const wheel = wheelRef.current;
    if (!wheel) return undefined;

    const sync = () => {
      if (
        pointerActiveRef.current ||
        numberEditingRef.current ||
        hasWheelDragState(wheel)
      ) {
        return;
      }
      const next = String(secondsFromHost(hostRef.current));
      if (wheel.getAttribute("value") === next) return;
      wheel.setAttribute("value", next);
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
        <propskit-wheel
          ref={wheelRef}
          label=""
          units="seconds"
          min="0"
          default="0"
          step="0.1"
          precision="1"
          elastic="false"
          aria-label="Time"
          spin={running ? "false" : "true"}
          onInput={applyValue}
          dangerouslySetInnerHTML={opaqueContent}
        />
      </div>
    </div>
  );
}

export default memo(PlayControls);
