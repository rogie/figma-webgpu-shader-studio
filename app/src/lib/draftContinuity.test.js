import assert from "node:assert/strict";
import test from "node:test";
import { orderDraftsForMigration } from "./draftContinuity.js";

test("orders draft dependencies before the documents that reference them", () => {
  const fill = {
    id: "draft:00000000-0000-0000-0000-000000000001",
    kind: "fill",
    source: "fill source",
  };
  const effect = {
    id: "draft:00000000-0000-0000-0000-000000000002",
    kind: "effect",
    source: "effect source",
    effectFills: [
      {
        id: "fill",
        type: "shader",
        shaderId: fill.id,
      },
    ],
  };
  const composition = {
    id: "draft:00000000-0000-0000-0000-000000000003",
    kind: "composition",
    source: "",
    composition: {
      fills: [
        {
          id: "base",
          type: "shader",
          shaderId: `cloud:${fill.id.slice("draft:".length)}`,
        },
      ],
      effects: [
        {
          id: "effect",
          shaderId: effect.id,
        },
      ],
    },
  };

  assert.deepEqual(
    orderDraftsForMigration([composition, effect, fill]).map(
      (draft) => draft.id,
    ),
    [fill.id, effect.id, composition.id],
  );
});

test("cyclic and unrelated drafts are returned exactly once", () => {
  const first = {
    id: "draft:00000000-0000-0000-0000-000000000011",
    kind: "composition",
    composition: {
      fills: [
        {
          id: "one",
          type: "shader",
          shaderId: "draft:00000000-0000-0000-0000-000000000012",
        },
      ],
      effects: [],
    },
  };
  const second = {
    id: "draft:00000000-0000-0000-0000-000000000012",
    kind: "composition",
    composition: {
      fills: [
        {
          id: "two",
          type: "shader",
          shaderId: first.id,
        },
      ],
      effects: [],
    },
  };
  const unrelated = {
    id: "draft:00000000-0000-0000-0000-000000000013",
    kind: "fill",
  };

  const ordered = orderDraftsForMigration([first, second, unrelated]);
  assert.equal(ordered.length, 3);
  assert.deepEqual(
    new Set(ordered.map((draft) => draft.id)),
    new Set([first.id, second.id, unrelated.id]),
  );
});
