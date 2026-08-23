import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  COMPOSITION_FILL_ID,
  compositionLayerName,
  compositionRefAliases,
  hasCompositionFill,
  MAX_COMPOSITION_EFFECTS,
  mergeLayerValues,
  normalizeComposition,
  reorderCompositionEffects,
  resolveReferencedShaderSource,
  resolveShaderFillKey,
} from "../lib/composition.js";
import { graphTypeForPaint, isPaintFillType, resolvePaintFill } from "../lib/paintFill.js";
import { portalToFigOverlay } from "../lib/figOverlay.js";
import { useOverflowFade } from "../hooks/useOverflowFade.js";
import { syncOverflowFade } from "../lib/overflowFade.js";
import { loadModule } from "../runtime/loader.js";
import defaultInputUrl from "../assets/default-input.png";
import { defaultVideoUrl } from "../runtime/sample.js";
import Controls from "./Controls.jsx";
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

function findShaderFillCard(cards, shaderId) {
  const aliases = new Set(compositionRefAliases(shaderId));
  return (cards || []).find((card) => aliases.has(card?.key)) ?? null;
}

function imageFillValueFromUrl(url) {
  return JSON.stringify({
    type: "image",
    image: { url, scaleMode: "fill" },
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

function ResetPropertiesButton({ disabled = false, onReset }) {
  if (disabled) return null;
  return (
    <fig-tooltip text="Reset properties">
      <fig-button
        type="button"
        variant="ghost"
        icon="true"
        aria-label="Reset properties"
        onClick={onReset}
      >
        <fig-icon name="reset" />
      </fig-button>
    </fig-tooltip>
  );
}

function PropertiesLayerRow({
  id,
  name,
  expanded = false,
  enabled = true,
  readOnly = false,
  noun = "effect",
  control = null,
  onOpen,
  onToggleVisible,
  onRemove,
}) {
  const hideLabel = enabled ? `Hide ${noun}` : `Show ${noun}`;
  const removeLabel = `Remove ${noun}`;
  return (
    <div id={id} className="properties-layer-row" aria-label={name}>
      {control || (
        <fig-button
          type="button"
          variant={expanded ? "ghost" : "secondary"}
          full=""
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
            <fig-icon name={enabled ? "visible" : "hidden"} />
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
  onChoose,
  onOpenShader,
  onResetProperties,
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
    dialog?.setAttribute(FILL_PICKER_DIALOG_ANCHOR, "");
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
  }, []);

  return (
    <fig-content ref={rootRef} style={{ paddingTop: 0 }}>
      <fig-header id={SHADER_PICKER_ANCHOR_IDS.fill} borderless="">
        <fig-select
          ref={selectRef}
          id={SHADER_PICKER_TRIGGER_IDS.fill}
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
            disabled={disabled}
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
      {properties}
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
  onChooseShader,
  onOpenShader,
  onResetProperties,
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
    onChoose: onChooseShader,
    onOpenShader,
    onResetProperties,
  });
  shaderModePropsRef.current = {
    name: shaderName,
    shaderId,
    thumbnailUrl: shaderThumbnail,
    disabled,
    emptyLibrary: shaderLibraryEmpty,
    properties,
    onChoose: onChooseShader,
    onOpenShader,
    onResetProperties,
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
    node.addEventListener("input", handleValue);
    node.addEventListener("change", handleValue);
    picker.addEventListener("webcamstream", handleWebcamStream);
    return () => {
      node.removeEventListener("input", handleValue);
      node.removeEventListener("change", handleValue);
      picker.removeEventListener("webcamstream", handleWebcamStream);
    };
  }, [allowShader, onChange]);

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
    shaderId,
    shaderLibraryEmpty,
    shaderName,
    shaderThumbnail,
    properties,
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
}) {
  const propertiesPopupRef = useRef(null);
  const propertiesContentRef = useRef(null);
  const propertiesContentFadeRef = useOverflowFade(propertiesContentRef);
  const effectsReorderRef = useRef(null);
  const [effectPickerOpen, setEffectPickerOpen] = useState(false);
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  const [propertiesLayerId, setPropertiesLayerId] = useState(null);
  const propertiesLayerIdRef = useRef(null);
  propertiesLayerIdRef.current = propertiesLayerId;
  const [imageFillValue, setImageFillValue] = useState(() =>
    controlValueFromGraphFill(graph?.fill, {
      cards: fillCards,
      imageUrl: imageUrl || defaultInputUrl,
    })
  );
  const [imageFillKey, setImageFillKey] = useState(0);
  const lastImageFillUrlRef = useRef(
    (typeof graph?.fill?.paint?.image?.url === "string" &&
      graph.fill.paint.image.url) ||
      imageUrl ||
      defaultInputUrl
  );
  const fillValueTypeRef = useRef(graph?.fill?.paint?.type || "image");
  const lastPaintRef = useRef(
    graph?.fill?.paint ? JSON.stringify(graph.fill.paint) : ""
  );
  const normalized = useMemo(() => normalizeComposition(graph), [graph]);

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

  const propertiesLayerEnabled =
    propertiesLayerId === COMPOSITION_FILL_ID
      ? normalized.fill.enabled
      : normalized.effects.find((effect) => effect.id === propertiesLayerId)
          ?.enabled !== false;

  useEffect(() => {
    if (propertiesLayerId && !propertiesLayerEnabled) {
      setPropertiesLayerId(null);
    }
  }, [propertiesLayerEnabled, propertiesLayerId]);

  const openPropertiesLayerId =
    propertiesLayerId && propertiesLayerEnabled ? propertiesLayerId : null;

  useEffect(() => {
    onPropertiesLayerChange?.(openPropertiesLayerId);
  }, [onPropertiesLayerChange, openPropertiesLayerId]);

  useEffect(
    () => () => onPropertiesLayerChange?.(null),
    [onPropertiesLayerChange]
  );

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

    const lockDismiss = () => {
      popup.setAttribute("closedby", "none");
      if ("closedBy" in popup) popup.closedBy = "none";
    };
    lockDismiss();

    const onCancel = (event) => {
      event.preventDefault();
    };
    const onClose = () => {
      if (!propertiesLayerIdRef.current) return;
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

  const fillType = hasCompositionFill(normalized.fill)
    ? normalized.fill.type
    : "image";
  const effectPickerDisabled =
    readOnly || normalized.effects.length >= MAX_COMPOSITION_EFFECTS;

  const onEffectPickerOpenChange = useCallback((next) => {
    setEffectPickerOpen(next);
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
    (requestedId, persist = true) => {
      const shaderId = resolveShaderFillKey(
        requestedId ?? normalized.fill.shaderId,
        shaderFillCards
      );
      fillValueTypeRef.current = "shader";
      const card = findShaderFillCard(shaderFillCards, shaderId);
      const nextValue = shaderFillControlValue(shaderId, card?.thumbnailUrl);
      setImageFillValue(nextValue);
      if (!shaderId || !persist) return;
      const sameId = normalized.fill.shaderId === shaderId;
      update({
        ...normalized,
        fill: {
          type: "shader",
          shaderId,
          values: sameId ? normalized.fill.values : {},
          enabled: normalized.fill.enabled,
        },
      });
      onSelectLayer?.(COMPOSITION_FILL_ID);
    },
    [normalized, onSelectLayer, shaderFillCards, update]
  );

  const fillShaderSource = useMemo(() => {
    if (normalized.fill.type !== "shader" || !normalized.fill.shaderId) {
      return null;
    }
    const resolved = resolveReferencedShaderSource(normalized.fill.shaderId, {
      resolvedByKey,
    });
    if (resolved) return resolved;
    const card = findShaderFillCard(shaderFillCards, normalized.fill.shaderId);
    return card?.draft?.source || card?.cloud?.source || null;
  }, [
    normalized.fill.shaderId,
    normalized.fill.type,
    resolvedByKey,
    shaderFillCards,
  ]);

  const fillLayerProps = useMemo(() => {
    if (normalized.fill.type !== "shader" || !fillShaderSource) return null;
    try {
      return loadModule(fillShaderSource).props || {};
    } catch {
      return null;
    }
  }, [fillShaderSource, normalized.fill.type]);

  const fillLayerValues = useMemo(
    () => mergeLayerValues(fillLayerProps || {}, normalized.fill.values),
    [fillLayerProps, normalized.fill.values]
  );

  const onFillPropInput = useCallback(
    (name, value) => {
      if (readOnly) return;
      onFillValuesPreview?.({
        ...normalized.fill.values,
        [name]: value,
      });
    },
    [normalized.fill.values, onFillValuesPreview, readOnly]
  );

  const onFillPropChange = useCallback(
    (name, value) => {
      if (readOnly) return;
      const nextValues = { ...normalized.fill.values, [name]: value };
      onFillValuesPreview?.(nextValues);
      update({
        ...normalized,
        fill: { ...normalized.fill, values: nextValues },
      });
    },
    [normalized, onFillValuesPreview, readOnly, update]
  );

  const fillProperties = useMemo(() => {
    if (normalized.fill.type !== "shader") return null;
    if (!normalized.fill.shaderId) {
      return (
        <fig-field>
          <p className="empty-state">Choose a shader fill to edit its properties.</p>
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
    fillLayerProps,
    fillLayerValues,
    normalized.fill.shaderId,
    normalized.fill.type,
    onFillPropChange,
    onFillPropInput,
  ]);

  const applyFillValue = useCallback(
    (detail, persist = false) => {
      if (detail?.type === "shader") {
        applyShaderFill(detail.shaderId, persist);
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
        normalized.fill.paint?.image?.url ||
        normalized.fill.paint?.video?.url ||
        "";
      const nextUrl = next.image?.url || next.video?.url || "";
      const urlChanged =
        (next.type === "image" || next.type === "video") && prevUrl !== nextUrl;
      const shouldPersist = persist || typeChanged || urlChanged || fillOnly;
      fillValueTypeRef.current = next.type;
      const nextValue = JSON.stringify(next);
      setImageFillValue(nextValue);
      if (shouldPersist) {
        lastPaintRef.current = nextValue;
        update({
          ...normalized,
          fill: {
            ...normalized.fill,
            type: graphTypeForPaint(next.type),
            shaderId: normalized.fill.shaderId,
            paint: next,
          },
        });
      }
      if (next.type === "image") {
        const url =
          typeof next.image?.url === "string" && next.image.url
            ? next.image.url
            : null;
        if (url) lastImageFillUrlRef.current = url;
      }
      onFill?.(next);
    },
    [applyShaderFill, fillOnly, normalized, onFill, update]
  );

  const shaderFillCard = useMemo(
    () => findShaderFillCard(shaderFillCards, normalized.fill.shaderId),
    [normalized.fill.shaderId, shaderFillCards]
  );

  useLayoutEffect(() => {
    const next = controlValueFromGraphFill(normalized.fill, {
      cards: shaderFillCards,
      imageUrl: imageUrl || defaultInputUrl,
    });
    if (normalized.fill.type === "shader") {
      fillValueTypeRef.current = "shader";
      lastPaintRef.current = "";
      setImageFillValue(next);
      return;
    }
    const paintType = isPaintFillType(normalized.fill.paint?.type)
      ? normalized.fill.paint.type
      : null;
    if (
      next === lastPaintRef.current &&
      paintType &&
      fillValueTypeRef.current === paintType
    ) {
      return;
    }
    lastPaintRef.current = normalized.fill.paint ? next : "";
    fillValueTypeRef.current = paintType || normalized.fill.type;
    setImageFillValue(next);
  }, [imageUrl, normalized.fill, shaderFillCards]);

  useEffect(() => {
    if (!imageUrl || imageUrl === lastImageFillUrlRef.current) return;
    if (fillValueTypeRef.current !== "image") return;
    const paintUrl =
      normalized.fill.paint?.type === "image" &&
      typeof normalized.fill.paint.image?.url === "string"
        ? normalized.fill.paint.image.url
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
    setImageFillValue(imageFillValueFromUrl(imageUrl));
    setImageFillKey((key) => key + 1);
  }, [imageUrl, normalized.fill.paint]);

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
      const enabled =
        layerId === COMPOSITION_FILL_ID
          ? normalized.fill.enabled
          : normalized.effects.find((effect) => effect.id === layerId)
              ?.enabled !== false;
      if (!enabled) return;
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
  const shaderFillName = compositionLayerName(
    normalized.fill.shaderId,
    resolvedByKey,
    layerCards,
    "Choose a shader fill"
  );
  const onFillPickerOpenChange = useCallback((next) => {
    setFillPickerOpen(next);
  }, []);
  const chooseFillShader = useCallback(() => {
    if (readOnly) return;
    setFillPickerOpen(true);
  }, [readOnly]);
  const onFillShaderChoice = useCallback(
    (key) => {
      applyShaderFill(key, true);
    },
    [applyShaderFill]
  );

  useEffect(() => {
    if (!fillPickerOpen) return undefined;
    const dialog = document.querySelector("dialog.fig-fill-picker-dialog");
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
  }, [fillPickerOpen]);
  const propertiesNoun =
    propertiesLayerId === COMPOSITION_FILL_ID ? "fill" : "effect";
  const propertiesShaderId =
    propertiesLayerId === COMPOSITION_FILL_ID
      ? normalized.fill.type === "shader"
        ? normalized.fill.shaderId
        : null
      : normalized.effects.find((effect) => effect.id === propertiesLayerId)
          ?.shaderId ?? null;
  const propertiesTitle = propertiesLayerId
    ? compositionLayerName(
        propertiesShaderId,
        resolvedByKey,
        layerCards,
        propertiesLayerId === COMPOSITION_FILL_ID
          ? "Fill properties"
          : "Effect properties"
      )
    : "Properties";

  return (
    <>
      <div className="properties-pane">
        <fig-header borderless>
          <h3>Fill</h3>
        </fig-header>
        {fillType !== "html" ? (
          <ImageFillInput
            key={imageFillKey}
            disabled={readOnly}
            value={imageFillValue}
            onChange={applyFillValue}
            allowShader={!fillOnly}
            shaderName={shaderFillName}
            shaderId={normalized.fill.shaderId || ""}
            shaderThumbnail={shaderFillCard?.thumbnailUrl || ""}
            shaderLibraryEmpty={shaderFillCards.length === 0}
            properties={fillProperties}
            onChooseShader={chooseFillShader}
            onOpenShader={onOpenShader}
            onResetProperties={onResetLayer}
          />
        ) : null}
      </div>

      {!fillOnly && <div className="properties-pane">
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
      </div>}

      {!fillOnly && (
      <ExportPropertiesPane
        disabled={exportDisabled}
        onExport={onExport}
      />
      )}

      {!fillOnly && (
      <ShaderPicker
        kind="fill"
        cards={shaderFillCards}
        open={fillPickerOpen}
        disabled={readOnly}
        captureTrigger={false}
        triggerId={SHADER_PICKER_TRIGGER_IDS.fill}
        anchor={`dialog[${FILL_PICKER_DIALOG_ANCHOR}]`}
        position="left"
        onOpenChange={onFillPickerOpenChange}
        onChoice={onFillShaderChoice}
      />
      )}

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

      {!fillOnly && portalToFigOverlay(
        <dialog
          is="fig-popup"
          ref={propertiesPopupRef}
          class="composition-layer-props"
          position="left"
          popover="manual"
          closedby="none"
          anchor={
            propertiesLayerId
              ? `#${layerPropsAnchorId(propertiesLayerId)}`
              : undefined
          }
          onCancel={(event) => event.preventDefault()}
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
                disabled={readOnly}
                onReset={() => onResetLayer?.()}
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
