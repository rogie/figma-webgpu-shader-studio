import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFigOverlayRoot } from "../lib/figOverlay.js";
import { filterShaderLibraryCards } from "../lib/shaderLibrary.js";
import "./ShaderEffectPicker.css";

const opaqueContent = { __html: "" };
export const SHADER_EFFECT_PICKER_ANCHOR_ID = "composition-add-effect";

function getAnchor() {
  return document.getElementById(SHADER_EFFECT_PICKER_ANCHOR_ID);
}

export default function ShaderEffectPicker({
  title = "Shader effects",
  cards = [],
  open = false,
  disabled = false,
  onOpenChange,
  onChoice,
}) {
  const popupRef = useRef(null);
  const chooserRef = useRef(null);
  const searchRef = useRef(null);
  const [query, setQuery] = useState("");
  const filteredCards = useMemo(
    () => filterShaderLibraryCards(cards, { query }),
    [cards, query]
  );

  const close = useCallback(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  const toggle = useCallback(() => {
    if (disabled) return;
    onOpenChange?.(!open);
  }, [disabled, onOpenChange, open]);

  useEffect(() => {
    const popup = popupRef.current;
    const trigger = getAnchor();
    if (!popup) return;
    if (open && !disabled) {
      popup.open = true;
      trigger?.setAttribute("aria-expanded", "true");
      trigger?.setAttribute("aria-haspopup", "dialog");
      return;
    }
    popup.open = false;
    trigger?.setAttribute("aria-expanded", "false");
  }, [disabled, open]);

  useEffect(() => {
    const trigger = getAnchor();
    if (!trigger) return;
    const onTriggerClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      toggle();
    };
    trigger.addEventListener("click", onTriggerClick, true);
    return () => trigger.removeEventListener("click", onTriggerClick, true);
  }, [toggle]);

  useEffect(() => {
    if (disabled) close();
  }, [close, disabled]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    const search = searchRef.current;
    if (!search) return;
    const onInput = (event) => {
      const next =
        typeof event.detail === "string"
          ? event.detail
          : (event.target?.value ?? "");
      setQuery(next);
    };
    search.addEventListener("input", onInput);
    return () => search.removeEventListener("input", onInput);
  }, []);

  useEffect(() => {
    const chooser = chooserRef.current;
    if (!chooser || !onChoice) return;
    const handleChange = (event) => {
      if (typeof event.detail !== "string") return;
      close();
      onChoice(event.detail);
    };
    chooser.addEventListener("change", handleChange);
    return () => chooser.removeEventListener("change", handleChange);
  }, [close, filteredCards.length, onChoice]);

  return createPortal(
    <dialog
      is="fig-popup"
      ref={popupRef}
      class="shader-effect-picker"
      title={title}
      drag=""
      handle="fig-header"
      position="bottom right"
      closedby="any"
      anchor={`#${SHADER_EFFECT_PICKER_ANCHOR_ID}`}
      onClose={close}
      onCancel={close}
    >
      <fig-header class="shader-effect-picker-search">
        <fig-input-text
          ref={searchRef}
          type="search"
          placeholder="Search"
          value={query}
          full=""
          aria-label="Search shader effects"
          dangerouslySetInnerHTML={opaqueContent}
        />
      </fig-header>
      <fig-content>
        {filteredCards.length ? (
          <fig-chooser
            ref={chooserRef}
            class="shader-effect-picker-list"
            value=""
            layout="grid"
            overflow="scrollbar"
            loop=""
          >
            {filteredCards.map((card) => (
              <fig-choice
                key={card.key}
                value={card.key}
                aria-label={card.name}
              >
                <fig-card
                  class="shader-effect-picker-card"
                  src={card.thumbnailUrl || undefined}
                  label={card.name}
                  dangerouslySetInnerHTML={opaqueContent}
                />
              </fig-choice>
            ))}
          </fig-chooser>
        ) : (
          <p className="shader-effect-picker-empty">
            {cards.length
              ? "No matching shader effects."
              : "No shader effects in the library."}
          </p>
        )}
      </fig-content>
    </dialog>,
    getFigOverlayRoot()
  );
}
