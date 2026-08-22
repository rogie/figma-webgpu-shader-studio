import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { portalToFigOverlay } from "../lib/figOverlay.js";
import { filterShaderLibraryCards } from "../lib/shaderLibrary.js";
import "./ShaderPicker.css";

const opaqueContent = { __html: "" };

export const SHADER_PICKER_ANCHOR_IDS = {
  fill: "composition-fill-header",
  effect: "composition-effects-header",
};

export const SHADER_PICKER_TRIGGER_IDS = {
  effect: "composition-add-effect",
};

const KIND_COPY = {
  fill: {
    title: "Shader fills",
    searchLabel: "Search shader fills",
    empty: "No shader fills in the library.",
    emptyMatch: "No matching shader fills.",
  },
  effect: {
    title: "Shader effects",
    searchLabel: "Search shader effects",
    empty: "No shader effects in the library.",
    emptyMatch: "No matching shader effects.",
  },
};

function pickerKind(kind) {
  return kind === "fill" ? "fill" : "effect";
}

export default function ShaderPicker({
  kind = "effect",
  cards = [],
  open = false,
  disabled = false,
  captureTrigger,
  position,
  title,
  onOpenChange,
  onChoice,
}) {
  const type = pickerKind(kind);
  const copy = KIND_COPY[type];
  const anchorId = SHADER_PICKER_ANCHOR_IDS[type];
  const triggerId = SHADER_PICKER_TRIGGER_IDS[type];
  const interceptTrigger = captureTrigger ?? Boolean(triggerId);
  const popupPosition = position ?? "left";
  const popupRef = useRef(null);
  const chooserRef = useRef(null);
  const searchRef = useRef(null);
  const allowDismissRef = useRef(false);
  const [query, setQuery] = useState("");
  const filteredCards = useMemo(
    () => filterShaderLibraryCards(cards, { query, kind: type }),
    [cards, query, type]
  );

  const close = useCallback(() => {
    allowDismissRef.current = true;
    onOpenChange?.(false);
  }, [onOpenChange]);

  const toggle = useCallback(() => {
    if (disabled) return;
    onOpenChange?.(!open);
  }, [disabled, onOpenChange, open]);

  useEffect(() => {
    const popup = popupRef.current;
    const trigger = triggerId ? document.getElementById(triggerId) : null;
    if (!popup) return undefined;

    popup.setAttribute("closedby", "none");
    if ("closedBy" in popup) popup.closedBy = "none";

    const onCancel = (event) => {
      event.preventDefault();
    };
    const onClose = () => {
      if (allowDismissRef.current) {
        allowDismissRef.current = false;
        return;
      }
      if (!open || disabled) return;
      popup.setAttribute("closedby", "none");
      if ("closedBy" in popup) popup.closedBy = "none";
      popup.open = true;
    };
    const onCloseButton = (event) => {
      if (event.target.closest?.("[close-dialog]")) close();
    };
    popup.addEventListener("cancel", onCancel);
    popup.addEventListener("close", onClose);
    popup.addEventListener("click", onCloseButton);

    if (open && !disabled) {
      popup.open = true;
      trigger?.setAttribute("aria-expanded", "true");
      trigger?.setAttribute("aria-haspopup", "dialog");
    } else {
      popup.open = false;
      trigger?.setAttribute("aria-expanded", "false");
    }

    return () => {
      popup.removeEventListener("cancel", onCancel);
      popup.removeEventListener("close", onClose);
      popup.removeEventListener("click", onCloseButton);
    };
  }, [close, disabled, open, triggerId]);

  useEffect(() => {
    if (!interceptTrigger || !triggerId) return undefined;
    const trigger = document.getElementById(triggerId);
    if (!trigger) return undefined;
    const onTriggerClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      toggle();
    };
    trigger.addEventListener("click", onTriggerClick, true);
    return () => trigger.removeEventListener("click", onTriggerClick, true);
  }, [interceptTrigger, toggle, triggerId]);

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

  return portalToFigOverlay(
    <dialog
      is="fig-popup"
      ref={popupRef}
      class="shader-picker"
      title={title || copy.title}
      drag=""
      handle="fig-header"
      position={popupPosition}
      popover="manual"
      closedby="none"
      anchor={`#${anchorId}`}
      onCancel={(event) => event.preventDefault()}
    >
      <fig-header class="shader-picker-search">
        <fig-input-text
          ref={searchRef}
          type="search"
          placeholder="Search"
          value={query}
          full=""
          aria-label={copy.searchLabel}
          dangerouslySetInnerHTML={opaqueContent}
        />
      </fig-header>
      <fig-content>
        {filteredCards.length ? (
          <fig-chooser
            ref={chooserRef}
            class="shader-picker-list"
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
                  src={card.thumbnailUrl || undefined}
                  label={card.name}
                  dangerouslySetInnerHTML={opaqueContent}
                />
              </fig-choice>
            ))}
          </fig-chooser>
        ) : (
          <p className="shader-picker-empty">
            {cards.length ? copy.emptyMatch : copy.empty}
          </p>
        )}
      </fig-content>
    </dialog>
  );
}
