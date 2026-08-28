import { COMPOSITION_KIND } from "./composition.js";

export async function refreshRestoredRuntime({
  restored,
  composition,
  effectFills = [],
  layerSourceOverrides = null,
  compile,
  compileComposition,
  loadMedia,
  restoreDefaultInput,
}) {
  if (restored?.kind === COMPOSITION_KIND) {
    return compileComposition(composition, { layerSourceOverrides });
  }

  await compile(restored?.source || "", { force: true });
  if (restored?.kind !== "effect" || effectFills.length > 0) return true;
  if (restored.input_path) {
    await loadMedia(restored);
  } else {
    await restoreDefaultInput();
  }
  return true;
}
