export function readNumber(event) {
  return Number(event.target?.value ?? readControlEventValue(event));
}

export function readControlEventValue(event) {
  const detail = event.nativeEvent?.detail ?? event.detail;
  return detail && typeof detail === "object" && "value" in detail
    ? detail.value
    : (detail ?? event.target?.value);
}

export function readToolkitEventValue(event) {
  return readControlEventValue(event);
}

export function readToolkitSliderNumber(event) {
  return Number(readControlEventValue(event));
}

export function readColorControlValue(event, fallback = "") {
  const detail = event.nativeEvent?.detail ?? event.detail;
  if (typeof detail === "string" && detail.trim()) {
    return { color: detail, alpha: null };
  }
  if (detail && typeof detail === "object") {
    const value =
      typeof detail.color === "string"
        ? detail.color
        : typeof detail.value === "string"
          ? detail.value
          : typeof detail.hex === "string"
            ? detail.hex
            : "";
    if (value) {
      const alpha = Number(detail.alpha);
      const opacity = Number(detail.opacity);
      return {
        color: value,
        alpha: Number.isFinite(alpha)
          ? Math.max(0, Math.min(1, alpha))
          : Number.isFinite(opacity)
            ? Math.max(0, Math.min(100, opacity)) / 100
            : null,
      };
    }
  }
  return fallback ? { color: fallback, alpha: null } : null;
}

export function readPointControlValue(event, fallback = { x: 0, y: 0 }) {
  const detail = readControlEventValue(event);
  const source = detail && typeof detail === "object" ? detail : {};
  return {
    x: Number(source.x ?? fallback.x ?? 0),
    y: Number(source.y ?? fallback.y ?? 0),
  };
}

export function serializeGradientValue(stops = []) {
  return JSON.stringify({
    type: "gradient",
    gradient: {
      type: "linear",
      angle: 90,
      interpolationSpace: "srgb",
      hueInterpolation: "shorter",
      stops: stops.map((stop) => ({
        position: Math.max(0, Math.min(100, Number(stop.position) * 100)),
        color: colorToHex(stop.color).slice(0, 7),
        opacity: Math.round(
          Math.max(0, Math.min(1, Number(stop.color?.a ?? 1))) * 100,
        ),
      })),
    },
  });
}

export function readGradientControlValue(event) {
  let detail = readControlEventValue(event);
  if (typeof detail === "string") {
    try {
      detail = JSON.parse(detail);
    } catch {
      return null;
    }
  }
  const stops = detail?.gradient?.stops;
  if (!Array.isArray(stops)) return null;
  return {
    stops: stops.map((stop) => {
      const color = hexToColor(stop.color);
      color.a =
        stop.opacity == null
          ? color.a
          : Math.max(0, Math.min(100, Number(stop.opacity))) / 100;
      return {
        position: Math.max(0, Math.min(100, Number(stop.position))) / 100,
        color,
      };
    }),
  };
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

// Match fig-select: options is a JSON array of { value, label } objects.
export function formatSelectOptions(options) {
  return JSON.stringify(
    options.map((option) => ({
      value: String(option.value),
      label: String(option.label ?? option.value),
    })),
  );
}

function toHexByte(value) {
  return Math.max(0, Math.min(255, Math.round((value ?? 0) * 255)))
    .toString(16)
    .padStart(2, "0");
}

function colorToHex(color) {
  if (!color || typeof color !== "object") return "#ffffffff";
  return `#${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(
    color.b,
  )}${toHexByte(color.a ?? 1)}`;
}

function hexToColor(hex) {
  const raw = String(hex || "").trim().replace("#", "");
  if (raw.length < 6) return { r: 1, g: 1, b: 1, a: 1 };
  return {
    r: Number.parseInt(raw.slice(0, 2), 16) / 255,
    g: Number.parseInt(raw.slice(2, 4), 16) / 255,
    b: Number.parseInt(raw.slice(4, 6), 16) / 255,
    a: raw.length >= 8 ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1,
  };
}
