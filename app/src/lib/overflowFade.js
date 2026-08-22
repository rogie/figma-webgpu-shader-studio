export const OVERFLOW_FADE_CLASS = "overflow-fade";

export function syncOverflowFade(node) {
  if (!node) return;
  const { scrollTop, clientHeight, scrollHeight } = node;
  node.toggleAttribute("data-overflow-top", scrollTop > 1);
  node.toggleAttribute(
    "data-overflow-bottom",
    scrollTop + clientHeight < scrollHeight - 1
  );
}

export function attachOverflowFade(node) {
  if (!node) return () => {};
  node.classList.add(OVERFLOW_FADE_CLASS);
  const update = () => syncOverflowFade(node);
  update();
  node.addEventListener("scroll", update, { passive: true });
  const resizeObserver = new ResizeObserver(update);
  resizeObserver.observe(node);
  const mutationObserver = new MutationObserver(update);
  mutationObserver.observe(node, { childList: true, subtree: true });
  return () => {
    node.removeEventListener("scroll", update);
    resizeObserver.disconnect();
    mutationObserver.disconnect();
  };
}
