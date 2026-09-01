/** Marks popups whose closedby was overridden for a canvas-handle drag. */
export const CANVAS_HANDLE_CLOSED_BY_ATTR = "data-closedby-before-handle";

const HANDLE_TAGS = new Set(["FIG-HANDLE", "FIG-CANVAS-CONTROL"]);

/**
 * True when the event originated from a preview canvas handle.
 * fig-popup light-dismiss listens on document capture, so these hits look
 * like outside clicks even though they belong to the open layer.
 */
export function isCanvasHandleEvent(event) {
  const path =
    typeof event?.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) {
    if (!node || typeof node !== "object") continue;
    const tag = typeof node.tagName === "string" ? node.tagName.toUpperCase() : "";
    if (HANDLE_TAGS.has(tag)) return true;
    if (node.classList?.contains?.("canvas-controls-overlay")) return true;
  }
  return false;
}

function openFigPopups() {
  return document.querySelectorAll('dialog[is="fig-popup"]');
}

function popupIsOpen(popup) {
  return Boolean(
    popup.open || popup.matches?.(":open") || popup.matches?.(":popover-open")
  );
}

function protectOpenPopups() {
  for (const popup of openFigPopups()) {
    if (!popupIsOpen(popup)) continue;
    if (popup.hasAttribute(CANVAS_HANDLE_CLOSED_BY_ATTR)) continue;
    popup.setAttribute(
      CANVAS_HANDLE_CLOSED_BY_ATTR,
      popup.getAttribute("closedby") ?? "any"
    );
    popup.setAttribute("closedby", "none");
    if ("closedBy" in popup) popup.closedBy = "none";
  }
}

function restorePopups() {
  for (const popup of document.querySelectorAll(
    `dialog[is="fig-popup"][${CANVAS_HANDLE_CLOSED_BY_ATTR}]`
  )) {
    const previous = popup.getAttribute(CANVAS_HANDLE_CLOSED_BY_ATTR) || "any";
    popup.removeAttribute(CANVAS_HANDLE_CLOSED_BY_ATTR);
    popup.setAttribute("closedby", previous);
    if ("closedBy" in popup) popup.closedBy = previous;
  }
}

export function popupProtectedFromHandleDismiss(popup) {
  return Boolean(popup?.hasAttribute?.(CANVAS_HANDLE_CLOSED_BY_ATTR));
}

/** Install once at app boot so this capture listener runs before fig-popup's. */
export function installCanvasHandlePopupGuard() {
  if (typeof document === "undefined") return;
  if (document.documentElement.dataset.canvasHandlePopupGuard === "true") {
    return;
  }
  document.documentElement.dataset.canvasHandlePopupGuard = "true";

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (isCanvasHandleEvent(event)) protectOpenPopups();
    },
    true
  );
  document.addEventListener("pointerup", restorePopups, true);
  document.addEventListener("pointercancel", restorePopups, true);
}
