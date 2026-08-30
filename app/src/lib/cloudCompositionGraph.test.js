import assert from "node:assert/strict";
import test from "node:test";
import {
  cloudCompositionGraph,
  cloudSessionComposition,
} from "./cloudCompositionGraph.js";
import { COMPOSITION_KIND } from "./composition.js";

test("restores a legacy effect input as an asset-backed fill", () => {
  const row = {
    kind: "effect",
    composition: {},
    input_path: "owner/shader/input.png",
    input_mime_type: "image/png",
  };

  const graph = cloudCompositionGraph(row);
  const session = cloudSessionComposition(row);

  assert.equal(
    graph.fills[0].paint.image.assetPath,
    "owner/shader/input.png",
  );
  assert.equal(
    session.effectFills[0].paint.image.assetPath,
    "owner/shader/input.png",
  );
});

test("restores a legacy composition video input into its media slot", () => {
  const graph = cloudCompositionGraph({
    kind: COMPOSITION_KIND,
    composition: {
      fills: [{ id: "video", type: "video", enabled: true }],
      effects: [],
    },
    input_path: "owner/shader/input.mp4",
    input_mime_type: "video/mp4",
  });

  assert.equal(graph.fills[0].paint.type, "video");
  assert.equal(
    graph.fills[0].paint.video.assetPath,
    "owner/shader/input.mp4",
  );
});

test("preserves explicit composition paint instead of applying legacy input", () => {
  const graph = cloudCompositionGraph({
    kind: COMPOSITION_KIND,
    composition: {
      fills: [
        {
          id: "image",
          type: "image",
          enabled: true,
          paint: {
            type: "image",
            image: { assetPath: "owner/shader/current.png" },
          },
        },
      ],
      effects: [],
    },
    input_path: "owner/shader/legacy.png",
    input_mime_type: "image/png",
  });

  assert.equal(
    graph.fills[0].paint.image.assetPath,
    "owner/shader/current.png",
  );
});
