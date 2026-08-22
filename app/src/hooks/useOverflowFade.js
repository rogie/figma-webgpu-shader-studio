import { useCallback, useEffect, useRef } from "react";
import { attachOverflowFade } from "../lib/overflowFade.js";
import "../overflowFade.css";

/** Callback ref that fades a scroller where content is out of view. */
export function useOverflowFade(ref) {
  const cleanupRef = useRef(null);

  const setRef = useCallback(
    (node) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
      if (!node) return;
      cleanupRef.current = attachOverflowFade(node);
    },
    [ref]
  );

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    []
  );

  return setRef;
}
