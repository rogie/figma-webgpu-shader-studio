import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { chatModelValue } from "../lib/chatModels.js";
import { getFigOverlayRoot } from "../lib/figOverlay.js";

const OPEN_PICKER_LABEL = "Select model/effort";

const EFFORT_LABELS = {
  default: "Default",
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

export default function ChatModelPicker({
  model,
  modelGroups,
  onModelChange,
  efforts,
  effort,
  onEffortChange,
  disabled,
}) {
  const popupId = useId();
  const buttonRef = useRef(null);
  const popupRef = useRef(null);
  const modelRef = useRef(null);
  const sliderRef = useRef(null);
  // A tooltip can create the overlay root later. Keep the picker in its original portal.
  const [portalRoot] = useState(getFigOverlayRoot);
  const [triggerWidth, setTriggerWidth] = useState(null);
  const expanded = triggerWidth !== null && !disabled;
  const effortDisabled = disabled || efforts.length === 0;
  const modelValue = chatModelValue(model);
  const options = ["default", ...efforts];
  const selected = Math.max(1, options.indexOf(effort) + 1);
  const label = EFFORT_LABELS[options[selected - 1]];

  useLayoutEffect(() => {
    // FigUI3's select-style button normally gets its semantics from a nested native control.
    const button = buttonRef.current;
    button.setAttribute("role", "button");
    button.tabIndex = disabled ? -1 : 0;
  }, [disabled]);

  useEffect(() => {
    const popup = popupRef.current;
    const onPopupState = (event) => {
      if (event.target !== popup) return;
      if (!event.detail.requestedOpen) setTriggerWidth(null);
      if (event.detail.state === "open") modelRef.current?.focus({ preventScroll: true });
    };
    popup.addEventListener("fig-popup-lifecycle", onPopupState);
    return () => popup.removeEventListener("fig-popup-lifecycle", onPopupState);
  }, []);

  useEffect(() => {
    const control = modelRef.current;
    const readModel = (event) => {
      if (event.target !== control) return;
      const detail = event.detail;
      const value = detail && typeof detail === "object" && "value" in detail
        ? detail.value
        : (detail ?? control.value);
      onModelChange(value);
    };
    control.addEventListener("change", readModel);
    return () => control.removeEventListener("change", readModel);
  }, [onModelChange]);

  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider || effortDisabled) return;
    const sliderEfforts = ["default", ...efforts];
    const readEffort = (event) => {
      if (event.target !== slider) return;
      const next = sliderEfforts[Number(event.detail ?? slider.value) - 1];
      if (next) onEffortChange(next);
    };
    slider.addEventListener("input", readEffort);
    slider.addEventListener("change", readEffort);
    return () => {
      slider.removeEventListener("input", readEffort);
      slider.removeEventListener("change", readEffort);
    };
  }, [effortDisabled, efforts, modelValue, onEffortChange]);

  useEffect(() => {
    if (disabled) setTriggerWidth(null);
    const popup = popupRef.current;
    popup.anchor = buttonRef.current;
    popup.open = expanded;
    if (!expanded) modelRef.current.open = false;
  }, [disabled, expanded]);

  const togglePopup = () => {
    if (disabled) return;
    setTriggerWidth(expanded ? null : buttonRef.current.getBoundingClientRect().width);
  };

  return (
    <>
      <fig-tooltip text="Model and effort">
        <fig-button
          ref={buttonRef}
          class="chat-model-picker-trigger"
          type="select"
          variant="ghost"
          pill=""
          selected={expanded ? "" : undefined}
          style={expanded ? { inlineSize: triggerWidth } : undefined}
          aria-label={expanded ? OPEN_PICKER_LABEL : `Model and effort: ${model.label}, ${label}`}
          aria-haspopup="dialog"
          aria-controls={popupId}
          aria-expanded={expanded}
          disabled={disabled ? "" : undefined}
          onClick={togglePopup}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            event.preventDefault();
            if (!event.repeat) togglePopup();
          }}
        >
          <span className="chat-model-picker-name">{expanded ? OPEN_PICKER_LABEL : model.label}</span>
          {!expanded && <span className="chat-model-picker-effort">{label}</span>}
        </fig-button>
      </fig-tooltip>
      {portalRoot && createPortal(
        <dialog
          id={popupId}
          is="fig-popup"
          ref={popupRef}
          class="chat-model-picker-popup"
          aria-label="Model and effort"
          position="top center"
          variant="popover"
          popover="manual"
          closedby="any"
        >
          <fig-content>
            <fig-stack direction="vertical" align="center" gap="0">
              <h3 className="chat-effort-label">{label}</h3>
              <fig-select
                ref={modelRef}
                variant="ghost"
                label="Model"
                position="top left"
                value={modelValue}
                disabled={disabled ? "" : undefined}
              >
                <fig-select-options>
                  {modelGroups.map((group) => (
                    <Fragment key={group.label}>
                      <fig-separator label={group.label} />
                      {group.models.map((entry) => (
                        <fig-select-option key={chatModelValue(entry)} value={chatModelValue(entry)}>
                          {entry.label}
                        </fig-select-option>
                      ))}
                    </Fragment>
                  ))}
                </fig-select-options>
              </fig-select>
            </fig-stack>
            <fig-property>
              <fig-slider
                key={modelValue}
                ref={sliderRef}
                slot="input"
                type="stepper"
                value={selected}
                default="1"
                step="1"
                min="1"
                max={Math.max(2, options.length)}
                full=""
                variant="classic"
                text="false"
                aria-label="Reasoning effort"
                aria-valuetext={label}
                disabled={effortDisabled ? "" : undefined}
                dangerouslySetInnerHTML={{ __html: "" }}
              />
            </fig-property>
          </fig-content>
        </dialog>,
        portalRoot,
      )}
    </>
  );
}
