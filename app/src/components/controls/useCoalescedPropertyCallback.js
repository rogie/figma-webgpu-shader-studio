import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const PROPERTY_INPUT_INTERVAL_MS = 24;

export function useCoalescedPropertyCallback(callback) {
  const callbackRef = useRef(callback);
  const pendingRef = useRef(new Map());

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(
    () => () => {
      pendingRef.current.forEach(({ timer }) => window.clearTimeout(timer));
      pendingRef.current.clear();
    },
    [],
  );

  return useCallback((name, value) => {
    const pending = pendingRef.current.get(name);
    if (pending) {
      pending.value = value;
      pending.hasTrailingValue = true;
      return;
    }

    callbackRef.current(name, value);
    const timer = window.setTimeout(() => {
      const latest = pendingRef.current.get(name);
      pendingRef.current.delete(name);
      if (latest?.hasTrailingValue) {
        callbackRef.current(name, latest.value);
      }
    }, PROPERTY_INPUT_INTERVAL_MS);
    pendingRef.current.set(name, {
      timer,
      value,
      hasTrailingValue: false,
    });
  }, []);
}
