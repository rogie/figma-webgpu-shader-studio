import assert from "node:assert/strict";
import test from "node:test";
import { buildShaderLibraryCards, filterShaderLibraryCards } from "./shaderLibrary.js";

const placeholderThumbnailUrl = (index, name) => `placeholder:${index}:${name}`;

test("shows local drafts, owned cloud drafts, and public shaders without presets", () => {
  const cards = buildShaderLibraryCards({
    drafts: [
      {
        id: "draft:local",
        name: "Local",
        kind: "effect",
      },
    ],
    cloudShaders: [
      {
        id: "private",
        owner_id: "user-1",
        name: "Cloud draft",
        kind: "fill",
        is_public: false,
      },
      {
        id: "public",
        owner_id: "user-2",
        name: "Published",
        kind: "effect",
        is_public: true,
      },
    ],
    placeholderThumbnailUrl,
    user: { id: "user-1", email: "owner@example.com" },
  });

  assert.deepEqual(
    cards.map(({ key, origin, authorLabel, canDelete }) => ({
      key,
      origin,
      authorLabel,
      canDelete,
    })),
    [
      {
        key: "draft:local",
        origin: "draft",
        authorLabel: "Local draft",
        canDelete: true,
      },
      {
        key: "cloud:private",
        origin: "draft",
        authorLabel: "Draft",
        canDelete: true,
      },
      {
        key: "cloud:public",
        origin: "public",
        authorLabel: "Community",
        canDelete: false,
      },
    ]
  );
});

test("filters draft and public cards independently", () => {
  const cards = [
    { name: "Private", authorLabel: "Draft", kind: "fill", origin: "draft" },
    {
      name: "Published",
      authorLabel: "Community",
      kind: "effect",
      origin: "public",
    },
  ];

  assert.deepEqual(filterShaderLibraryCards(cards, { origin: "draft" }), [
    cards[0],
  ]);
  assert.deepEqual(filterShaderLibraryCards(cards, { origin: "public" }), [
    cards[1],
  ]);
});
