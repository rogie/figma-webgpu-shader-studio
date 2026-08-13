import assert from "node:assert/strict";
import test from "node:test";
import {
  ANON_YOU_LABEL,
  buildShaderLibraryCards,
  filterShaderLibraryCards,
  figmaLibraryKey,
  parseFigmaLibraryKey,
} from "./shaderLibrary.js";

test("shows drafts, owned cloud drafts, and public shaders without presets", () => {
  const cards = buildShaderLibraryCards({
    drafts: [
      {
        id: "draft:local",
        name: "Draft",
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
        author_avatar_url: "https://example.com/other.png",
        kind: "effect",
        is_public: true,
      },
    ],
    user: {
      id: "user-1",
      email: "owner@example.com",
      user_metadata: { avatar_url: "https://example.com/owner.png" },
    },
  });

  assert.deepEqual(
    cards.map((card) => card.thumbnailUrl),
    [null, null, null]
  );
  assert.deepEqual(
    cards.map((card) => card.authorAvatarUrl),
    [
      "https://example.com/owner.png",
      "https://example.com/owner.png",
      "https://example.com/other.png",
    ]
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
        authorLabel: "Draft",
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

test("labels signed-out local drafts as Anon (You)", () => {
  const [draft] = buildShaderLibraryCards({
    drafts: [{ id: "draft:local", name: "Draft", kind: "effect" }],
    cloudShaders: [],
  });

  assert.equal(draft.authorName, ANON_YOU_LABEL);
});

test("builds figma library cards and parses keys", () => {
  const cards = buildShaderLibraryCards({
    drafts: [],
    cloudShaders: [],
    figmaShaders: [
      { id: "fx-1", name: "CRT", kind: "effect", description: "Retro" },
    ],
  });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].origin, "figma");
  assert.equal(cards[0].key, figmaLibraryKey("effect", "fx-1"));
  assert.deepEqual(parseFigmaLibraryKey(cards[0].key), {
    kind: "effect",
    id: "fx-1",
  });
  assert.deepEqual(filterShaderLibraryCards(cards, { origin: "figma" }), [
    cards[0],
  ]);
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
