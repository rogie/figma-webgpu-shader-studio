import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COMPOSITION_FILL_ID,
  MAX_COMPOSITION_EFFECTS,
  normalizeComposition,
} from "../lib/composition.js";
import ShaderEffectPicker from "./ShaderEffectPicker.jsx";
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

export default function CompositionEditor({
  graph,
  resolvedByKey,
  fillCards = [],
  effectCards = [],
  selectedLayerId,
  readOnly = false,
  onChange,
  onSelectLayer,
  onOpenShader,
}) {
  const fillTypeRef = useRef(null);
  const fillPickerRef = useRef(null);
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  const [effectPickerOpen, setEffectPickerOpen] = useState(false);
  const normalized = useMemo(() => normalizeComposition(graph), [graph]);

  const update = useCallback(
    (next) => {
      if (readOnly) return;
      onChange?.(normalizeComposition(next));
    },
    [onChange, readOnly]
  );

  useEffect(() => {
    const control = fillTypeRef.current;
    if (!control) return;
    const onValue = (event) => {
      const detail = event.detail;
      const raw =
        detail && typeof detail === "object" && "value" in detail
          ? detail.value
          : (detail ?? event.target.value);
      const type = String(raw || "image");
      update({
        ...normalized,
        fill: {
          type,
          shaderId: type === "shader" ? normalized.fill.shaderId : null,
        },
      });
    };
    control.addEventListener("change", onValue);
    return () => control.removeEventListener("change", onValue);
  }, [normalized, update]);

  useEffect(() => {
    const fill = fillPickerRef.current;
    if (!fill) return;
    if (fillPickerOpen) {
      if (!fill.open) fill.showModal();
      return;
    }
    if (fill.open) fill.close();
  }, [fillPickerOpen]);

  const effectPickerDisabled =
    readOnly || normalized.effects.length >= MAX_COMPOSITION_EFFECTS;

  const toggleEffectPicker = useCallback(() => {
    if (effectPickerDisabled) return;
    setFillPickerOpen(false);
    setEffectPickerOpen((open) => !open);
  }, [effectPickerDisabled]);

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

  const moveEffect = useCallback(
    (index, delta) => {
      const next = [...normalized.effects];
      const target = index + delta;
      if (target < 0 || target >= next.length) return;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      update({ ...normalized, effects: next });
    },
    [normalized, update]
  );

  const fillResolved = normalized.fill.shaderId
    ? resolvedByKey?.get(normalized.fill.shaderId)
    : null;

  return (
    <div className="composition-editor">
      <section className="composition-section">
        <div className="composition-section-header">
          <h3>Fill</h3>
        </div>
        <fig-select
          ref={fillTypeRef}
          value={normalized.fill.type}
          options={JSON.stringify(FILL_TYPE_OPTIONS)}
          disabled={readOnly ? "" : undefined}
          aria-label="Fill type"
          dangerouslySetInnerHTML={opaqueContent}
        />
        {normalized.fill.type === "shader" && (
          <button
            type="button"
            className={
              selectedLayerId === COMPOSITION_FILL_ID
                ? "composition-fill-row is-selected"
                : "composition-fill-row"
            }
            onClick={() => onSelectLayer?.(COMPOSITION_FILL_ID)}
          >
            <div className="composition-layer-text">
              <span className="composition-layer-label">
                {layerName(fillResolved, "Choose a shader fill")}
              </span>
              <span className="composition-layer-sublabel">
                {fillResolved?.broken
                  ? "Missing or private"
                  : fillResolved
                    ? "Live shader fill"
                    : "No fill selected"}
              </span>
            </div>
            {!readOnly && (
              <div className="composition-layer-actions">
                <fig-button
                  type="button"
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation();
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
                    icon="true"
                    aria-label="Open shader fill"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenShader?.(normalized.fill.shaderId);
                    }}
                  >
                    Open
                  </fig-button>
                )}
              </div>
            )}
          </button>
        )}
        {normalized.fill.type !== "shader" && (
          <p className="composition-empty">
            {normalized.fill.type === "video"
              ? "Uses the composition video input."
              : normalized.fill.type === "html"
                ? "Uses HTML-in-canvas as a still snapshot."
                : "Uses the composition image input."}
          </p>
        )}
      </section>

      <section className="composition-section">
        <div className="composition-section-header">
          <h3>Effects</h3>
          {!readOnly && (
            <fig-button
              type="button"
              variant="ghost"
              disabled={
                normalized.effects.length >= MAX_COMPOSITION_EFFECTS
                  ? ""
                  : undefined
              }
              onClick={toggleEffectPicker}
            >
              Add
            </fig-button>
          )}
        </div>
        {normalized.effects.length >= MAX_COMPOSITION_EFFECTS && (
          <p className="composition-notice">
            A composition can use up to {MAX_COMPOSITION_EFFECTS} effects.
          </p>
        )}
        {normalized.effects.length === 0 ? (
          <p className="composition-empty">No effects yet.</p>
        ) : (
          <div className="composition-effect-list">
            {normalized.effects.map((effect, index) => {
              const resolved = resolvedByKey?.get(effect.shaderId);
              return (
                <button
                  key={effect.id}
                  type="button"
                  className={
                    selectedLayerId === effect.id
                      ? "composition-effect-row is-selected"
                      : "composition-effect-row"
                  }
                  onClick={() => onSelectLayer?.(effect.id)}
                >
                  <div className="composition-layer-text">
                    <span className="composition-layer-label">
                      {layerName(resolved, "Shader effect")}
                    </span>
                    <span className="composition-layer-sublabel">
                      {resolved?.broken
                        ? "Missing or private"
                        : effect.enabled
                          ? "Enabled"
                          : "Hidden"}
                    </span>
                  </div>
                  {!readOnly && (
                    <div className="composition-layer-actions">
                      <fig-button
                        type="toggle"
                        variant="ghost"
                        icon="true"
                        selected={effect.enabled}
                        aria-label={
                          effect.enabled ? "Disable effect" : "Enable effect"
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          update({
                            ...normalized,
                            effects: normalized.effects.map((item) =>
                              item.id === effect.id
                                ? { ...item, enabled: !item.enabled }
                                : item
                            ),
                          });
                        }}
                      >
                        <fig-icon
                          name={effect.enabled ? "visible" : "hidden"}
                        />
                      </fig-button>
                      <fig-button
                        type="button"
                        variant="ghost"
                        icon="true"
                        disabled={index === 0 ? "" : undefined}
                        aria-label="Move effect up"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveEffect(index, -1);
                        }}
                      >
                        <fig-icon name="chevron" />
                      </fig-button>
                      <fig-button
                        type="button"
                        variant="ghost"
                        icon="true"
                        disabled={
                          index === normalized.effects.length - 1 ? "" : undefined
                        }
                        aria-label="Move effect down"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveEffect(index, 1);
                        }}
                      >
                        <fig-icon
                          class="section-chevron is-collapsed"
                          name="chevron"
                        />
                      </fig-button>
                      <fig-button
                        type="button"
                        variant="ghost"
                        icon="true"
                        aria-label="Open shader effect"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenShader?.(effect.shaderId);
                        }}
                      >
                        Open
                      </fig-button>
                      <fig-button
                        type="button"
                        variant="ghost"
                        icon="true"
                        aria-label="Remove effect"
                        onClick={(event) => {
                          event.stopPropagation();
                          update({
                            ...normalized,
                            effects: normalized.effects.filter(
                              (item) => item.id !== effect.id
                            ),
                          });
                        }}
                      >
                        <fig-icon name="close" />
                      </fig-button>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

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
    </div>
  );
}
