import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COMPOSITION_FILL_ID,
  compositionLayerName,
  hasCompositionFill,
  MAX_COMPOSITION_EFFECTS,
  normalizeComposition,
  reorderCompositionEffects,
} from "../lib/composition.js";
import { graphTypeForPaint, isPaintFillType, resolvePaintFill } from "../lib/paintFill.js";
import { portalToFigOverlay } from "../lib/figOverlay.js";
import { useOverflowFade } from "../hooks/useOverflowFade.js";
import { syncOverflowFade } from "../lib/overflowFade.js";
import defaultInputUrl from "../assets/default-input.png";
import { defaultVideoUrl } from "../runtime/sample.js";
import ShaderPicker, {
  SHADER_PICKER_ANCHOR_IDS,
  SHADER_PICKER_TRIGGER_IDS,
} from "./ShaderPicker.jsx";
import "./CompositionEditor.css";

const opaqueContent = { __html: "" };

function imageFillValueFromUrl(url) {
  return JSON.stringify({
    type: "image",
    image: { url, scaleMode: "fill" },
  });
}

const FILL_TYPE_OPTIONS = [
  { value: "shader", label: "Shader fill" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "html", label: "HTML-in-canvas" },
];

function layerPropsAnchorId(layerId) {
  return `composition-layer-props-${layerId}`;
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
      <div className="properties-layer-row-name">
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
      </div>
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

function ImageFillInput({ disabled = false, value, onChange }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !onChange) return undefined;
    const handleValue = (event) => {
      const detail = event.detail;
      if (!detail || typeof detail !== "object") return;
      if (detail.type && !isPaintFillType(detail.type)) return;
      onChange(detail, event.type === "change");
    };
    const handleWebcamStream = (event) => {
      if (!event.detail?.stream) return;
      const detail =
        typeof node.value === "string"
          ? (() => {
              try {
                return JSON.parse(node.value);
              } catch {
                return null;
              }
            })()
          : node.value;
      if (detail?.type === "webcam") onChange(detail, false);
    };
    node.addEventListener("input", handleValue);
    node.addEventListener("change", handleValue);
    node.addEventListener("webcamstream", handleWebcamStream);
    return () => {
      node.removeEventListener("input", handleValue);
      node.removeEventListener("change", handleValue);
      node.removeEventListener("webcamstream", handleWebcamStream);
    };
  }, [onChange]);

  return (
    <fig-input-fill
      ref={ref}
      full=""
      value={value}
      disabled={disabled ? "" : undefined}
      webcam-mode="live"
      default-video={defaultVideoUrl}
      aria-label="Fill"
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
  const [propertiesLayerId, setPropertiesLayerId] = useState(null);
  const propertiesLayerIdRef = useRef(null);
  propertiesLayerIdRef.current = propertiesLayerId;
  const [imageFillValue, setImageFillValue] = useState(() =>
    graph?.fill?.paint
      ? JSON.stringify(graph.fill.paint)
      : imageFillValueFromUrl(imageUrl || defaultInputUrl)
  );
  const [imageFillKey, setImageFillKey] = useState(0);
  const lastImageFillUrlRef = useRef(imageUrl || defaultInputUrl);
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

  const applyFillValue = useCallback(
    (detail, persist = false) => {
      if (!isPaintFillType(detail?.type)) return;
      const next = resolvePaintFill(detail, {
        defaultImageUrl: defaultInputUrl,
        defaultVideoUrl,
      });
      fillValueTypeRef.current = next.type;
      if (persist) {
        const nextValue = JSON.stringify(next);
        lastPaintRef.current = nextValue;
        setImageFillValue(nextValue);
        update({
          ...normalized,
          fill: {
            ...normalized.fill,
            type: graphTypeForPaint(next.type),
            shaderId: null,
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
    [normalized, onFill, update]
  );

  useEffect(() => {
    const paint = normalized.fill.paint;
    const next = paint ? JSON.stringify(paint) : "";
    if (next === lastPaintRef.current) return;
    lastPaintRef.current = next;
    if (paint && isPaintFillType(paint.type)) {
      fillValueTypeRef.current = paint.type;
      setImageFillValue(next);
    }
  }, [normalized.fill.paint]);

  useEffect(() => {
    if (!imageUrl || imageUrl === lastImageFillUrlRef.current) return;
    if (fillValueTypeRef.current !== "image") return;
    lastImageFillUrlRef.current = imageUrl;
    setImageFillValue(imageFillValueFromUrl(imageUrl));
    setImageFillKey((key) => key + 1);
  }, [imageUrl]);

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
        <PropertiesLayerRow
          id={layerPropsAnchorId(COMPOSITION_FILL_ID)}
          name={
            fillType === "shader"
              ? compositionLayerName(
                  normalized.fill.shaderId,
                  resolvedByKey,
                  layerCards,
                  "Choose a shader fill"
                )
              : FILL_TYPE_OPTIONS.find((option) => option.value === fillType)
                  ?.label ?? "Image"
          }
          expanded={propertiesLayerId === COMPOSITION_FILL_ID}
          enabled={normalized.fill.enabled}
          readOnly={readOnly}
          noun="fill"
          control={
            fillType !== "shader" && fillType !== "html" ? (
              <ImageFillInput
                key={imageFillKey}
                disabled={readOnly}
                value={imageFillValue}
                onChange={applyFillValue}
              />
            ) : null
          }
          onOpen={() => toggleLayerProperties(COMPOSITION_FILL_ID)}
        />
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
        {normalized.effects.length === 0 ? (
          <p className="composition-empty">No effects yet.</p>
        ) : (
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
                <fig-tooltip text={`Open ${propertiesNoun}`}>
                  <fig-button
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label={`Open ${propertiesNoun}`}
                    onClick={() => onOpenShader?.(propertiesShaderId)}
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
              )}
              {!readOnly && (
                <fig-tooltip text="Reset properties">
                  <fig-button
                    type="button"
                    variant="ghost"
                    icon="true"
                    aria-label="Reset properties"
                    onClick={() => onResetLayer?.()}
                  >
                    <fig-icon name="reset" />
                  </fig-button>
                </fig-tooltip>
              )}
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
