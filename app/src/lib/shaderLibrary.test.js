import assert from "node:assert/strict";
import test from "node:test";
import {
  ANON_YOU_LABEL,
  buildShaderLibraryCards,
  cacheFullShaderRow,
  filterShaderLibraryCards,
  figmaLibraryKey,
  nextLibraryCardKey,
  parseFigmaLibraryKey,
  visibleLibrarySelection,
} from "./shaderLibrary.js";

test("caches a fetched full shader row for later navigation", () => {
  const rows = [
    { id: "one", name: "Library row", kind: "effect" },
    { id: "two", name: "Other" },
  ];
  const next = cacheFullShaderRow(rows, {
    id: "one",
    source: "export const shader = true;",
    composition: { effectFills: [{ id: "saved-fill" }] },
  });

  assert.equal(next.length, 2);
  assert.equal(next[0].name, "Library row");
  assert.equal(next[0].source, "export const shader = true;");
  assert.equal(next[0].composition.effectFills[0].id, "saved-fill");
});

test("shows drafts, owned cloud drafts, and public shaders without presets", () => {
  const cards = buildShaderLibraryCards({
    drafts: [
      {
        id: "draft:local",
        name: "Draft",
        description: "A local ripple effect.",
        kind: "effect",
      },
    ],
    cloudShaders: [
      {
        id: "private",
        owner_id: "user-1",
        name: "Cloud draft",
        description: "A luminous gradient fill.",
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
        author_handle: "other-author",
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
  assert.equal(cards[2].authorHandle, "other-author");
  assert.deepEqual(
    cards.map((card) => card.authorAvatarUrl),
    [
      "https://example.com/owner.png",
      "https://example.com/owner.png",
      "https://example.com/other.png",
    ]
  );
  assert.deepEqual(
    cards.map((card) => card.description),
    ["A local ripple effect.", "A luminous gradient fill.", ""]
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

test("filters library cards by description", () => {
  const cards = [
    {
      name: "Soft light",
      description: "A drifting iridescent bloom.",
      authorLabel: "Draft",
      kind: "fill",
      origin: "draft",
    },
  ];
  assert.deepEqual(filterShaderLibraryCards(cards, { query: "iridescent" }), cards);
});

test("marks studio cards linked to a Figma shader", () => {
  const cards = buildShaderLibraryCards({
    drafts: [
      {
        id: "draft:linked",
        name: "Linked draft",
        kind: "effect",
        figma_shader_id: "fx-1",
        figma_shader_kind: "effect",
      },
    ],
    cloudShaders: [
      {
        id: "cloud-linked",
        owner_id: "user-1",
        name: "Linked cloud",
        kind: "fill",
        is_public: false,
        figma_shader_id: "fill-1",
        figma_shader_kind: "fill",
      },
      {
        id: "cloud-plain",
        owner_id: "user-1",
        name: "Plain cloud",
        kind: "effect",
        is_public: false,
      },
    ],
    user: { id: "user-1", email: "owner@example.com" },
  });

  assert.equal(cards[0].figmaLinked, true);
  assert.equal(cards[1].figmaLinked, true);
  assert.equal(cards[2].figmaLinked, false);
});

test("preserves composition kind on library cards", () => {
  const cards = buildShaderLibraryCards({
    drafts: [
      {
        id: "draft:comp",
        name: "Stack",
        kind: "composition",
      },
    ],
    cloudShaders: [
      {
        id: "cloud-comp",
        owner_id: "user-1",
        name: "Cloud stack",
        kind: "composition",
        is_public: false,
      },
      {
        id: "mis-tagged",
        owner_id: "user-1",
        name: "New Composition",
        kind: "fill",
        is_public: false,
        composition: {
          fill: { type: "image", shaderId: null, values: {} },
          effects: [],
        },
      },
      {
        id: "real-fill",
        owner_id: "user-1",
        name: "Mesh gradient",
        kind: "fill",
        is_public: false,
      },
    ],
    user: { id: "user-1", email: "owner@example.com" },
  });
  assert.equal(cards[0].kind, "composition");
  assert.equal(cards[1].kind, "composition");
  assert.equal(cards[2].kind, "composition");
  assert.equal(cards[3].kind, "fill");
  assert.deepEqual(filterShaderLibraryCards(cards, { kind: "fill" }), [cards[3]]);
  assert.deepEqual(filterShaderLibraryCards(cards, { kind: "composition" }), [
    cards[0],
    cards[1],
    cards[2],
  ]);
});

test("nextLibraryCardKey prefers the following selectable card", () => {
  const cards = [
    { key: "separator:effect", separatorLabel: "Shader effects" },
    { key: "cloud:a" },
    { key: "cloud:b" },
    { key: "cloud:c" },
  ];
  assert.equal(nextLibraryCardKey(cards, "cloud:a"), "cloud:b");
  assert.equal(nextLibraryCardKey(cards, "cloud:b"), "cloud:c");
  assert.equal(nextLibraryCardKey(cards, "cloud:c"), "cloud:b");
});

test("nextLibraryCardKey falls back to the first card when the list is empty of the deleted key", () => {
  assert.equal(
    nextLibraryCardKey([{ key: "cloud:keep" }], "cloud:gone"),
    "cloud:keep"
  );
  assert.equal(nextLibraryCardKey([], "cloud:gone"), null);
});

test("chooser selection stays empty when filters hide the active shader", () => {
  const visibleCards = [
    { key: "separator:effect", separatorLabel: "Shader effects" },
    { key: "cloud:visible" },
  ];

  assert.equal(
    visibleLibrarySelection(visibleCards, "cloud:visible"),
    "cloud:visible",
  );
  assert.equal(visibleLibrarySelection(visibleCards, "cloud:hidden"), "");
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

test("filters your items using card ownership", () => {
  const cards = [
    {
      name: "Mine",
      authorId: "author-1",
      authorLabel: "You",
      kind: "effect",
      origin: "draft",
      canDelete: true,
    },
    {
      name: "Theirs",
      authorId: "author-2",
      authorLabel: "Grace",
      kind: "effect",
      origin: "public",
      canDelete: false,
    },
  ];

  assert.deepEqual(filterShaderLibraryCards(cards, { author: "me" }), [
    cards[0],
  ]);
});
