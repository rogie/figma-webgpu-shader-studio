// Seed `frame.params` from a defineProperties schema, cloning object-valued
// defaults so edits don't mutate the schema.
export function buildDefaults(props) {
  const out = {};
  for (const key in props) {
    const def = props[key] ? props[key].defaultValue : undefined;
    out[key] = def && typeof def === "object" ? structuredClone(def) : def;
  }
  return out;
}

export function valuesMatchDefaults(props, values = {}) {
  if (!props) return true;
  const currentValues = values && typeof values === "object" ? values : {};
  for (const key in props) {
    const fallback = props[key] ? props[key].defaultValue : undefined;
    const current = Object.prototype.hasOwnProperty.call(currentValues, key)
      ? currentValues[key]
      : fallback;
    if (JSON.stringify(current) !== JSON.stringify(fallback)) return false;
  }
  return true;
}

// Effects reference frame.input; fills never bind or sample it.
export function detectKind(source) {
  const stripped = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  return /frame\.input/.test(stripped) ? "effect" : "fill";
}

// Mirror the isAnimated/usesMouse rules from skills/v3.md.tmpl.
export function inferFeatures(source) {
  const stripped = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  return {
    isAnimated: /frame\.(time|deltaTime|frame)\b/.test(stripped),
    usesMouse: /frame\.mousePosition\b/.test(stripped),
  };
}

// Adaptive preview supersampling is opt-in because older raw shaders use the
// physical output dimensions as their logical pixel coordinate system.
export function supportsRenderScale(source) {
  return /^\s*\/\/\s*@supports-render-scale\s*$/m.test(source);
}
