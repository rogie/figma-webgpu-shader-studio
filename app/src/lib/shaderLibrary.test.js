import assert from "node:assert/strict";
import test from "node:test";
import { buildShaderLibraryCards, filterShaderLibraryCards } from "./shaderLibrary.js";

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
        author_name: "Owner",
        kind: "fill",
        is_public: false,
      },
      {
        id: "public",
        owner_id: "user-2",
        name: "Published",
        author_name: "Other author",
        kind: "effect",
        is_public: true,
      },
    ],
    user: { id: "user-1", email: "owner@example.com" },
  });

  assert.deepEqual(
    cards.map((card) => card.thumbnailUrl),
    [null, null, null]
  );

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
        authorLabel: "Owner",
        canDelete: true,
      },
      {
        key: "cloud:public",
        origin: "public",
        authorLabel: "Other author",
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

test("filters published shaders by author", () => {
  const cards = [
    {
      name: "First",
      authorId: "author-1",
      authorLabel: "Ada",
      kind: "fill",
      origin: "public",
    },
    {
      name: "Second",
      authorId: "author-2",
      authorLabel: "Grace",
      kind: "effect",
      origin: "public",
    },
  ];

  assert.deepEqual(filterShaderLibraryCards(cards, { author: "author-2" }), [
    cards[1],
  ]);
});
