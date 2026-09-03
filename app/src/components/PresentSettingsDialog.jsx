import { useCallback, useEffect, useRef, useState } from "react";
import { readNumber } from "./controls/controlValues.js";
import ViewPropertiesDialog from "./ViewPropertiesDialog.jsx";

const DIALOG_ID = "present-settings-dialog";
const SNAP_THRESHOLD = 24;
const SNAP_DELAY = 120;
const opaqueContent = { __html: "" };
const sizeOptions = [
  { value: "custom", label: "Custom" },
  { value: "1280x720", label: "HD · 1280 × 720" },
  { value: "1920x1080", label: "Full HD · 1920 × 1080" },
  { value: "1080x1920", label: "Full HD portrait · 1080 × 1920" },
  { value: "1024x1024", label: "Square · 1024 × 1024" },
  { value: "800x600", label: "Standard · 800 × 600" },
];

function currentViewportSize() {
  return {
    width: Math.round(window.innerWidth),
    height: Math.round(window.innerHeight),
  };
}

function matchingPreset(width, height) {
  const value = `${width}x${height}`;
  return sizeOptions.some((option) => option.value === value) ? value : "custom";
}

function nearbyPreset(width, height) {
  let nearest = null;
  for (const option of sizeOptions) {
    if (option.value === "custom") continue;
    const [presetWidth, presetHeight] = option.value.split("x").map(Number);
    const widthDelta = Math.abs(width - presetWidth);
    const heightDelta = Math.abs(height - presetHeight);
    if (widthDelta > SNAP_THRESHOLD || heightDelta > SNAP_THRESHOLD) continue;
    const distance = widthDelta + heightDelta;
    if (!nearest || distance < nearest.distance) {
      nearest = {
        value: option.value,
        width: presetWidth,
        height: presetHeight,
        distance,
      };
    }
  }
  return nearest;
}

function resizeViewport(width, height) {
  const nextWidth = Math.min(3840, Math.max(320, Math.round(width)));
  const nextHeight = Math.min(2160, Math.max(240, Math.round(height)));
  const frameWidth = Math.max(0, window.outerWidth - window.innerWidth);
  const frameHeight = Math.max(0, window.outerHeight - window.innerHeight);
  const nextOuterWidth = nextWidth + frameWidth;
  const nextOuterHeight = nextHeight + frameHeight;
  if (nextOuterWidth !== window.outerWidth) {
    const currentRight = window.screenX + window.outerWidth;
    window.moveTo(currentRight - nextOuterWidth, window.screenY);
  }
  window.resizeTo(nextOuterWidth, nextOuterHeight);
}

export default function PresentSettingsDialog() {
  const initialSize = currentViewportSize();
  const [width, setWidth] = useState(initialSize.width);
  const [height, setHeight] = useState(initialSize.height);
  const [preset, setPreset] = useState(
    matchingPreset(initialSize.width, initialSize.height),
  );
  const presetRef = useRef(null);
  const pendingResizeRef = useRef(null);
  const snapTimerRef = useRef(0);

  const requestResize = useCallback((nextWidth, nextHeight) => {
    pendingResizeRef.current = {
      width: Math.round(nextWidth),
      height: Math.round(nextHeight),
      ignoreUntil: Date.now() + 300,
    };
    resizeViewport(nextWidth, nextHeight);
  }, []);

  useEffect(() => {
    const updateSize = () => {
      const size = currentViewportSize();
      setWidth(size.width);
      setHeight(size.height);
      setPreset(matchingPreset(size.width, size.height));

      if (snapTimerRef.current) {
        window.clearTimeout(snapTimerRef.current);
        snapTimerRef.current = 0;
      }
      const pending = pendingResizeRef.current;
      if (pending && Date.now() <= pending.ignoreUntil) {
        const matchesRequestedSize =
          Math.abs(size.width - pending.width) <= 2 &&
          Math.abs(size.height - pending.height) <= 2;
        if (matchesRequestedSize) return;
      }
      pendingResizeRef.current = null;

      snapTimerRef.current = window.setTimeout(() => {
        snapTimerRef.current = 0;
        const current = currentViewportSize();
        const nearby = nearbyPreset(current.width, current.height);
        if (!nearby) return;
        setWidth(nearby.width);
        setHeight(nearby.height);
        setPreset(nearby.value);
        requestResize(nearby.width, nearby.height);
      }, SNAP_DELAY);
    };
    window.addEventListener("resize", updateSize);
    return () => {
      window.removeEventListener("resize", updateSize);
      if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    };
  }, [requestResize]);

  useEffect(() => {
    const control = presetRef.current;
    if (!control) return undefined;
    const applyPreset = (event) => {
      const value =
        event.detail?.value ?? event.detail ?? event.target?.value ?? "custom";
      setPreset(value);
      if (value === "custom") return;
      const [nextWidth, nextHeight] = value.split("x").map(Number);
      if (Number.isFinite(nextWidth) && Number.isFinite(nextHeight)) {
        setWidth(nextWidth);
        setHeight(nextHeight);
        requestResize(nextWidth, nextHeight);
      }
    };
    control.addEventListener("change", applyPreset);
    return () => control.removeEventListener("change", applyPreset);
  }, [requestResize]);

  return (
    <ViewPropertiesDialog id={DIALOG_ID} label="Present window size">
      {({ minimized, toggle }) => (
        <>
          <fig-header
            dialog-header=""
            borderless={minimized ? "" : undefined}
          >
            {!minimized && <h3>Window size</h3>}
            <fig-tooltip text={minimized ? "Window size" : "Close"}>
              <fig-button
                type="button"
                variant="ghost"
                icon="true"
                aria-label={minimized ? "Change window size" : "Close settings"}
                aria-controls={DIALOG_ID}
                aria-expanded={minimized ? "false" : "true"}
                onClick={toggle}
              >
                <fig-icon name={minimized ? "adjust" : "close"} />
              </fig-button>
            </fig-tooltip>
          </fig-header>
          {!minimized && (
            <>
              <fig-content>
                <fig-field direction="horizontal" columns="thirds">
                  <label>Preset</label>
                  <hstack>
                    <fig-select
                      ref={presetRef}
                      value={preset}
                      full=""
                      position="bottom right"
                      options={JSON.stringify(sizeOptions)}
                      dangerouslySetInnerHTML={opaqueContent}
                    />
                    <fig-tooltip text="Rotate">
                      <fig-button
                        type="button"
                        variant="secondary"
                        icon="true"
                        aria-label="Swap width and height"
                        onClick={() => {
                          setWidth(height);
                          setHeight(width);
                          setPreset(matchingPreset(height, width));
                          requestResize(height, width);
                        }}
                      >
                        <fig-icon name="rotate" />
                      </fig-button>
                    </fig-tooltip>
                  </hstack>
                </fig-field>
                <fig-field direction="horizontal" columns="thirds">
                  <label>Width</label>
                  <fig-input-number
                    value={width}
                    min="320"
                    max="3840"
                    step="1"
                    units="px"
                    steppers=""
                    onInput={(event) => {
                      const nextWidth = readNumber(event);
                      if (!Number.isFinite(nextWidth)) return;
                      setWidth(nextWidth);
                      setPreset("custom");
                      requestResize(nextWidth, height);
                    }}
                    dangerouslySetInnerHTML={opaqueContent}
                  />
                </fig-field>
                <fig-field direction="horizontal" columns="thirds">
                  <label>Height</label>
                  <fig-input-number
                    value={height}
                    min="240"
                    max="2160"
                    step="1"
                    units="px"
                    steppers=""
                    onInput={(event) => {
                      const nextHeight = readNumber(event);
                      if (!Number.isFinite(nextHeight)) return;
                      setHeight(nextHeight);
                      setPreset("custom");
                      requestResize(width, nextHeight);
                    }}
                    dangerouslySetInnerHTML={opaqueContent}
                  />
                </fig-field>
              </fig-content>
            </>
          )}
        </>
      )}
    </ViewPropertiesDialog>
  );
}
