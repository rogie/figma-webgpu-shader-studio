import { useCallback, useEffect, useRef } from "react";
import { attachOverflowFade } from "../lib/overflowFade.js";
import "../overflowFade.css";

/** Callback ref that fades a scroller where content is out of view. */
export function useOverflowFade(ref) {
  const nodeRef = useRef(null);
  const cleanupRef = useRef(null);

  const setRef = useCallback(
    (node) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      nodeRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
      if (!node) return;
      cleanupRef.current = attachOverflowFade(node);
    },
    [ref]
  );

  useEffect(() => {
    // Strict Mode replays effects without replaying callback refs. Reattach
    // after its simulated cleanup so the overflow state keeps syncing.
    if (nodeRef.current && !cleanupRef.current) {
      cleanupRef.current = attachOverflowFade(nodeRef.current);
    }

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  return setRef;
}
