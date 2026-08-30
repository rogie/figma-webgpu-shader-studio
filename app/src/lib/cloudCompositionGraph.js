import {
  COMPOSITION_KIND,
  normalizeComposition,
  readEffectFillsFromComposition,
} from "./composition.js";
import { isPaintFillType } from "./paintFill.js";

function legacyInputPaint(row, defaultImageUrl) {
  if (!row.input_path) {
    return { type: "image", image: { url: defaultImageUrl, scaleMode: "fill" } };
  }
  return String(row.input_mime_type || "").startsWith("video/")
    ? {
        type: "video",
        video: { assetPath: row.input_path, scaleMode: "fit" },
      }
    : {
        type: "image",
        image: { assetPath: row.input_path, scaleMode: "fill" },
      };
}

export function cloudCompositionGraph(row, { defaultImageUrl = "" } = {}) {
  if (row.kind !== COMPOSITION_KIND) {
    let fills = readEffectFillsFromComposition(row.composition);
    if (!fills.length) {
      fills = [
        {
          id: "input",
          type: "image",
          enabled: true,
          values: {},
          paint: legacyInputPaint(row, defaultImageUrl),
        },
      ];
    }
    return normalizeComposition({ fills, effects: [] });
  }

  const graph = normalizeComposition(row.composition);
  if (
    !row.input_path ||
    graph.fills.some(
      (fill) => fill.enabled && isPaintFillType(fill.paint?.type),
    )
  ) {
    return graph;
  }
  const fillIndex = graph.fills.findIndex(
    (fill) =>
      fill.enabled && (fill.type === "image" || fill.type === "video"),
  );
  if (fillIndex < 0) return graph;
  const fills = graph.fills.slice();
  const paint = legacyInputPaint(row, defaultImageUrl);
  fills[fillIndex] = {
    ...fills[fillIndex],
    type: paint.type,
    paint,
  };
  return normalizeComposition({ ...graph, fills });
}

export function cloudSessionComposition(row, options) {
  const graph = cloudCompositionGraph(row, options);
  if (row.kind === COMPOSITION_KIND) return graph;
  return {
    ...(row.composition || {}),
    effectFills: graph.fills,
    effectFill: graph.fills[0] || null,
  };
}
