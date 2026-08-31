import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { readPropskitSliderNumber } from "./controls/controlValues.js";

const opaqueContent = { __html: "" };
const TIME_PRECISION = 1;

function secondsFromHost(host) {
  const ms = Math.max(0, Number(host?.frame?.time) || 0);
  return Number((ms / 1000).toFixed(TIME_PRECISION));
}

function isWheelBusy(wheel) {
  return (
    wheel.matches(":focus-within") ||
    wheel.hasAttribute("data-propskit-wheel-elastic-dragging") ||
    wheel.hasAttribute("data-number-scrubbing")
  );
}

function PlayControls({ running, onTogglePlay, hostRef }) {
  const wheelRef = useRef(null);
  const editingRef = useRef(false);
  const wasRunningRef = useRef(running);
  const didStampRef = useRef(false);
  const label = running ? "Pause" : "Play";

  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return undefined;

    const applyValue = (event) => {
      const next = readPropskitSliderNumber(event);
      if (!Number.isFinite(next)) return;
      hostRef.current?.seek?.(Math.max(0, next) * 1000);
    };
    const handleFocusIn = () => {
      editingRef.current = true;
    };
    const handleFocusOut = () => {
      requestAnimationFrame(() => {
        const node = wheelRef.current;
        editingRef.current = Boolean(node && isWheelBusy(node));
      });
    };

    wheel.addEventListener("input", applyValue);
    wheel.addEventListener("change", applyValue);
    wheel.addEventListener("focusin", handleFocusIn);
    wheel.addEventListener("focusout", handleFocusOut);
    return () => {
      wheel.removeEventListener("input", applyValue);
      wheel.removeEventListener("change", applyValue);
      wheel.removeEventListener("focusin", handleFocusIn);
      wheel.removeEventListener("focusout", handleFocusOut);
    };
  }, [hostRef]);

  useLayoutEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel || running || editingRef.current) {
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
      if (editingRef.current || isWheelBusy(wheel)) return;
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

export default memo(PlayControls);
