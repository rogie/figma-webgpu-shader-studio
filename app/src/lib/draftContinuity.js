import {
  COMPOSITION_KIND,
  emptyComposition,
  normalizeComposition,
  parseCompositionShaderId,
  readEffectFillsFromComposition,
  referencedShaderKeys,
} from "./composition.js";
import { cloudIdForDraft } from "./shaderIdentity.js";

export function orderDraftsForMigration(drafts = []) {
  const byCloudId = new Map(
    drafts.map((draft) => [cloudIdForDraft(draft.id), draft]),
  );
  const visiting = new Set();
  const visited = new Set();
  const ordered = [];

  const visit = (draft) => {
    if (!draft || visited.has(draft.id) || visiting.has(draft.id)) return;
    visiting.add(draft.id);
    const graph =
      draft.kind === COMPOSITION_KIND
        ? normalizeComposition(draft.composition)
        : draft.kind === "effect"
          ? normalizeComposition({
              fills: readEffectFillsFromComposition(
                draft.composition || draft,
              ),
              effects: [],
            })
          : emptyComposition();
    for (const key of referencedShaderKeys(graph)) {
      const parsed = parseCompositionShaderId(key);
      const cloudId = String(parsed?.id || "").replace(/^draft:/, "");
      visit(byCloudId.get(cloudId));
    }
    visiting.delete(draft.id);
    visited.add(draft.id);
    ordered.push(draft);
  };

  for (const draft of drafts) visit(draft);
  return ordered;
}
