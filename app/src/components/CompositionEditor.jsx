import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COMPOSITION_FILL_ID,
  emptyComposition,
  MAX_COMPOSITION_EFFECTS,
  normalizeComposition,
  reorderCompositionEffects,
} from "../lib/composition.js";
import { portalToFigOverlay } from "../lib/figOverlay.js";
import { useFigMenuChange } from "../hooks/useFigMenuChange.js";
import ShaderPicker, {
  SHADER_PICKER_ANCHOR_IDS,
  SHADER_PICKER_TRIGGER_IDS,
} from "./ShaderPicker.jsx";
import "./CompositionEditor.css";

const opaqueContent = { __html: "" };
const EMPTY_IMAGE_FILL_VALUE = JSON.stringify({ type: "image" });

const FILL_TYPE_OPTIONS = [
  { value: "shader", label: "Shader fill" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "html", label: "HTML-in-canvas" },
];

function layerName(resolved, fallback) {
  if (resolved?.broken) return resolved.name || "Missing shader";
  return resolved?.name || fallback;
}

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
            variant="secondary"
            full=""
            aria-haspopup="dialog"
            aria-expanded={expanded ? "true" : "false"}
            selected={expanded ? "" : undefined}
            disabled={enabled ? undefined : ""}
            onClick={onOpen}
          >
            <fig-truncate>{name}</fig-truncate>
          </fig-button>
        )}
      </div>
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
      onChange(detail);
    };
    node.addEventListener("input", handleValue);
    node.addEventListener("change", handleValue);
    return () => {
      node.removeEventListener("input", handleValue);
      node.removeEventListener("change", handleValue);
    };
  }, [onChange]);

  return (
    <fig-input-fill
      ref={ref}
      mode="image"
      alpha="false"
      value={value}
      disabled={disabled ? "" : undefined}
      aria-label="Image fill"
      dangerouslySetInnerHTML={opaqueContent}
    />
  );
}

export default function CompositionEditor({
  graph,
  resolvedByKey,
  fillCards = [],
  effectCards = [],
  readOnly = false,
  layerControls = null,
  onChange,
  onSelectLayer,
  onPropertiesLayerChange,
  onResetLayer,
  onMediaFill,
  onImageFill,
}) {
  const propertiesPopupRef = useRef(null);
  const effectsReorderRef = useRef(null);
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  const [effectPickerOpen, setEffectPickerOpen] = useState(false);
  const [propertiesLayerId, setPropertiesLayerId] = useState(null);
  const [imageFillValue, setImageFillValue] = useState(EMPTY_IMAGE_FILL_VALUE);
  const [imageFillKey, setImageFillKey] = useState(0);
  const lastImageFillUrlRef = useRef(null);
  const normalized = useMemo(() => normalizeComposition(graph), [graph]);

  const update = useCallback(
    (next) => {
      if (readOnly) return;
      onChange?.(normalizeComposition(next));
    },
    [onChange, readOnly]
  );

  const setFillType = useCallback(
    (type) => {
      if (type === "shader") {
        setEffectPickerOpen(false);
        setFillPickerOpen(true);
        return;
      }
      update({
        ...normalized,
        fill: {
          type,
          shaderId: null,
          enabled: true,
        },
      });
      onMediaFill?.(type);
      if (type === "image") {
        setImageFillValue(EMPTY_IMAGE_FILL_VALUE);
        setImageFillKey((key) => key + 1);
        lastImageFillUrlRef.current = null;
      }
    },
    [normalized, onMediaFill, update]
  );

  const shaderFillCards = useMemo(
    () => fillCards.filter((card) => card.kind === "fill"),
    [fillCards]
  );

  const fillTypeMenuRef = useFigMenuChange((value) => {
    if (FILL_TYPE_OPTIONS.some((option) => option.value === value)) {
      setFillType(value);
    }
  });

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
      if (!propertiesLayerId || !propertiesLayerEnabled) return;
      lockDismiss();
      popup.open = true;
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

  const effectPickerDisabled =
    readOnly || normalized.effects.length >= MAX_COMPOSITION_EFFECTS;

  const onFillPickerOpenChange = useCallback((next) => {
    if (next) setEffectPickerOpen(false);
    setFillPickerOpen(next);
  }, []);

  const onEffectPickerOpenChange = useCallback((next) => {
    if (next) setFillPickerOpen(false);
    setEffectPickerOpen(next);
  }, []);

  const selectFillShader = useCallback(
    (key) => {
      if (!shaderFillCards.some((card) => card.key === key)) return;
      update({
        ...normalized,
        fill: { type: "shader", shaderId: key, enabled: true },
      });
      onSelectLayer?.(COMPOSITION_FILL_ID);
    },
    [normalized, onSelectLayer, shaderFillCards, update]
  );

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

  const removeFill = useCallback(() => {
    if (propertiesLayerId === COMPOSITION_FILL_ID) {
      setPropertiesLayerId(null);
    }
    update({
      ...normalized,
      fill: emptyComposition().fill,
    });
    onMediaFill?.("image");
    setImageFillValue(EMPTY_IMAGE_FILL_VALUE);
    setImageFillKey((key) => key + 1);
    lastImageFillUrlRef.current = null;
  }, [normalized, onMediaFill, propertiesLayerId, update]);

  const applyImageFill = useCallback(
    (detail) => {
      if (detail?.type !== "image") return;
      const url =
        typeof detail.image?.url === "string" && detail.image.url
          ? detail.image.url
          : null;
      if (url === lastImageFillUrlRef.current) return;
      lastImageFillUrlRef.current = url;
      if (!url) {
        onMediaFill?.("image");
        return;
      }
      onImageFill?.(url);
    },
    [onImageFill, onMediaFill]
  );

  const toggleFillVisible = useCallback(() => {
    update({
      ...normalized,
      fill: { ...normalized.fill, enabled: !normalized.fill.enabled },
    });
  }, [normalized, update]);

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

  const openLayerProperties = useCallback(
    (layerId) => {
      const enabled =
        layerId === COMPOSITION_FILL_ID
          ? normalized.fill.enabled
          : normalized.effects.find((effect) => effect.id === layerId)
              ?.enabled !== false;
      if (!enabled) return;
      onSelectLayer?.(layerId);
      setPropertiesLayerId(layerId);
    },
    [normalized, onSelectLayer]
  );

  const fillResolved = normalized.fill.shaderId
    ? resolvedByKey?.get(normalized.fill.shaderId)
    : null;
  const propertiesResolved =
    propertiesLayerId === COMPOSITION_FILL_ID
      ? fillResolved
      : resolvedByKey?.get(
          normalized.effects.find((effect) => effect.id === propertiesLayerId)
            ?.shaderId
        );
  const propertiesTitle = propertiesLayerId
    ? layerName(
        propertiesResolved,
        propertiesLayerId === COMPOSITION_FILL_ID
          ? "Fill properties"
          : "Effect properties"
      )
    : "Properties";

  return (
    <div className="composition-editor">
      <fig-header id={SHADER_PICKER_ANCHOR_IDS.fill} borderless>
        <h3>Fill</h3>
        {!readOnly && (
          <hstack>
            <fig-menu
              ref={fillTypeMenuRef}
              class="composition-fill-type-menu"
              position="bottom right"
            >
              <fig-tooltip text="Add fill">
                <fig-button
                  fig-menu-trigger=""
                  type="button"
                  variant="ghost"
                  icon="true"
                  aria-label="Add fill"
                >
                  <fig-icon name="add" />
                </fig-button>
              </fig-tooltip>
              {FILL_TYPE_OPTIONS.map((option) => (
                <fig-menu-item
                  key={option.value}
                  value={option.value}
                  selected={
                    normalized.fill.type === option.value ? "" : undefined
                  }
                >
                  {option.label}
                </fig-menu-item>
              ))}
            </fig-menu>
          </hstack>
        )}
      </fig-header>
      <PropertiesLayerRow
        id={layerPropsAnchorId(COMPOSITION_FILL_ID)}
        name={
          normalized.fill.type === "shader"
            ? layerName(fillResolved, "Choose a shader fill")
            : FILL_TYPE_OPTIONS.find(
                (option) => option.value === normalized.fill.type
              )?.label ?? "Image"
        }
        expanded={propertiesLayerId === COMPOSITION_FILL_ID}
        enabled={normalized.fill.enabled}
        readOnly={readOnly}
        noun="fill"
        control={
          normalized.fill.type === "image" ? (
            <ImageFillInput
              key={imageFillKey}
              disabled={readOnly}
              value={imageFillValue}
              onChange={applyImageFill}
            />
          ) : null
        }
        onOpen={() => openLayerProperties(COMPOSITION_FILL_ID)}
        onToggleVisible={toggleFillVisible}
        onRemove={removeFill}
      />

      <fig-separator />

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
          {normalized.effects.map((effect) => {
            const resolved = resolvedByKey?.get(effect.shaderId);
            return (
              <PropertiesLayerRow
                key={effect.id}
                id={layerPropsAnchorId(effect.id)}
                name={layerName(resolved, "Shader effect")}
                expanded={propertiesLayerId === effect.id}
                enabled={effect.enabled}
                readOnly={readOnly}
                onOpen={() => openLayerProperties(effect.id)}
                onToggleVisible={() => toggleEffectVisible(effect.id)}
                onRemove={() => removeEffect(effect.id)}
              />
            );
          })}
        </fig-reorder>
      )}

      <ShaderPicker
        kind="fill"
        cards={shaderFillCards}
        open={fillPickerOpen}
        disabled={readOnly}
        onOpenChange={onFillPickerOpenChange}
        onChoice={selectFillShader}
      />
      <ShaderPicker
        kind="effect"
        cards={effectCards}
        open={effectPickerOpen}
        disabled={effectPickerDisabled}
        onOpenChange={onEffectPickerOpenChange}
        onChoice={addEffect}
      />

      {portalToFigOverlay(
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
            <hstack>
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
          <fig-content class="composition-layer-props-content">
            {layerControls}
          </fig-content>
        </dialog>
      )}
    </div>
  );
}
