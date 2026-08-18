export function readNumber(event) {
  const value = event.target.value ?? event.detail;
  return Number(value);
}

export function readPropskitSliderNumber(event) {
  const detail = event.nativeEvent?.detail ?? event.detail;
  const value =
    detail && typeof detail === "object" && "value" in detail
      ? detail.value
      : detail;
  return Number(value);
}

export function isSymmetricDeltaRange(min, max) {
  return (
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min < 0 &&
    max > 0 &&
    min === -max
  );
}

export function isOpacityPercentRange(name, min, max) {
  const key = String(name || "").toLowerCase();
  return (
    (key === "opacity" || key === "alpha") &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min === 0 &&
    max === 100
  );
}

export function stepCountBetween(min, max, step) {
  if (!(Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(step))) {
    return Infinity;
  }
  if (!(step > 0) || !(max > min)) return Infinity;
  return (max - min) / step;
}

export function sliderTypeForProperty(name, min, max, step) {
  if (isOpacityPercentRange(name, min, max)) return "opacity";
  if (stepCountBetween(min, max, step) < 16) return "stepper";
  if (isSymmetricDeltaRange(min, max)) return "delta";
  return null;
}

// Match figui3 /propskit/lab: options attr is comma-separated, newline, or JSON
// array of strings / { value, label } objects (same as fig-options / fig-select).
export function formatSelectOptions(options) {
  return JSON.stringify(
    options.map((option) => ({
      value: String(option.value),
      label: String(option.label ?? option.value),
    })),
  );
}
