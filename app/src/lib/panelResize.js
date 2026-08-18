export function createRafCssWriter(element, property) {
  let rafId = 0;
  let latest = null;
  const apply = () => {
    rafId = 0;
    if (latest != null) {
      element.style.setProperty(property, `${Math.round(latest)}px`);
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
  };
}
