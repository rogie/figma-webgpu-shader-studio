import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  COMPOSITION_FILL_ID,
  MAX_COMPOSITION_EFFECTS,
  normalizeComposition,
} from "../lib/composition.js";
import { getFigOverlayRoot } from "../lib/figOverlay.js";
import { useFigMenuChange } from "../hooks/useFigMenuChange.js";
import ShaderEffectPicker, {
  SHADER_EFFECT_PICKER_ANCHOR_ID,
} from "./ShaderEffectPicker.jsx";
import ShaderList from "./ShaderList.jsx";
import "./CompositionEditor.css";

const opaqueContent = { __html: "" };

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

function PropertiesEffectRow({
  id,
  name,
  selected = false,
  expanded = false,
  enabled = true,
  readOnly = false,
  onOpen,
  onToggleVisible,
  onRemove,
}) {
  return (
    <div id={id} className="properties-effect-row">
      <div className="properties-effect-row-name">
        <fig-button
          type="button"
          variant="secondary"
          full=""
          aria-haspopup="dialog"
          aria-expanded={expanded ? "true" : "false"}
          selected={selected ? "" : undefined}
          onClick={onOpen}
        >
          <fig-truncate>{name}</fig-truncate>
        </fig-button>
      </div>
      <fig-tooltip text={enabled ? "Hide effect" : "Show effect"}>
        <fig-button
          type="toggle"
          variant="ghost"
          icon="true"
          selected={enabled}
          disabled={readOnly ? "" : undefined}
          aria-label={enabled ? "Hide effect" : "Show effect"}
          onClick={onToggleVisible}
        >
          <fig-icon name={enabled ? "visible" : "hidden"} />
        </fig-button>
      </fig-tooltip>
      <fig-tooltip text="Remove effect">
        <fig-button
          type="button"
          variant="ghost"
          icon="true"
          disabled={readOnly ? "" : undefined}
          aria-label="Remove effect"
          onClick={onRemove}
        >
          <fig-icon name="minus" />
        </fig-button>
      </fig-tooltip>
    </div>
  );
}

export default function CompositionEditor({
  graph,
  resolvedByKey,
  fillCards = [],
  effectCards = [],
  selectedLayerId,
  readOnly = false,
  layerControls = null,
  onChange,
  onSelectLayer,
  onOpenShader,
  onResetLayer,
  onMediaFill,
}) {
  const fillPickerRef = useRef(null);
  const propertiesPopupRef = useRef(null);
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  const [effectPickerOpen, setEffectPickerOpen] = useState(false);
  const [propertiesLayerId, setPropertiesLayerId] = useState(null);
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
      update({
        ...normalized,
        fill: {
          type,
          shaderId: type === "shader" ? normalized.fill.shaderId : null,
        },
      });
      if (type === "shader") {
        onSelectLayer?.(COMPOSITION_FILL_ID);
        if (!normalized.fill.shaderId) {
          setEffectPickerOpen(false);
          setFillPickerOpen(true);
        }
        return;
      }
      onMediaFill?.(type);
    },
    [normalized, onMediaFill, onSelectLayer, update]
  );

  const fillTypeMenuRef = useFigMenuChange((value) => {
    if (FILL_TYPE_OPTIONS.some((option) => option.value === value)) {
      setFillType(value);
    }
  });

  useEffect(() => {
    const fill = fillPickerRef.current;
    if (!fill) return;
    if (fillPickerOpen) {
      if (!fill.open) fill.showModal();
      return;
    }
    if (fill.open) fill.close();
  }, [fillPickerOpen]);

  useEffect(() => {
    const popup = propertiesPopupRef.current;
    if (!popup) return undefined;
    if (propertiesLayerId) {
      popup.setAttribute("anchor", `#${layerPropsAnchorId(propertiesLayerId)}`);
      popup.open = true;
      return undefined;
    }
    popup.open = false;
    return undefined;
  }, [propertiesLayerId]);

  useEffect(() => {
    if (
      propertiesLayerId === COMPOSITION_FILL_ID &&
      normalized.fill.type !== "shader"
    ) {
      setPropertiesLayerId(null);
    }
  }, [normalized.fill.type, propertiesLayerId]);

  const effectPickerDisabled =
    readOnly || normalized.effects.length >= MAX_COMPOSITION_EFFECTS;

  const onEffectPickerOpenChange = useCallback((next) => {
    if (next) setFillPickerOpen(false);
    setEffectPickerOpen(next);
  }, []);

  const selectFillShader = useCallback(
    (key) => {
      update({
        ...normalized,
        fill: { type: "shader", shaderId: key },
      });
      onSelectLayer?.(COMPOSITION_FILL_ID);
      setFillPickerOpen(false);
    },
    [normalized, onSelectLayer, update]
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
      onSelectLayer?.(layerId);
      setPropertiesLayerId(layerId);
    },
    [onSelectLayer]
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
      <fig-header borderless>
        <h3>Fill</h3>
        {!readOnly && (
          <hstack>
            <fig-menu
              ref={fillTypeMenuRef}
              class="composition-fill-type-menu"
              position="bottom right"
            >
              <fig-tooltip text="Fill type">
                <fig-button
                  fig-menu-trigger=""
                  type="button"
                  variant="ghost"
                  icon="true"
                  aria-label="Fill type"
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
      {normalized.fill.type === "shader" ? (
        <div
          className={
            selectedLayerId === COMPOSITION_FILL_ID
              ? "composition-fill-row is-selected"
              : "composition-fill-row"
          }
        >
          <fig-button
            id={layerPropsAnchorId(COMPOSITION_FILL_ID)}
            class="composition-layer-props-trigger"
            type="button"
            variant="ghost"
            aria-haspopup="dialog"
            aria-expanded={propertiesLayerId === COMPOSITION_FILL_ID ? "true" : "false"}
            onClick={() => openLayerProperties(COMPOSITION_FILL_ID)}
          >
            {layerName(fillResolved, "Choose a shader fill")}
          </fig-button>
          {!readOnly && (
            <div className="composition-layer-actions">
              <fig-button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEffectPickerOpen(false);
                  setFillPickerOpen(true);
                }}
              >
                Choose
              </fig-button>
              {normalized.fill.shaderId && (
                <fig-button
                  type="button"
                  variant="ghost"
                  aria-label="Open shader fill"
                  onClick={() => onOpenShader?.(normalized.fill.shaderId)}
                >
                  Open
                </fig-button>
              )}
            </div>
          )}
        </div>
      ) : (
        <fig-field direction="horizontal">
          <fig-button type="button" variant="secondary">
            {FILL_TYPE_OPTIONS.find((option) => option.value === normalized.fill.type)
              ?.label ?? "Image"}
          </fig-button>
        </fig-field>
      )}

      <fig-separator />

      <fig-header borderless>
        <h3>Effects</h3>
        {!readOnly && (
          <hstack>
            <fig-tooltip text="Add shader effect">
              <fig-button
                id={SHADER_EFFECT_PICKER_ANCHOR_ID}
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
        <div className="composition-effect-list">
          {normalized.effects.map((effect) => {
            const resolved = resolvedByKey?.get(effect.shaderId);
            return (
              <PropertiesEffectRow
                key={effect.id}
                id={layerPropsAnchorId(effect.id)}
                name={layerName(resolved, "Shader effect")}
                selected={selectedLayerId === effect.id}
                expanded={propertiesLayerId === effect.id}
                enabled={effect.enabled}
                readOnly={readOnly}
                onOpen={() => openLayerProperties(effect.id)}
                onToggleVisible={() => toggleEffectVisible(effect.id)}
                onRemove={() => removeEffect(effect.id)}
              />
            );
          })}
        </div>
      )}

      <dialog
        is="fig-dialog"
        ref={fillPickerRef}
        class="composition-picker-dialog"
        title="Shader fills"
        modal=""
        closedby="closerequest"
        position="center center"
        autoresize=""
        onClose={() => setFillPickerOpen(false)}
      >
        <fig-content>
          {fillCards.length ? (
            <ShaderList
              className="composition-picker-list"
              cards={fillCards}
              showPreview
              drag={false}
              onChoice={selectFillShader}
            />
          ) : (
            <p className="composition-empty">No shader fills in the library.</p>
          )}
        </fig-content>
      </dialog>

      <ShaderEffectPicker
        title="Shader effects"
        cards={effectCards}
        open={effectPickerOpen}
        disabled={effectPickerDisabled}
        onOpenChange={onEffectPickerOpenChange}
        onChoice={addEffect}
      />

      {createPortal(
        <dialog
          is="fig-popup"
          ref={propertiesPopupRef}
          class="composition-layer-props"
          position="left"
          closedby="any"
          anchor={
            propertiesLayerId
              ? `#${layerPropsAnchorId(propertiesLayerId)}`
              : undefined
          }
          onClose={() => setPropertiesLayerId(null)}
          onCancel={() => setPropertiesLayerId(null)}
        >
          <fig-header>
            <h3>{propertiesTitle}</h3>
            {!readOnly && (
              <hstack>
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
              </hstack>
            )}
          </fig-header>
          <fig-content class="composition-layer-props-content">
            {layerControls}
          </fig-content>
        </dialog>,
        getFigOverlayRoot()
      )}
    </div>
  );
}
