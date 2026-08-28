import { loadModule as runtimeLoadModule } from "../runtime/loader.js";
import {
  buildDefaults,
  valuesMatchDefaults,
} from "../runtime/params.js";

function copyTarget(target) {
  if (!target || typeof target !== "object") return target ?? null;
  return Array.isArray(target) ? target.slice() : { ...target };
}

/**
 * Derive a reset from the module currently in the editor.
 *
 * The caller owns applying the returned values to `target`; this helper never
 * rewrites source or any editor/composition object.
 */
export function resetPropertiesForTarget({
  source,
  values = {},
  target = null,
  readOnly = false,
  loadModule = runtimeLoadModule,
} = {}) {
  if (readOnly) {
    return {
      status: "read-only",
      changed: false,
      target: copyTarget(target),
      props: {},
      values,
    };
  }
  if (typeof loadModule !== "function") {
    throw new TypeError("resetPropertiesForTarget requires a loadModule function.");
  }

  const loaded = loadModule(source);
  const props =
    loaded?.props &&
    typeof loaded.props === "object" &&
    !Array.isArray(loaded.props)
      ? loaded.props
      : {};
  const nextValues = buildDefaults(props);
  const changed = !valuesMatchDefaults(props, values);

  return {
    status: changed ? "changed" : "no-op",
    changed,
    target: copyTarget(target),
    props,
    values: nextValues,
  };
}
