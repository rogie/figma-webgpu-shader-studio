function createRafCssWriter(element, property, format) {
  let rafId = 0;
  let latest = null;
  const apply = () => {
    rafId = 0;
    if (latest != null) {
      element.style.setProperty(property, format(latest));
    }
  };
  return {
    write(value) {
      latest = value;
      if (!rafId) rafId = requestAnimationFrame(apply);
    },
    flush() {
      if (rafId) cancelAnimationFrame(rafId);
      apply();
    },
    cancel() {
      if (rafId) cancelAnimationFrame(rafId);
    },
  };
}

export function startPanelResize(event, {
  element, property, size, min, max, axis, direction = 1,
  format = (value) => `${Math.round(value)}px`, onMove, onCommit, onFinish,
}) {
  if (event.button !== 0 || !event.isPrimary) return;
  event.preventDefault();

  const handle = event.currentTarget;
  const { pointerId } = event;
  const coordinate = axis === "x" ? "clientX" : "clientY";
  const start = event[coordinate];
  const original = element.style.getPropertyValue(property);
  const writer = createRafCssWriter(element, property, format);
  const listeners = new AbortController();
  const options = { capture: true, signal: listeners.signal };
  const sizeAt = (pointer) => Math.min(max, Math.max(min, size + direction * (pointer[coordinate] - start)));

  const finish = (pointer) => {
    listeners.abort();
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    if (pointer?.type === "pointerup" && handle.isConnected && pointer[coordinate] !== start) {
      const next = sizeAt(pointer);
      writer.write(onCommit(next) ?? next);
      writer.flush();
    } else {
      writer.cancel();
      element.style.setProperty(property, original);
    }
    onFinish?.();
  };

  handle.setPointerCapture(pointerId);
  // Window listeners keep the drag alive if layout changes release pointer capture.
  window.addEventListener("pointermove", (pointer) => {
    if (pointer.pointerId !== pointerId) return;
    const next = sizeAt(pointer);
    writer.write(next);
    onMove?.(next);
  }, options);
  window.addEventListener("pointerup", (pointer) => {
    if (pointer.pointerId === pointerId) finish(pointer);
  }, options);
  window.addEventListener("pointercancel", (pointer) => {
    if (pointer.pointerId === pointerId) finish();
  }, options);
  window.addEventListener("blur", () => finish(), options);
  window.addEventListener("resize", () => finish(), options);
}

export function resizePanelWithKey(event, { size, min, max, axis, direction = 1, onCommit }) {
  const [back, forward] = axis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  let next;
  switch (event.key) {
    case "Home": next = min; break;
    case "End": next = max; break;
    case back: next = size - 16 * direction; break;
    case forward: next = size + 16 * direction; break;
    default: return;
  }
  event.preventDefault();
  onCommit(Math.min(max, Math.max(min, next)));
}
