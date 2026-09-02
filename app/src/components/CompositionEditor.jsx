import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  compositionLayerName,
  compositionRefAliases,
  isLiveWebcamFill,
  liveWebcamFillCount,
  MAX_COMPOSITION_EFFECTS,
  MAX_COMPOSITION_FILLS,
  mergeLayerValues,
  normalizeComposition,
  reorderCompositionEffects,
  reorderCompositionFills,
  resolveReferencedShaderSource,
  resolveShaderFillKey,
} from "../lib/composition.js";
import {
  createDocumentInput,
  inputTypeLabel,
  MAX_DOCUMENT_INPUTS,
  audioInputHasFile,
  audioPlaybackSettings,
  normalizeDocumentInputs,
} from "../lib/documentInputs.js";
import { graphTypeForPaint, isPaintFillType, resolvePaintFill } from "../lib/paintFill.js";
import { portalToFigOverlay } from "../lib/figOverlay.js";
import { popupProtectedFromHandleDismiss } from "../lib/canvasHandlePopupGuard.js";
import { useFigMenuChange } from "../hooks/useFigMenuChange.js";
import { useOverflowFade } from "../hooks/useOverflowFade.js";
import { syncOverflowFade } from "../lib/overflowFade.js";
import { loadModule } from "../runtime/loader.js";
import { valuesMatchDefaults } from "../runtime/params.js";
import defaultInputUrl from "../assets/default-input.png";
import { defaultVideoUrl } from "../runtime/sample.js";
import Controls from "./Controls.jsx";
import MicrophoneIcon from "./MicrophoneIcon.jsx";
import VolumeIcon from "./VolumeIcon.jsx";
import ShaderPicker, {
  SHADER_PICKER_ANCHOR_IDS,
  SHADER_PICKER_TRIGGER_IDS,
} from "./ShaderPicker.jsx";
import "./CompositionEditor.css";

const opaqueContent = { __html: "" };
const FILL_PICKER_DIALOG_ANCHOR = "data-composition-fill-picker-anchor";
const FILL_PAINT_MODES = "solid,gradient,image,video,webcam";
const FILL_SHADER_MODES = `${FILL_PAINT_MODES},shader`;
const FILL_TYPE_LABELS = {
  shader: "Shader",
  solid: "Solid",
  gradient: "Gradient",
  image: "Image",
  video: "Video",
  webcam: "Webcam",
};
const ADD_FILL_TRIGGER_ID = "composition-add-fill";

function fillTypeFromValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value.type || null;
  try {
    return JSON.parse(value)?.type || null;
  } catch {
    return null;
  }
}

function fillTypeLabel(type) {
  return FILL_TYPE_LABELS[type] || "Fill";
}

function defaultPaintFill(type) {
  switch (type) {
    case "solid":
      return { type: "solid", color: "#D9D9D9", alpha: 1 };
    case "gradient":
      return {
        type: "gradient",
        gradient: {
          type: "linear",
          angle: 90,
          interpolationSpace: "srgb",
          hueInterpolation: "shorter",
          stops: [
            { position: 0, color: "#D9D9D9", opacity: 100 },
            { position: 100, color: "#737373", opacity: 100 },
          ],
        },
      };
    case "video":
      return { type: "video", video: { url: defaultVideoUrl, scaleMode: "fit" } };
    case "webcam":
      return { type: "webcam" };
    default:
      return {
        type: "image",
        image: { url: defaultInputUrl, scaleMode: "fit" },
      };
  }
}

function createPaintCompositionFill(type) {
  const paint = withoutVideoPoster(
    resolvePaintFill(defaultPaintFill(type), {
      defaultImageUrl: defaultInputUrl,
      defaultVideoUrl,
    })
  );
  return {
    id: crypto.randomUUID(),
    type: graphTypeForPaint(paint.type),
    shaderId: null,
    values: {},
    enabled: true,
    paint,
  };
}

function fillShaderAnchorId(fillId) {
  return `composition-fill-shader-${fillId}`;
}

function fillShaderTriggerId(fillId) {
  return `composition-choose-fill-shader-${fillId}`;
}

function fillDialogAnchorSelector(fillId) {
  const escaped = String(fillId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `dialog[${FILL_PICKER_DIALOG_ANCHOR}="${escaped}"]`;
}

function swatchBackgroundCss(url) {
  if (!url) return "";
  return `url("${String(url).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
}

function shaderFillControlValue(shaderId, thumbnailUrl) {
  const value = { type: "shader", colorSpace: "srgb" };
  if (shaderId) value.shaderId = shaderId;
  const swatch = swatchBackgroundCss(thumbnailUrl);
  if (swatch) value.swatchBackground = swatch;
  return JSON.stringify(value);
}

function controlValueFromGraphFill(
  fill,
  { cards = [], imageUrl = defaultInputUrl } = {}
) {
  if (fill?.type === "shader") {
    const card = findShaderFillCard(cards, fill.shaderId);
    return shaderFillControlValue(fill.shaderId, card?.thumbnailUrl);
  }
  if (fill?.paint && isPaintFillType(fill.paint.type)) {
    const paintUrl = fill.paint.image?.url || fill.paint.video?.url || "";
    if (
      fill.paint.type === "image" &&
      paintUrl === defaultInputUrl &&
      imageUrl &&
      imageUrl !== defaultInputUrl
    ) {
      return imageFillValueFromUrl(imageUrl);
    }
    return JSON.stringify(fill.paint);
  }
  return imageFillValueFromUrl(imageUrl || defaultInputUrl);
}

function withoutVideoPoster(fill) {
  if (fill?.type !== "video" || !fill.video?.poster) return fill;
  const { poster: _poster, ...video } = fill.video;
  return { ...fill, video };
}

function videoSettingsKey(fill) {
  if (fill?.type !== "video") return "";
  return JSON.stringify({
    type: "video",
    colorSpace: fill.colorSpace || "srgb",
    url: fill.video?.url || "",
    scaleMode: fill.video?.scaleMode || "fill",
    scale: fill.video?.scale ?? 50,
    opacity: fill.video?.opacity ?? 1,
  });
}

function webcamSettingsKey(fill) {
  if (fill?.type !== "webcam") return "";
  return JSON.stringify({
    type: "webcam",
    live: fill.webcam?.live !== false,
    deviceId: fill.webcam?.deviceId || "",
    scaleMode: fill.webcam?.scaleMode || fill.image?.scaleMode || "fill",
    scale: fill.webcam?.scale ?? fill.image?.scale ?? 50,
    opacity: fill.webcam?.opacity ?? fill.image?.opacity ?? 1,
  });
}

function findShaderFillCard(cards, shaderId) {
  const aliases = new Set(compositionRefAliases(shaderId));
  return (cards || []).find((card) => aliases.has(card?.key)) ?? null;
}

function imageFillValueFromUrl(url) {
  return JSON.stringify({
    type: "image",
    image: { url, scaleMode: "fit" },
  });
}

function layerPropsAnchorId(layerId) {
  return `composition-layer-props-${layerId}`;
}

function OpenShaderButton({
  shaderId,
  noun = "shader",
  disabled = false,
  onOpen,
}) {
  if (!shaderId) return null;
  const label = `Open ${noun}`;
  return (
    <fig-tooltip text={label}>
      <fig-button
        type="button"
        variant="ghost"
        icon="true"
        disabled={disabled ? "" : undefined}
        aria-label={label}
        onClick={() => onOpen?.(shaderId)}
      >
        <fig-icon>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M13.5 6C13.2239 6 13 6.22386 13 6.5C13 6.77614 13.2239 7 13.5 7H16.2929L11.6465 11.6464C11.4512 11.8417 11.4512 12.1583 11.6465 12.3536C11.8418 12.5488 12.1583 12.5488 12.3536 12.3536L17 7.70711V10.5C17 10.7761 17.2239 11 17.5 11C17.7762 11 18 10.7761 18 10.5V7C18 6.44772 17.5523 6 17 6H13.5ZM10.8536 7.14645C11.0489 7.34171 11.0489 7.65829 10.8536 7.85355L6.70715 12L12 17.2929L16.1465 13.1464C16.3418 12.9512 16.6583 12.9512 16.8536 13.1464C17.0489 13.3417 17.0489 13.6583 16.8536 13.8536L12.7072 18C12.3166 18.3905 11.6835 18.3905 11.2929 18L6.00005 12.7071C5.60952 12.3166 5.60952 11.6834 6.00005 11.2929L10.1465 7.14645C10.3418 6.95118 10.6583 6.95118 10.8536 7.14645Z"
              fill="currentColor"
              fillOpacity="0.9"
            />
          </svg>
        </fig-icon>
      </fig-button>
    </fig-tooltip>
  );
}

function ResetPropertiesButton({
  hidden = false,
  disabled = false,
  onReset,
}) {
  if (hidden) return null;
  return (
    <fig-tooltip text="Reset properties">
      <fig-button
        type="button"
        variant="ghost"
        icon="true"
        disabled={disabled ? "" : undefined}
        aria-label="Reset properties"
        onClick={() => {
          if (disabled) return;
          onReset?.();
        }}
      >
        <fig-icon name="reset" />
      </fig-button>
    </fig-tooltip>
  );
}

function layerToggleLabel(visibility, noun, enabled) {
  if (visibility === "microphone" || visibility === "audio") {
    return enabled ? `Mute ${noun}` : `Unmute ${noun}`;
  }
  return enabled ? `Hide ${noun}` : `Show ${noun}`;
}

function LayerVisibilityIcon({ visibility, enabled }) {
  if (visibility === "microphone") {
    return <MicrophoneIcon muted={!enabled} />;
  }
  if (visibility === "audio") {
    return <VolumeIcon muted={!enabled} />;
  }
  return <fig-icon name={enabled ? "visible" : "hidden"} />;
}

function PropertiesLayerRow({
  id,
  name,
  expanded = false,
  enabled = true,
  readOnly = false,
  noun = "effect",
  visibility = "layer",
  control = null,
  onOpen,
  onToggleVisible,
  onRemove,
}) {
  const hideLabel = layerToggleLabel(visibility, noun, enabled);
  const removeLabel = `Remove ${noun}`;
  return (
    <div id={id} className="properties-layer-row" aria-label={name}>
      {control || (
        <fig-button
          type="button"
          variant={expanded ? "ghost" : "input"}
          size="large"
          full=""
          align="start"
          title={name}
          aria-haspopup="dialog"
          aria-expanded={expanded ? "true" : "false"}
          selected={expanded ? "" : undefined}
          disabled={enabled ? undefined : ""}
          onClick={onOpen}
        >
          <span className="properties-layer-row-label">{name}</span>
        </fig-button>
      )}
      {onToggleVisible && (
        <fig-tooltip text={hideLabel}>
          <fig-button
            type="button"
            variant="ghost"
            icon="true"
            disabled={readOnly ? "" : undefined}
            aria-label={hideLabel}
            onClick={onToggleVisible}
          >
            <LayerVisibilityIcon visibility={visibility} enabled={enabled} />
          </fig-button>
        </fig-tooltip>
      )}
      {onRemove && (
        <fig-tooltip text={removeLabel}>
          <fig-button
            type="button"
            variant="ghost"
            icon="true"
            disabled={readOnly ? "" : undefined}
            aria-label={removeLabel}
            onClick={onRemove}
          >
            <fig-icon name="minus" />
          </fig-button>
        </fig-tooltip>
      )}
    </div>
  );
}

function ShaderFillMode({
  name,
  shaderId,
  thumbnailUrl,
  disabled = false,
  emptyLibrary = false,
  properties = null,
  resetDisabled = true,
  onChoose,
  onOpenShader,
  onResetProperties,
  pickerAnchorId = SHADER_PICKER_ANCHOR_IDS.fill,
  pickerTriggerId = SHADER_PICKER_TRIGGER_IDS.fill,
  dialogAnchor = "",
}) {
  const rootRef = useRef(null);
  const selectRef = useRef(null);
  const selectValue = shaderId || "none";
  const selectLabel = emptyLibrary
    ? "No shader fills in the library."
    : name || "Choose a shader fill";
  const selectOptions = JSON.stringify([
    { value: selectValue, label: selectLabel },
  ]);

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return undefined;

    const openChooser = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (select.open) select.open = false;
      if (!disabled) onChoose?.();
    };
    const onKeydown = (event) => {
      if (
        event.key !== "ArrowDown" &&
        event.key !== "Enter" &&
        event.key !== " "
      ) {
        return;
      }
      openChooser(event);
    };
    const keepClosed = () => {
      if (select.open) select.open = false;
    };

    const stopSelectValue = (event) => {
      event.stopPropagation();
    };
    select.addEventListener("click", openChooser, true);
    select.addEventListener("keydown", onKeydown, true);
    select.addEventListener("input", stopSelectValue, true);
    select.addEventListener("change", stopSelectValue, true);
    const observer = new MutationObserver(keepClosed);
    observer.observe(select, { attributes: true, attributeFilter: ["open"] });
    return () => {
      select.removeEventListener("click", openChooser, true);
      select.removeEventListener("keydown", onKeydown, true);
      select.removeEventListener("input", stopSelectValue, true);
      select.removeEventListener("change", stopSelectValue, true);
      observer.disconnect();
    };
  }, [disabled, onChoose, selectOptions]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const dialog = root.closest("dialog");
    dialog?.setAttribute(FILL_PICKER_DIALOG_ANCHOR, dialogAnchor);
    const stopFillEvents = (event) => {
      if (event.target === root) return;
      event.stopPropagation();
    };
    root.addEventListener("input", stopFillEvents);
    root.addEventListener("change", stopFillEvents);
    return () => {
      root.removeEventListener("input", stopFillEvents);
      root.removeEventListener("change", stopFillEvents);
      dialog?.removeAttribute(FILL_PICKER_DIALOG_ANCHOR);
    };
  }, [dialogAnchor]);

  return (
    <fig-content ref={rootRef} style={{ paddingTop: 0, position: "relative" }}>
      <div className="shader-fill-mode-chrome">
        <fig-header id={pickerAnchorId} borderless="">
          <fig-select
            ref={selectRef}
            id={pickerTriggerId}
            variant="ghost"
            value={selectValue}
            label={selectLabel}
            options={selectOptions}
            disabled={disabled ? "" : undefined}
            aria-label="Choose shader fill"
            aria-haspopup="dialog"
            dangerouslySetInnerHTML={opaqueContent}
          />
          <hstack
            style={{
              marginLeft: "auto",
              "--hstack-gap": "var(--spacer-1)",
            }}
          >
            <OpenShaderButton
              shaderId={shaderId}
              noun="shader fill"
              disabled={disabled}
              onOpen={onOpenShader}
            />
            <ResetPropertiesButton
              hidden={disabled}
              disabled={resetDisabled}
              onReset={onResetProperties}
            />
          </hstack>
        </fig-header>
        <fig-field style={{ paddingTop: 0 }}>
          <fig-preview fit="cover" full="" aspect-ratio="16 / 9">
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt={name || "Shader fill"} />
            ) : null}
          </fig-preview>
        </fig-field>
      </div>
      <div className="shader-fill-mode-props">{properties}</div>
    </fig-content>
  );
}

function ImageFillInput({
  disabled = false,
  value,
  onChange,
  allowShader = false,
  shaderName = "",
  shaderId = "",
  shaderThumbnail = "",
  shaderLibraryEmpty = false,
  properties = null,
  resetDisabled = true,
  onChooseShader,
  onOpenShader,
  onResetProperties,
  pickerAnchorId,
  pickerTriggerId,
  dialogAnchor,
  autoOpen = false,
  onOpenPicker,
  onClosePicker,
  onAutoOpened,
}) {
  const ref = useRef(null);
  const [typeLabel, setTypeLabel] = useState(
    () => fillTypeLabel(fillTypeFromValue(value))
  );
  const shaderModeRootRef = useRef(null);
  const shaderModeRenderRef = useRef(null);
  const shaderModePropsRef = useRef({
    name: shaderName,
    shaderId,
    thumbnailUrl: shaderThumbnail,
    disabled,
    emptyLibrary: shaderLibraryEmpty,
    properties,
    resetDisabled,
    onChoose: onChooseShader,
    onOpenShader,
    onResetProperties,
    pickerAnchorId,
    pickerTriggerId,
    dialogAnchor,
  });
  shaderModePropsRef.current = {
    name: shaderName,
    shaderId,
    thumbnailUrl: shaderThumbnail,
    disabled,
    emptyLibrary: shaderLibraryEmpty,
    properties,
    resetDisabled,
    onChoose: onChooseShader,
    onOpenShader,
    onResetProperties,
    pickerAnchorId,
    pickerTriggerId,
    dialogAnchor,
  };

  useEffect(() => {
    const node = ref.current;
    if (!node || !onChange) return undefined;
    const picker = node.querySelector("fig-fill-picker") || node;
    const handleValue = (event) => {
      const detail = event.detail;
      if (!detail || typeof detail !== "object") return;
      if (detail.type) setTypeLabel(fillTypeLabel(detail.type));
      if (detail.type === "shader") {
        if (!allowShader) return;
        onChange(detail, true);
        return;
      }
      if (detail.type && !isPaintFillType(detail.type)) return;
      onChange(detail, event.type === "change");
    };
    const handleWebcamStream = (event) => {
      if (!event.detail?.stream) return;
      const detail =
        typeof picker.value === "string"
          ? (() => {
              try {
                return JSON.parse(picker.value);
              } catch {
                return null;
              }
            })()
          : picker.value;
      if (detail?.type === "webcam") onChange(detail, false);
    };
    const handleClose = () => onClosePicker?.();
    node.addEventListener("input", handleValue);
    node.addEventListener("change", handleValue);
    picker.addEventListener("webcamstream", handleWebcamStream);
    picker.addEventListener("close", handleClose);
    return () => {
      node.removeEventListener("input", handleValue);
      node.removeEventListener("change", handleValue);
      picker.removeEventListener("webcamstream", handleWebcamStream);
      picker.removeEventListener("close", handleClose);
    };
  }, [allowShader, onChange, onClosePicker]);

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host || !allowShader) return undefined;
    const picker = host.querySelector("fig-fill-picker");
    if (!picker) return undefined;

    const slot = document.createElement("div");
    slot.setAttribute("slot", "mode-shader");
    slot.setAttribute("label", "Shader");
    const swatch = swatchBackgroundCss(shaderModePropsRef.current.thumbnailUrl);
    if (swatch) slot.setAttribute("swatch-background", swatch);
    picker.appendChild(slot);

    const renderMode = () => {
      const props = shaderModePropsRef.current;
      const nextSwatch = swatchBackgroundCss(props.thumbnailUrl);
      if (nextSwatch) slot.setAttribute("swatch-background", nextSwatch);
      else slot.removeAttribute("swatch-background");
      shaderModeRootRef.current?.render(<ShaderFillMode {...props} />);
    };
    shaderModeRenderRef.current = renderMode;

    const onModeReady = (event) => {
      if (event.detail?.mode !== "shader" || !event.detail.container) return;
      const dialogContent = event.detail.container
        .closest("dialog")
        ?.querySelector(":scope > fig-content");
      dialogContent?.removeAttribute("padding");
      if (dialogContent) dialogContent.style.paddingTop = "0";
      shaderModeRootRef.current?.unmount();
      shaderModeRootRef.current = createRoot(event.detail.container);
      renderMode();
    };
    host.addEventListener("modeready", onModeReady);
    return () => {
      host.removeEventListener("modeready", onModeReady);
      shaderModeRootRef.current?.unmount();
      shaderModeRootRef.current = null;
      shaderModeRenderRef.current = null;
      slot.remove();
    };
  }, [allowShader]);

  useEffect(() => {
    shaderModeRenderRef.current?.();
  }, [
    disabled,
    onChooseShader,
    onOpenShader,
    onResetProperties,
    pickerAnchorId,
    pickerTriggerId,
    dialogAnchor,
    shaderId,
    shaderLibraryEmpty,
    shaderName,
    shaderThumbnail,
    properties,
    resetDisabled,
  ]);

  useEffect(() => {
    const next = fillTypeFromValue(value);
    if (next) setTypeLabel(fillTypeLabel(next));
  }, [value]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const popupOpen = node.classList.contains("has-popup-open");
    if (popupOpen) return;
    // Always assign the property. Matching the attribute is not enough —
    // propskit updates the swatch from the setter, not from React's attribute.
    node.value = value;
  }, [value]);

  useEffect(() => {
    if (!autoOpen || disabled) return undefined;
    let frame = 0;
    // fig-fill-picker parses its value on an animation frame, so opening
    // immediately would show the previous tab instead of the new fill type.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        onOpenPicker?.();
        const picker = ref.current?.querySelector("fig-fill-picker");
        picker?.open?.();
        onAutoOpened?.();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [autoOpen, disabled, onAutoOpened, onOpenPicker]);

  return (
    <propskit-fill
      ref={ref}
      label={typeLabel}
      direction="horizontal"
      size="large"
      mode={allowShader ? FILL_SHADER_MODES : FILL_PAINT_MODES}
      value={value}
      disabled={disabled ? "" : undefined}
      webcam-mode="live"
      default-video={defaultVideoUrl}
      aria-label={typeLabel}
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

export function ExportPropertiesPane({ disabled = false, onExport }) {
  return (
    <div className="properties-pane">
      <fig-header borderless="">
        <h3>Export</h3>
      </fig-header>
      <fig-field>
        <fig-button
          type="button"
          variant="secondary"
          full=""
          disabled={disabled ? "" : undefined}
          onClick={() => onExport?.()}
        >
          Export
        </fig-button>
      </fig-field>
    </div>
  );
}

function AudioInputControl({
  input,
  disabled = false,
  anchorId = "",
  onChange,
}) {
  const fileRef = useRef(null);
  const popupRef = useRef(null);
  const [open, setOpen] = useState(false);
  const hasFile = audioInputHasFile(input);
  const label = input.audio?.name || input.audio?.url || "Choose audio";
  const playback = audioPlaybackSettings(input.audio);
  const gainPercent = Math.round(playback.gain * 100);
  const anchorSelector = anchorId ? `#${anchorId}` : undefined;

  const commitAudio = useCallback(
    (nextAudio) => {
      onChange?.({
        ...input,
        audio: { ...input.audio, ...nextAudio },
      });
    },
    [input, onChange]
  );

  const replaceFile = useCallback(
    (file) => {
      if (!file) return;
      const previous = input.audio?.url;
      if (previous && previous.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      const kept = audioPlaybackSettings(input.audio);
      onChange?.({
        ...input,
        audio: {
          url: URL.createObjectURL(file),
          name: file.name,
          gain: kept.gain,
          monitor: kept.monitor,
          loop: kept.loop,
        },
      });
    },
    [input, onChange]
  );

  useEffect(() => {
    if (!hasFile) {
      if (open) setOpen(false);
      return undefined;
    }
    const popup = popupRef.current;
    if (!popup) return undefined;
    popup.setAttribute("closedby", "any");
    if ("closedBy" in popup) popup.closedBy = "any";
    if (anchorSelector) popup.setAttribute("anchor", anchorSelector);
    const onClose = () => setOpen(false);
    popup.addEventListener("close", onClose);
    popup.addEventListener("cancel", onClose);
    if (open && !disabled) popup.open = true;
    else popup.open = false;
    return () => {
      popup.removeEventListener("close", onClose);
      popup.removeEventListener("cancel", onClose);
    };
  }, [anchorSelector, disabled, hasFile, open]);

  return (
    <div className="composition-fill-control">
      <fig-button
        type="button"
        variant={open ? "ghost" : "input"}
        size="large"
        full=""
        align="start"
        title={label}
        aria-haspopup={hasFile ? "dialog" : undefined}
        aria-expanded={hasFile && open ? "true" : "false"}
        selected={open ? "" : undefined}
        disabled={disabled ? "" : undefined}
        onClick={() => {
          if (hasFile) setOpen((current) => !current);
          else fileRef.current?.click();
        }}
      >
        <span className="properties-layer-row-label">{label}</span>
      </fig-button>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          replaceFile(file);
        }}
      />
      {hasFile
        ? portalToFigOverlay(
            <dialog
              is="fig-popup"
              ref={popupRef}
              class="composition-layer-props"
              position="left"
              popover="manual"
              closedby="any"
              anchor={anchorSelector}
            >
              <fig-header>
                <h3>{input.audio?.name || "Audio"}</h3>
                <hstack style={{ "--hstack-gap": "var(--spacer-1)" }}>
                  <fig-tooltip text="Close">
                    <fig-button
                      type="button"
                      variant="ghost"
                      icon="true"
                      aria-label="Close"
                      onClick={() => setOpen(false)}
                    >
                      <fig-icon name="close" />
                    </fig-button>
                  </fig-tooltip>
                </hstack>
              </fig-header>
              <fig-content class="composition-layer-props-content">
                <fig-field direction="horizontal" columns="thirds">
                  <label>Gain</label>
                  <fig-slider
                    value={gainPercent}
                    min="0"
                    max="200"
                    step="1"
                    units="%"
                    full=""
                    onInput={(event) =>
                      commitAudio({
                        gain: Number(event.target.value) / 100,
                      })
                    }
                    dangerouslySetInnerHTML={opaqueContent}
                  />
                </fig-field>
                <fig-field direction="horizontal" columns="thirds">
                  <label>Hear audio</label>
                  <fig-switch
                    checked={playback.monitor ? "" : undefined}
                    aria-label="Hear audio"
                    onInput={(event) =>
                      commitAudio({
                        monitor: Boolean(event.target.checked),
                      })
                    }
                    dangerouslySetInnerHTML={opaqueContent}
                  />
                </fig-field>
                <fig-field direction="horizontal" columns="thirds">
                  <label>Loop</label>
                  <fig-switch
                    checked={playback.loop ? "" : undefined}
                    aria-label="Loop"
                    onInput={(event) =>
                      commitAudio({ loop: Boolean(event.target.checked) })
                    }
                    dangerouslySetInnerHTML={opaqueContent}
                  />
                </fig-field>
                <fig-field>
                  <fig-button
                    type="button"
                    variant="secondary"
                    full=""
                    disabled={disabled ? "" : undefined}
                    onClick={() => fileRef.current?.click()}
                  >
                    Replace file
                  </fig-button>
                </fig-field>
              </fig-content>
            </dialog>
          )
        : null}
    </div>
  );
}

export function DocumentInputsPane({
  inputs = [],
  readOnly = false,
  experimentalAudio = false,
  hasLiveWebcam = false,
  onChange,
  onSupportsAudioChange,
}) {
  const normalized = normalizeDocumentInputs(inputs);
  const audioEnabled = experimentalAudio;
  const atInputLimit = normalized.length >= MAX_DOCUMENT_INPUTS;
  const canAdd = experimentalAudio && !readOnly && !atInputLimit;
  const commitInputs = useCallback(
    (next) => {
      const committed = normalizeDocumentInputs(next);
      onSupportsAudioChange?.(committed.length > 0);
      onChange?.(committed);
    },
    [onChange, onSupportsAudioChange]
  );
  const addInput = useCallback(
    (type) => {
      if (readOnly || !experimentalAudio) return;
      if (normalized.length >= MAX_DOCUMENT_INPUTS) return;
      if (type === "microphone" && hasLiveWebcam) return;
      if (type !== "audio" && type !== "microphone") return;
      commitInputs([...normalized, createDocumentInput(type)]);
    },
    [
      commitInputs,
      experimentalAudio,
      hasLiveWebcam,
      normalized,
      readOnly,
    ]
  );
  const addMenuRef = useFigMenuChange(addInput);
  const updateInput = useCallback(
    (id, next) => {
      onChange?.(normalized.map((item) => (item.id === id ? next : item)));
    },
    [normalized, onChange]
  );

  return (
    <div className="properties-pane">
      <fig-header borderless>
        <h3>Sources</h3>
        {!readOnly && (
          <hstack>
            <fig-menu ref={addMenuRef} position="bottom right">
              <fig-tooltip text="Add input">
                <fig-button
                  type="button"
                  variant="ghost"
                  icon="true"
                  fig-menu-trigger=""
                  aria-label="Add input"
                  disabled={!canAdd ? "" : undefined}
                >
                  <fig-icon name="add" />
                </fig-button>
              </fig-tooltip>
              <fig-menu-item
                value="audio"
                disabled={!experimentalAudio || atInputLimit ? "" : undefined}
              >
                Audio
              </fig-menu-item>
              <fig-menu-item
                value="microphone"
                disabled={
                  !experimentalAudio || atInputLimit || hasLiveWebcam
                    ? ""
                    : undefined
                }
              >
                Microphone
              </fig-menu-item>
            </fig-menu>
          </hstack>
        )}
      </fig-header>
      {!experimentalAudio && normalized.length > 0 ? (
        <p className="composition-notice">
          This shader uses audio. Enable Audio inputs in Settings → Experimental.
        </p>
      ) : null}
      {normalized.length > 0 && (
        <div className="composition-effect-list">
          {normalized.map((input) => {
            const rowId =
              input.type === "audio" ? layerPropsAnchorId(input.id) : undefined;
            return (
            <PropertiesLayerRow
              key={input.id}
              id={rowId}
              name={
                input.type === "audio"
                  ? input.audio?.name || "Audio"
                  : inputTypeLabel(input.type)
              }
              enabled={input.enabled}
              readOnly={readOnly || !audioEnabled}
              noun={input.type === "microphone" ? "microphone" : "audio"}
              visibility={
                input.type === "microphone" ? "microphone" : "audio"
              }
              control={
                input.type === "audio" ? (
                  <AudioInputControl
                    input={input}
                    anchorId={rowId}
                    disabled={readOnly || !audioEnabled || !input.enabled}
                    onChange={(next) => updateInput(input.id, next)}
                  />
                ) : null
              }
              onToggleVisible={() =>
                updateInput(input.id, { ...input, enabled: !input.enabled })
              }
              onRemove={() =>
                commitInputs(normalized.filter((item) => item.id !== input.id))
              }
            />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FigmaPropertiesPane({
  shader,
  loading = false,
  error = "",
}) {
  const textFields = [
    ["id", shader?.id],
    ["type", shader?.type],
    ["owner", shader?.owner],
    ["name", shader?.name || "Shader"],
    ["version", shader?.version],
    ...(loading ? [["status", "Loading Figma data…"]] : []),
    ...(!loading && error ? [["status", "Figma data unavailable"]] : []),
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
  const booleanFields = [
    ["isAnimated", Boolean(shader?.isAnimated)],
    ["usesMouse", Boolean(shader?.usesMouse)],
  ];

  return (
    <div className="properties-pane grouped-properties-pane">
      <fig-group name="Figma" collapsible="">
        {textFields.map(([key, value]) => (
          <fig-field key={key} direction="horizontal" columns="half">
            <label>{key}</label>
            <fig-input-text
              value={value}
              readonly=""
              full=""
              dangerouslySetInnerHTML={{ __html: "" }}
            />
          </fig-field>
        ))}
        {booleanFields.map(([key, checked]) => (
          <fig-field key={key} direction="horizontal" columns="half">
            <label>{key}</label>
            <fig-switch
              checked={checked ? "" : undefined}
              disabled=""
              aria-label={`${key}: ${checked}`}
              dangerouslySetInnerHTML={{ __html: "" }}
            />
          </fig-field>
        ))}
      </fig-group>
    </div>
  );
}

function FillLayerEditor({
  fill,
  readOnly = false,
  fillOnly = false,
  imageUrl,
  shaderFillCards,
  layerCards,
  resolvedByKey,
  expanded = false,
  onSelect,
  onApplyPaint,
  onApplyShader,
  onChooseShader,
  onOpenShader,
  onResetLayer,
  onPreviewValues,
  onChangeValues,
  onToggleVisible,
  onRemove,
  onOpenPicker,
  onClosePicker,
  autoOpen = false,
  onAutoOpened,
}) {
  const [controlValue, setControlValue] = useState(() =>
    controlValueFromGraphFill(fill, {
      cards: shaderFillCards,
      imageUrl: imageUrl || defaultInputUrl,
    })
  );
  const [controlKey, setControlKey] = useState(0);
  const lastImageFillUrlRef = useRef(
    fill.paint?.image?.url || imageUrl || defaultInputUrl
  );
  const fillValueTypeRef = useRef(fill.paint?.type || fill.type || "image");
  const lastPaintRef = useRef(fill.paint ? JSON.stringify(fill.paint) : "");
  const shaderFillCard = useMemo(
    () => findShaderFillCard(shaderFillCards, fill.shaderId),
    [fill.shaderId, shaderFillCards]
  );
  const shaderFillName = compositionLayerName(
    fill.shaderId,
    resolvedByKey,
    layerCards,
    "Choose a shader fill"
  );
  const fillShaderSource = useMemo(() => {
    if (fill.type !== "shader" || !fill.shaderId) return null;
    const resolved = resolveReferencedShaderSource(fill.shaderId, {
      resolvedByKey,
    });
    if (resolved) return resolved;
    return shaderFillCard?.draft?.source || shaderFillCard?.cloud?.source || null;
  }, [fill.shaderId, fill.type, resolvedByKey, shaderFillCard]);
  const fillLayerProps = useMemo(() => {
    if (fill.type !== "shader" || !fillShaderSource) return null;
    try {
      return loadModule(fillShaderSource).props || {};
    } catch {
      return null;
    }
  }, [fill.type, fillShaderSource]);
  const fillLayerValues = useMemo(
    () => mergeLayerValues(fillLayerProps || {}, fill.values),
    [fill.values, fillLayerProps]
  );
  const fillPropertiesAtDefaults = useMemo(
    () => valuesMatchDefaults(fillLayerProps, fill.values),
    [fillLayerProps, fill.values]
  );

  const onFillPropInput = useCallback(
    (name, value) => {
      if (readOnly) return;
      onPreviewValues?.(fill.id, { ...fill.values, [name]: value });
    },
    [fill.id, fill.values, onPreviewValues, readOnly]
  );

  const onFillPropChange = useCallback(
    (name, value) => {
      if (readOnly) return;
      const nextValues = { ...fill.values, [name]: value };
      onPreviewValues?.(fill.id, nextValues);
      onChangeValues?.(fill.id, nextValues);
    },
    [fill.id, fill.values, onChangeValues, onPreviewValues, readOnly]
  );

  const fillProperties = useMemo(() => {
    if (fill.type !== "shader") return null;
    if (!fill.shaderId) {
      return (
        <fig-field>
          <p className="empty-state">
            Choose a shader fill to edit its properties.
          </p>
        </fig-field>
      );
    }
    if (!fillLayerProps) {
      return (
        <fig-field>
          <p className="empty-state">This shader has no exposed properties.</p>
        </fig-field>
      );
    }
    return (
      <Controls
        props={fillLayerProps}
        values={fillLayerValues}
        onChange={onFillPropChange}
        onInput={onFillPropInput}
      />
    );
  }, [
    fill.shaderId,
    fill.type,
    fillLayerProps,
    fillLayerValues,
    onFillPropChange,
    onFillPropInput,
  ]);

  const applyFillValue = useCallback(
    (detail, persist = false) => {
      onSelect?.(fill.id);
      if (detail?.type === "shader") {
        const shaderId = resolveShaderFillKey(
          detail.shaderId ?? fill.shaderId,
          shaderFillCards
        );
        fillValueTypeRef.current = "shader";
        const card = findShaderFillCard(shaderFillCards, shaderId);
        setControlValue(shaderFillControlValue(shaderId, card?.thumbnailUrl));
        if (persist) onApplyShader?.(fill.id, shaderId);
        return;
      }
      if (!isPaintFillType(detail?.type)) return;
      const next = withoutVideoPoster(
        resolvePaintFill(detail, {
          defaultImageUrl: defaultInputUrl,
          defaultVideoUrl,
        })
      );
      const typeChanged = fillValueTypeRef.current !== next.type;
      const prevUrl =
        fill.paint?.image?.url || fill.paint?.video?.url || "";
      const nextUrl = next.image?.url || next.video?.url || "";
      const urlChanged =
        (next.type === "image" || next.type === "video") && prevUrl !== nextUrl;
      const unchangedVideo =
        next.type === "video" &&
        fill.paint?.type === "video" &&
        videoSettingsKey(next) === videoSettingsKey(fill.paint);
      const changedWebcam =
        next.type === "webcam" &&
        webcamSettingsKey(next) !== webcamSettingsKey(fill.paint);
      const shouldPersist =
        persist ||
        typeChanged ||
        urlChanged ||
        changedWebcam ||
        (fillOnly && !unchangedVideo);
      fillValueTypeRef.current = next.type;
      const nextValue = JSON.stringify(next);
      setControlValue(nextValue);
      if (shouldPersist) lastPaintRef.current = nextValue;
      if (next.type === "image" && next.image?.url) {
        lastImageFillUrlRef.current = next.image.url;
      }
      if (!unchangedVideo) {
        onApplyPaint?.(fill.id, next, shouldPersist);
      }
    },
    [
      fill.id,
      fill.paint,
      fill.shaderId,
      fillOnly,
      onApplyPaint,
      onApplyShader,
      onSelect,
      shaderFillCards,
    ]
  );

  useLayoutEffect(() => {
    const next = controlValueFromGraphFill(fill, {
      cards: shaderFillCards,
      imageUrl: imageUrl || defaultInputUrl,
    });
    if (fill.type === "shader") {
      fillValueTypeRef.current = "shader";
      lastPaintRef.current = "";
      setControlValue(next);
      return;
    }
    const paintType = isPaintFillType(fill.paint?.type) ? fill.paint.type : null;
    if (
      next === lastPaintRef.current &&
      paintType &&
      fillValueTypeRef.current === paintType
    ) {
      return;
    }
    lastPaintRef.current = fill.paint ? next : "";
    fillValueTypeRef.current = paintType || fill.type;
    setControlValue(next);
  }, [fill, imageUrl, shaderFillCards]);

  useEffect(() => {
    if (!imageUrl || imageUrl === lastImageFillUrlRef.current) return;
    if (fillValueTypeRef.current !== "image") return;
    const paintUrl =
      fill.paint?.type === "image" &&
      typeof fill.paint.image?.url === "string"
        ? fill.paint.image.url
        : "";
    if (
      paintUrl &&
      imageUrl === defaultInputUrl &&
      paintUrl !== defaultInputUrl
    ) {
      lastImageFillUrlRef.current = imageUrl;
      return;
    }
    lastImageFillUrlRef.current = imageUrl;
    setControlValue(imageFillValueFromUrl(imageUrl));
    setControlKey((key) => key + 1);
  }, [fill.paint, imageUrl]);

  const control =
    fill.type === "html" ? (
      <fig-button type="button" variant="secondary" full="" disabled="">
        HTML fill
      </fig-button>
    ) : (
      <ImageFillInput
        key={controlKey}
        disabled={readOnly || !fill.enabled}
        value={controlValue}
        onChange={applyFillValue}
        allowShader
        shaderName={shaderFillName}
        shaderId={fill.shaderId || ""}
        shaderThumbnail={shaderFillCard?.thumbnailUrl || ""}
        shaderLibraryEmpty={shaderFillCards.length === 0}
        properties={fillProperties}
        resetDisabled={fillPropertiesAtDefaults}
        onChooseShader={() => onChooseShader?.(fill.id)}
        onOpenShader={(shaderId) => {
          onSelect?.(fill.id);
          onOpenShader?.(shaderId);
        }}
        onResetProperties={() => {
          onSelect?.(fill.id);
          onResetLayer?.(fill.id);
        }}
        pickerAnchorId={fillShaderAnchorId(fill.id)}
        pickerTriggerId={fillShaderTriggerId(fill.id)}
        dialogAnchor={fill.id}
        autoOpen={autoOpen}
        onOpenPicker={() => onOpenPicker?.(fill.id)}
        onClosePicker={() => onClosePicker?.(fill.id)}
        onAutoOpened={onAutoOpened}
      />
    );

  return (
    <PropertiesLayerRow
      id={layerPropsAnchorId(fill.id)}
      name={
        fill.type === "shader"
          ? shaderFillName
          : `${fillTypeLabel(fill.paint?.type || fill.type)} fill`
      }
      expanded={expanded}
      enabled={fill.enabled}
      readOnly={readOnly}
      noun="fill"
      control={
        <div
          className="composition-fill-control"
          onPointerDown={() => onSelect?.(fill.id)}
          onFocusCapture={() => onSelect?.(fill.id)}
          onClickCapture={() => onOpenPicker?.(fill.id)}
        >
          {control}
        </div>
      }
      onToggleVisible={() => onToggleVisible?.(fill.id)}
      onRemove={() => onRemove?.(fill.id)}
    />
  );
}

export default function CompositionEditor({
  graph,
  resolvedByKey,
  fillCards = [],
  effectCards = [],
  nameCards = [],
  readOnly = false,
  layerControls = null,
  onChange,
  onSelectLayer,
  onPropertiesLayerChange,
  onOpenShader,
  onResetLayer,
  onFill,
  onFillValuesPreview,
  imageUrl = defaultInputUrl,
  onExport,
  exportDisabled = false,
  fillOnly = false,
  experimentalAudio = false,
  onSupportsAudioChange,
}) {
  const propertiesPopupRef = useRef(null);
  const propertiesContentRef = useRef(null);
  const propertiesContentFadeRef = useOverflowFade(propertiesContentRef);
  const fillsReorderRef = useRef(null);
  const effectsReorderRef = useRef(null);
  const [effectPickerOpen, setEffectPickerOpen] = useState(false);
  const [fillPicker, setFillPicker] = useState({
    open: false,
    targetId: null,
    source: "nested",
  });
  const [propertiesLayerId, setPropertiesLayerId] = useState(null);
  const [fillCanvasLayerId, setFillCanvasLayerId] = useState(null);
  const [autoOpenFillId, setAutoOpenFillId] = useState(null);
  const propertiesLayerIdRef = useRef(null);
  propertiesLayerIdRef.current = propertiesLayerId;
  const normalized = useMemo(() => normalizeComposition(graph), [graph]);
  const imageFillTargetIdRef = useRef(normalized.fill?.id || null);
  const lastExternalImageUrlRef = useRef(imageUrl);
  const [externalImage, setExternalImage] = useState(() => ({
    fillId: normalized.fill?.id || null,
    url: imageUrl,
  }));

  const update = useCallback(
    (next) => {
      if (readOnly) return;
      onChange?.(normalizeComposition(next));
    },
    [onChange, readOnly]
  );

  const shaderFillCards = useMemo(
    () => fillCards.filter((card) => card.kind === "fill"),
    [fillCards]
  );

  const propertiesFill = normalized.fills.find(
    (fill) => fill.id === propertiesLayerId
  );
  const propertiesEffect = normalized.effects.find(
    (effect) => effect.id === propertiesLayerId
  );
  const propertiesShaderId = propertiesFill
    ? propertiesFill.type === "shader"
      ? propertiesFill.shaderId
      : null
    : propertiesEffect?.shaderId ?? null;
  const propertiesLayerSource = useMemo(() => {
    if (!propertiesShaderId) return null;
    return resolveReferencedShaderSource(propertiesShaderId, {
      resolvedByKey,
    });
  }, [propertiesShaderId, resolvedByKey]);
  const propertiesLayerProps = useMemo(() => {
    if (!propertiesLayerSource) return null;
    try {
      return loadModule(propertiesLayerSource).props || {};
    } catch {
      return null;
    }
  }, [propertiesLayerSource]);
  const propertiesAtDefaults = useMemo(
    () =>
      valuesMatchDefaults(
        propertiesLayerProps,
        propertiesFill?.values ?? propertiesEffect?.values
      ),
    [propertiesEffect, propertiesFill, propertiesLayerProps]
  );
  const propertiesLayerEnabled = propertiesFill
    ? propertiesFill.enabled
    : propertiesEffect
      ? propertiesEffect.enabled
      : false;

  useEffect(() => {
    if (propertiesLayerId && !propertiesLayerEnabled) {
      setPropertiesLayerId(null);
    }
  }, [propertiesLayerEnabled, propertiesLayerId]);

  const openPropertiesLayerId =
    propertiesLayerId && propertiesLayerEnabled ? propertiesLayerId : null;
  const handlesLayerId = openPropertiesLayerId || fillCanvasLayerId;

  useEffect(() => {
    onPropertiesLayerChange?.(handlesLayerId);
  }, [onPropertiesLayerChange, handlesLayerId]);

  useEffect(
    () => () => onPropertiesLayerChange?.(null),
    [onPropertiesLayerChange]
  );

  useEffect(() => {
    if (imageUrl === lastExternalImageUrlRef.current) return;
    lastExternalImageUrlRef.current = imageUrl;
    setExternalImage({
      fillId: imageFillTargetIdRef.current || normalized.fill?.id || null,
      url: imageUrl,
    });
  }, [imageUrl, normalized.fill?.id]);

  useEffect(() => {
    const list = fillsReorderRef.current;
    if (!list) return undefined;
    const onReorder = (event) => {
      const { oldIndex, newIndex } = event.detail ?? {};
      update(reorderCompositionFills(normalized, oldIndex, newIndex));
    };
    list.addEventListener("reorder", onReorder);
    return () => list.removeEventListener("reorder", onReorder);
  }, [normalized, update]);

  useEffect(() => {
    const list = effectsReorderRef.current;
    if (!list) return undefined;
    const onReorder = (event) => {
      const { oldIndex, newIndex } = event.detail ?? {};
      update(reorderCompositionEffects(normalized, oldIndex, newIndex));
    };
    list.addEventListener("reorder", onReorder);
    return () => list.removeEventListener("reorder", onReorder);
  }, [normalized, update]);

  useEffect(() => {
    const popup = propertiesPopupRef.current;
    if (!popup) return undefined;

    // Keep light dismiss for clicks elsewhere. Canvas-handle pointerdowns
    // are ignored by installCanvasHandlePopupGuard (closedby none for the drag).
    popup.setAttribute("closedby", "any");
    if ("closedBy" in popup) popup.closedBy = "any";

    const onCancel = () => {
      setPropertiesLayerId(null);
    };
    const onClose = () => {
      if (!propertiesLayerIdRef.current) return;
      if (popupProtectedFromHandleDismiss(popup)) {
        popup.open = true;
        return;
      }
      setPropertiesLayerId(null);
    };
    popup.addEventListener("cancel", onCancel);
    popup.addEventListener("close", onClose);

    if (propertiesLayerId && propertiesLayerEnabled) {
      popup.setAttribute("anchor", `#${layerPropsAnchorId(propertiesLayerId)}`);
      popup.open = true;
    } else {
      popup.open = false;
    }

    return () => {
      popup.removeEventListener("cancel", onCancel);
      popup.removeEventListener("close", onClose);
    };
  }, [propertiesLayerEnabled, propertiesLayerId]);

  useEffect(() => {
    syncOverflowFade(propertiesContentRef.current);
  }, [layerControls, openPropertiesLayerId]);

  const effectPickerDisabled =
    readOnly || normalized.effects.length >= MAX_COMPOSITION_EFFECTS;
  const fillPickerDisabled =
    readOnly || normalized.fills.length >= MAX_COMPOSITION_FILLS;

  const onEffectPickerOpenChange = useCallback((next) => {
    setEffectPickerOpen(next);
  }, []);
  const onFillControlOpen = useCallback((fillId) => {
    setPropertiesLayerId(null);
    setEffectPickerOpen(false);
    if (fillId) {
      onSelectLayer?.(fillId);
      setFillCanvasLayerId(fillId);
    }
  }, [onSelectLayer]);
  const onFillControlClose = useCallback((fillId) => {
    setFillCanvasLayerId((current) => (current === fillId ? null : current));
  }, []);

  const addEffect = useCallback(
    (key) => {
      if (normalized.effects.length >= MAX_COMPOSITION_EFFECTS) return;
      const id = crypto.randomUUID();
      update({
        ...normalized,
        effects: [
          ...normalized.effects,
          { id, shaderId: key, values: {}, enabled: true },
        ],
      });
      onSelectLayer?.(id);
    },
    [normalized, onSelectLayer, update]
  );

  const applyShaderFill = useCallback(
    (fillId, requestedId) => {
      const target = normalized.fills.find((fill) => fill.id === fillId);
      if (!target) return;
      const shaderId = resolveShaderFillKey(
        requestedId ?? target.shaderId,
        shaderFillCards
      );
      const sameId = target.shaderId === shaderId;
      update({
        ...normalized,
        fills: normalized.fills.map((fill) =>
          fill.id === fillId
            ? {
                id: fill.id,
                type: "shader",
                shaderId,
                values: sameId ? fill.values : {},
                enabled: fill.enabled,
              }
            : fill
        ),
      });
      onSelectLayer?.(fillId);
    },
    [normalized, onSelectLayer, shaderFillCards, update]
  );

  const applyPaintFill = useCallback(
    (fillId, paint, persist) => {
      if (
        paint?.type === "webcam" &&
        paint.webcam?.live !== false &&
        normalized.fills.some(
          (fill) => fill.id !== fillId && isLiveWebcamFill(fill),
        )
      ) {
        return;
      }
      imageFillTargetIdRef.current = fillId;
      if (persist) {
        update({
          ...normalized,
          fills: normalized.fills.map((fill) =>
            fill.id === fillId
              ? {
                  ...fill,
                  type: graphTypeForPaint(paint.type),
                  shaderId: null,
                  paint,
                }
              : fill
          ),
        });
      }
      onFill?.(paint, fillId);
    },
    [normalized, onFill, update]
  );

  const changeFillValues = useCallback(
    (fillId, values) => {
      update({
        ...normalized,
        fills: normalized.fills.map((fill) =>
          fill.id === fillId ? { ...fill, values } : fill
        ),
      });
    },
    [normalized, update]
  );

  const previewFillValues = useCallback(
    (fillId, values) => {
      onFillValuesPreview?.(values, fillId);
    },
    [onFillValuesPreview]
  );

  const clearAutoOpenFill = useCallback(() => {
    setAutoOpenFillId(null);
  }, []);

  const removeFill = useCallback(
    (fillId) => {
      if (propertiesLayerId === fillId) setPropertiesLayerId(null);
      setFillCanvasLayerId((current) => (current === fillId ? null : current));
      if (autoOpenFillId === fillId) setAutoOpenFillId(null);
      const fills = normalized.fills.filter((fill) => fill.id !== fillId);
      if (fillPicker.targetId === fillId) {
        setFillPicker({ open: false, targetId: null, source: "nested" });
      }
      if (imageFillTargetIdRef.current === fillId) {
        imageFillTargetIdRef.current = fills[0]?.id || null;
      }
      update({ ...normalized, fills });
    },
    [
      autoOpenFillId,
      fillPicker.targetId,
      normalized,
      propertiesLayerId,
      update,
    ]
  );

  const toggleFillVisible = useCallback(
    (fillId) => {
      update({
        ...normalized,
        fills: normalized.fills.map((fill) =>
          fill.id === fillId ? { ...fill, enabled: !fill.enabled } : fill
        ),
      });
    },
    [normalized, update]
  );

  const removeEffect = useCallback(
    (effectId) => {
      if (propertiesLayerId === effectId) {
        setPropertiesLayerId(null);
      }
      update({
        ...normalized,
        effects: normalized.effects.filter((item) => item.id !== effectId),
      });
    },
    [normalized, propertiesLayerId, update]
  );

  const toggleEffectVisible = useCallback(
    (effectId) => {
      update({
        ...normalized,
        effects: normalized.effects.map((item) =>
          item.id === effectId ? { ...item, enabled: !item.enabled } : item
        ),
      });
    },
    [normalized, update]
  );

  const toggleLayerProperties = useCallback(
    (layerId) => {
      if (fillOnly) return;
      const fill = normalized.fills.find((item) => item.id === layerId);
      const effect = normalized.effects.find((item) => item.id === layerId);
      const enabled = fill ? fill.enabled : effect?.enabled;
      if (!enabled) return;
      setFillCanvasLayerId(null);
      if (propertiesLayerIdRef.current === layerId) {
        setPropertiesLayerId(null);
        return;
      }
      onSelectLayer?.(layerId);
      setPropertiesLayerId(layerId);
    },
    [fillOnly, normalized, onSelectLayer]
  );

  const layerCards = useMemo(
    () =>
      nameCards.length ? nameCards : [...shaderFillCards, ...effectCards],
    [effectCards, nameCards, shaderFillCards]
  );
  const onFillPickerOpenChange = useCallback((open) => {
    setFillPicker((current) => ({ ...current, open }));
  }, []);
  const chooseFillShader = useCallback(
    (fillId) => {
      if (readOnly) return;
      onSelectLayer?.(fillId);
      setFillPicker({ open: true, targetId: fillId, source: "nested" });
    },
    [onSelectLayer, readOnly]
  );
  const onFillShaderChoice = useCallback(
    (key) => {
      if (!fillPicker.targetId) return;
      applyShaderFill(fillPicker.targetId, key);
    },
    [applyShaderFill, fillPicker.targetId]
  );

  const addFill = useCallback(
    (type) => {
      if (
        readOnly ||
        normalized.fills.length >= MAX_COMPOSITION_FILLS ||
        (!isPaintFillType(type) && type !== "shader")
      ) {
        return;
      }
      if (type === "webcam" && liveWebcamFillCount(normalized) > 0) {
        return;
      }
      const fill =
        type === "shader"
          ? {
              id: crypto.randomUUID(),
              type: "shader",
              shaderId: null,
              values: {},
              enabled: true,
            }
          : createPaintCompositionFill(type);
      update({ ...normalized, fills: [fill, ...normalized.fills] });
      onSelectLayer?.(fill.id);
      if (type === "shader") {
        setFillPicker({ open: true, targetId: fill.id, source: "header" });
        return;
      }
      setAutoOpenFillId(fill.id);
    },
    [normalized, onSelectLayer, readOnly, update]
  );
  const fillMenuRef = useFigMenuChange(addFill);

  useEffect(() => {
    if (!fillPicker.open || fillPicker.source !== "nested") return undefined;
    const dialog = fillPicker.targetId
      ? document.querySelector(fillDialogAnchorSelector(fillPicker.targetId))
      : document.querySelector("dialog.fig-fill-picker-dialog");
    if (!dialog) return undefined;
    const previous = dialog.getAttribute("closedby");
    dialog.setAttribute("closedby", "none");
    if ("closedBy" in dialog) dialog.closedBy = "none";
    return () => {
      if (previous == null) dialog.removeAttribute("closedby");
      else dialog.setAttribute("closedby", previous);
      if ("closedBy" in dialog) {
        dialog.closedBy = previous == null ? "any" : previous;
      }
    };
  }, [fillPicker.open, fillPicker.source, fillPicker.targetId]);
  const propertiesNoun = propertiesFill ? "fill" : "effect";
  const propertiesTitle = propertiesLayerId
    ? compositionLayerName(
        propertiesShaderId,
        resolvedByKey,
        layerCards,
        propertiesFill ? "Fill properties" : "Effect properties"
      )
    : "Properties";
  const fillPickerTriggerId =
    fillPicker.source === "header"
      ? ADD_FILL_TRIGGER_ID
      : fillPicker.targetId
        ? fillShaderTriggerId(fillPicker.targetId)
        : SHADER_PICKER_TRIGGER_IDS.fill;
  const fillPickerAnchor =
    fillPicker.source === "header"
      ? `#${SHADER_PICKER_ANCHOR_IDS.fill}`
      : fillPicker.targetId
        ? fillDialogAnchorSelector(fillPicker.targetId)
        : `#${SHADER_PICKER_ANCHOR_IDS.fill}`;

  return (
    <>
      <div className="properties-pane">
        <fig-header id={SHADER_PICKER_ANCHOR_IDS.fill} borderless>
          <h3>Fill</h3>
          {!readOnly && (
            <hstack>
              <fig-menu ref={fillMenuRef} position="bottom right">
                <fig-tooltip text="Add fill">
                  <fig-button
                    id={ADD_FILL_TRIGGER_ID}
                    fig-menu-trigger=""
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label="Add fill"
                    disabled={fillPickerDisabled ? "" : undefined}
                  >
                    <fig-icon name="add" />
                  </fig-button>
                </fig-tooltip>
                <fig-menu-item value="solid">Solid</fig-menu-item>
                <fig-menu-item value="gradient">Gradient</fig-menu-item>
                <fig-menu-item value="image">Image</fig-menu-item>
                <fig-menu-item value="video">Video</fig-menu-item>
                <fig-menu-item
                  value="webcam"
                  disabled={liveWebcamFillCount(normalized) > 0 ? "" : undefined}
                >
                  Webcam
                </fig-menu-item>
                <fig-menu-item value="shader">Shader</fig-menu-item>
              </fig-menu>
            </hstack>
          )}
        </fig-header>
        {normalized.fills.length >= MAX_COMPOSITION_FILLS && (
          <p className="composition-notice">
            A composition can use up to {MAX_COMPOSITION_FILLS} fills.
          </p>
        )}
        {normalized.fills.length > 0 && (
          <fig-reorder
            ref={fillsReorderRef}
            class="composition-effect-list"
            axis="vertical"
            disabled={readOnly ? "" : undefined}
            aria-label="Fills"
          >
            {normalized.fills.map((fill) => (
              <FillLayerEditor
                key={fill.id}
                fill={fill}
                readOnly={readOnly}
                fillOnly={fillOnly}
                imageUrl={
                  externalImage.fillId === fill.id ? externalImage.url : null
                }
                shaderFillCards={shaderFillCards}
                layerCards={layerCards}
                resolvedByKey={resolvedByKey}
                expanded={propertiesLayerId === fill.id}
                onSelect={onSelectLayer}
                onApplyPaint={applyPaintFill}
                onApplyShader={applyShaderFill}
                onChooseShader={chooseFillShader}
                onOpenShader={onOpenShader}
                onResetLayer={onResetLayer}
                onPreviewValues={previewFillValues}
                onChangeValues={changeFillValues}
                onToggleVisible={toggleFillVisible}
                onRemove={removeFill}
                onOpenPicker={onFillControlOpen}
                onClosePicker={onFillControlClose}
                autoOpen={autoOpenFillId === fill.id}
                onAutoOpened={clearAutoOpenFill}
              />
            ))}
          </fig-reorder>
        )}
      </div>

      {!fillOnly && (
        <div className="properties-pane">
          <fig-header id={SHADER_PICKER_ANCHOR_IDS.effect} borderless>
            <h3>Effects</h3>
            {!readOnly && (
              <hstack>
                <fig-tooltip text="Add shader effect">
                  <fig-button
                    id={SHADER_PICKER_TRIGGER_IDS.effect}
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label="Add shader effect"
                    aria-haspopup="dialog"
                    aria-expanded="false"
                    disabled={effectPickerDisabled ? "" : undefined}
                  >
                    <fig-icon name="add" />
                  </fig-button>
                </fig-tooltip>
              </hstack>
            )}
          </fig-header>
          {normalized.effects.length >= MAX_COMPOSITION_EFFECTS && (
            <p className="composition-notice">
              A composition can use up to {MAX_COMPOSITION_EFFECTS} effects.
            </p>
          )}
          {normalized.effects.length > 0 && (
            <fig-reorder
              ref={effectsReorderRef}
              class="composition-effect-list"
              axis="vertical"
              disabled={readOnly ? "" : undefined}
              aria-label="Effects"
            >
              {normalized.effects.map((effect) => (
                <PropertiesLayerRow
                  key={effect.id}
                  id={layerPropsAnchorId(effect.id)}
                  name={compositionLayerName(
                    effect.shaderId,
                    resolvedByKey,
                    layerCards,
                    "Shader effect"
                  )}
                  expanded={propertiesLayerId === effect.id}
                  enabled={effect.enabled}
                  readOnly={readOnly}
                  onOpen={() => toggleLayerProperties(effect.id)}
                  onToggleVisible={() => toggleEffectVisible(effect.id)}
                  onRemove={() => removeEffect(effect.id)}
                />
              ))}
            </fig-reorder>
          )}
        </div>
      )}

      {!fillOnly && (
        <DocumentInputsPane
          inputs={normalized.inputs}
          readOnly={readOnly}
          experimentalAudio={experimentalAudio}
          hasLiveWebcam={liveWebcamFillCount(normalized) > 0}
          onChange={(nextInputs) => update({ ...normalized, inputs: nextInputs })}
          onSupportsAudioChange={onSupportsAudioChange}
        />
      )}

      {!fillOnly && (
        <ExportPropertiesPane
          disabled={exportDisabled}
          onExport={onExport}
        />
      )}

      <ShaderPicker
        kind="fill"
        cards={shaderFillCards}
        open={fillPicker.open}
        disabled={readOnly}
        captureTrigger={false}
        triggerId={fillPickerTriggerId}
        anchor={fillPickerAnchor}
        position="left"
        onOpenChange={onFillPickerOpenChange}
        onChoice={onFillShaderChoice}
      />

      {!fillOnly && (
        <ShaderPicker
          kind="effect"
          cards={effectCards}
          open={effectPickerOpen}
          disabled={effectPickerDisabled}
          onOpenChange={onEffectPickerOpenChange}
          onChoice={addEffect}
        />
      )}

      {!fillOnly &&
        portalToFigOverlay(
          <dialog
            is="fig-popup"
            ref={propertiesPopupRef}
            class="composition-layer-props"
            position="left"
            popover="manual"
            closedby="any"
            anchor={
              propertiesLayerId
                ? `#${layerPropsAnchorId(propertiesLayerId)}`
                : undefined
            }
            onCancel={() => setPropertiesLayerId(null)}
          >
            <fig-header>
              <h3>{propertiesTitle}</h3>
              <hstack style={{ "--hstack-gap": "var(--spacer-1)" }}>
                {propertiesShaderId && (
                  <OpenShaderButton
                    shaderId={propertiesShaderId}
                    noun={propertiesNoun}
                    onOpen={onOpenShader}
                  />
                )}
                <ResetPropertiesButton
                  hidden={readOnly}
                  disabled={propertiesAtDefaults}
                  onReset={() => {
                    if (propertiesLayerId) onSelectLayer?.(propertiesLayerId);
                    onResetLayer?.(propertiesLayerId);
                  }}
                />
                <fig-tooltip text="Close">
                  <fig-button
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label="Close"
                    onClick={() => setPropertiesLayerId(null)}
                  >
                    <fig-icon name="close" />
                  </fig-button>
                </fig-tooltip>
              </hstack>
            </fig-header>
            <fig-content
              ref={propertiesContentFadeRef}
              class="composition-layer-props-content"
            >
              {layerControls}
            </fig-content>
          </dialog>
        )}
    </>
  );
}
