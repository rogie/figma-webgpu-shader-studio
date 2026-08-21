export function getFigOverlayRoot() {
  return (
    document.body.querySelector("[data-figui-overlay-root]") ?? document.body
  );
}
