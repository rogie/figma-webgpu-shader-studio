/** defineProperties spatial types that can render on-canvas handles. */
export const CANVAS_PROP_TYPES = new Set([
  "point",
  "point-radius",
  "point-angle-radius",
  "point-point-line",
  "color-point",
]);

/** @param {{ type?: string, mode?: string }} def */
export function isCanvasModeProp(def) {
  if (!def || !CANVAS_PROP_TYPES.has(def.type)) return false;
  return def.mode === "canvas" || def.mode === "canvas_and_ui";
}

/** Canvas-only props stay off the property panel; canvas_and_ui keeps both. */
export function showsInPropertyPanel(def) {
  if (!def || !CANVAS_PROP_TYPES.has(def.type)) return true;
  return def.mode !== "canvas";
}

/**
 * Map defineProperties type → fig-canvas-control `type` attribute.
 * @returns {string | null}
 */
export function figCanvasControlType(def) {
  switch (def?.type) {
    case "point":
      return "point";
    case "point-radius":
      return "point-radius";
    case "point-angle-radius":
      return "point-radius-angle";
    case "point-point-line":
      return "point-point";
    case "color-point":
      return "color";
    default:
      return null;
  }
}

export function listCanvasControls(props) {
  return Object.entries(props || {})
    .filter(([, def]) => isCanvasModeProp(def) && figCanvasControlType(def))
    .map(([name, def]) => ({ name, def, type: figCanvasControlType(def) }));
}

function positionUnit(def) {
  return def.positionUnit || def.unit || "%";
}

function radiusUnit(def) {
  return def.radiusUnit || "%";
}

function toPercentX(x, width, unit) {
  if (unit === "px" && width > 0) return (Number(x) / width) * 100;
  return Number(x);
}

function toPercentY(y, height, unit) {
  if (unit === "px" && height > 0) return (Number(y) / height) * 100;
  return Number(y);
}

function fromPercentX(x, width, unit) {
  if (unit === "px" && width > 0) return (Number(x) / 100) * width;
  return Number(x);
}

function fromPercentY(y, height, unit) {
  if (unit === "px" && height > 0) return (Number(y) / 100) * height;
  return Number(y);
}

function toHexByte(value) {
  return Math.max(0, Math.min(255, Math.round((value ?? 0) * 255)))
    .toString(16)
    .padStart(2, "0");
}

export function colorToHex(color) {
  if (!color || typeof color !== "object") return "#ffffffff";
  return `#${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(
    color.b
  )}${toHexByte(color.a ?? 1)}`;
}

export function hexToColor(hex) {
  const value = String(hex || "").trim();
  const rgba = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (rgba) {
    return {
      r: Math.max(0, Math.min(255, Number(rgba[1]))) / 255,
      g: Math.max(0, Math.min(255, Number(rgba[2]))) / 255,
      b: Math.max(0, Math.min(255, Number(rgba[3]))) / 255,
      a:
        rgba[4] == null
          ? 1
          : Math.max(0, Math.min(1, Number(rgba[4]))),
    };
  }

  const raw = value.replace("#", "");
  if (raw.length < 6) return { r: 1, g: 1, b: 1, a: 1 };
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const a = raw.length >= 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

/**
 * Serialize a defineProperties value into fig-canvas-control's JSON value.
 * @param {{ width: number, height: number }} size canvas pixel size
 */
export function toFigCanvasValue(def, value, size = { width: 0, height: 0 }) {
  const current = value || def.defaultValue || {};
  const unit = positionUnit(def);
  const out = {
    x: toPercentX(current.x ?? 50, size.width, unit),
    y: toPercentY(current.y ?? 50, size.height, unit),
  };

  if (def.type === "point-radius" || def.type === "point-angle-radius") {
    const radius = current.radius ?? def.defaultValue?.radius ?? 0;
    out.radius =
      radiusUnit(def) === "%" ? `${Number(radius)}%` : Number(radius);
  }

  if (def.type === "point-angle-radius") {
    out.angle = Number(current.angle ?? def.defaultValue?.angle ?? 0);
  }

  if (def.type === "point-point-line") {
    out.x2 = toPercentX(current.x2 ?? 75, size.width, unit);
    out.y2 = toPercentY(current.y2 ?? 50, size.height, unit);
  }

  if (def.type === "color-point" && current.color) {
    out.color = colorToHex(current.color);
  }

  return out;
}

/** Parse fig-canvas-control event detail back into defineProperties shape. */
export function fromFigCanvasValue(def, detail, size = { width: 0, height: 0 }) {
  const unit = positionUnit(def);
  const src = detail && typeof detail === "object" ? detail : {};
  const out = {
    x: fromPercentX(src.x ?? 50, size.width, unit),
    y: fromPercentY(src.y ?? 50, size.height, unit),
  };

  if (def.type === "point-radius" || def.type === "point-angle-radius") {
    const raw = src.radius;
    if (typeof raw === "string" && raw.endsWith("%")) {
      out.radius = parseFloat(raw);
    } else {
      out.radius = Number(raw ?? 0);
    }
  }

  if (def.type === "point-angle-radius") {
    out.angle = Number(src.angle ?? 0);
  }

  if (def.type === "point-point-line") {
    out.x2 = fromPercentX(src.x2 ?? 75, size.width, unit);
    out.y2 = fromPercentY(src.y2 ?? 50, size.height, unit);
  }

  if (def.type === "color-point") {
    const hex = src.color;
    const color = hex ? hexToColor(hex) : { r: 1, g: 1, b: 1, a: 1 };
    if (src.alpha != null && Number.isFinite(Number(src.alpha))) {
      color.a = Math.max(0, Math.min(1, Number(src.alpha)));
    } else if (src.opacity != null && Number.isFinite(Number(src.opacity))) {
      color.a = Math.max(0, Math.min(100, Number(src.opacity))) / 100;
    }
    out.color = color;
  }

  return out;
}

export function canvasControlName(name, def) {
  const label = def.label || name;
  if (def.type === "point-point-line") {
    return `${label} start, ${label} end`;
  }
  return label;
}
