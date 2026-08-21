import { useCallback, useRef } from "react";

export function figMenuChangeValue(event, menu) {
  const detail = event?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (detail && typeof detail === "object" && typeof detail.value === "string") {
    return detail.value;
  }
  return typeof menu?.value === "string" ? menu.value : "";
}

/** Attach a fig-menu `change` listener via callback ref. */
export function useFigMenuChange(onChange) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const cleanupRef = useRef(null);

  return useCallback((node) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) return;
    const handleChange = (event) => {
      const value = figMenuChangeValue(event, node);
      if (value) onChangeRef.current?.(value, node, event);
    };
    node.addEventListener("change", handleChange);
    cleanupRef.current = () => node.removeEventListener("change", handleChange);
  }, []);
}
