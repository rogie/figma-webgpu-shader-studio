export function readNumber(event) {
  const value = event.target.value ?? event.detail;
  return Number(value);
}

export function readToolkitEventValue(event) {
  const detail = event.nativeEvent?.detail ?? event.detail;
  return detail && typeof detail === "object" && "value" in detail
    ? detail.value
    : (detail ?? event.target?.value);
}

export function readToolkitSliderNumber(event) {
  return Number(readToolkitEventValue(event));
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

// Match ToolKit / fig-select: options attr is comma-separated, newline, or
// JSON array of strings / { value, label } objects.
export function formatSelectOptions(options) {
  return JSON.stringify(
    options.map((option) => ({
      value: String(option.value),
      label: String(option.label ?? option.value),
    })),
  );
}
