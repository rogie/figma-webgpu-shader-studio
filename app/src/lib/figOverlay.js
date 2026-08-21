import { createPortal } from "react-dom";

export function getFigOverlayRoot() {
  if (typeof document === "undefined") return null;
  return (
    document.body.querySelector("[data-figui-overlay-root]") ?? document.body
  );
}

export function portalToFigOverlay(node) {
  const root = getFigOverlayRoot();
  return root ? createPortal(node, root) : node;
}
