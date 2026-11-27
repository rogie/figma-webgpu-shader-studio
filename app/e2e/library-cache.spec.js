import { expect, test } from "@playwright/test";
import { writeLibrarySessionCache } from "../src/lib/librarySessionCache.js";

test("library rail restores from session cache before revalidation", async ({
  page,
}) => {
  const row = {
    id: "cached-shader",
    owner_id: "author-1",
    name: "Cached rail item",
    description: "Rendered before the network listing returns.",
    kind: "effect",
    is_public: true,
    thumbnail_path: "author-1/cached-shader/thumbnail.png",
    features: {},
    state_revision: 4,
    versioned_state_revision: 4,
    created_at: "2026-09-02T12:00:00Z",
    updated_at: "2026-09-02T12:00:00Z",
    author_name: "Cached author",
    author_avatar_url: null,
    author_handle: "cached-author",
  };
  const thumbnail =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  const cache = {};
  writeLibrarySessionCache({
    scope: "anonymous",
    shaders: [row],
    thumbnails: { [row.id]: thumbnail },
    thumbnailExpiries: { [row.id]: Date.now() + 30 * 60_000 },
    now: Date.now() - 6 * 60_000,
    storage: { setItem: (key, value) => { cache[key] = value; } },
  });
  let releaseListing;
  const listingGate = new Promise((resolve) => {
    releaseListing = resolve;
  });
  let listingRequests = 0;

  await page.addInitScript(
    (cacheEntries) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(
        "figma-shader-studio:editor-filters",
        JSON.stringify({ kind: "all", origin: "all", author: "all" }),
      );
      for (const [key, value] of Object.entries(cacheEntries)) {
        localStorage.setItem(key, value);
      }
      Object.defineProperty(Navigator.prototype, "gpu", {
        configurable: true,
        value: undefined,
      });
    },
    cache,
  );

  await page.route("**/rest/v1/shaders*", async (route) => {
    listingRequests += 1;
    await listingGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/1" },
      body: JSON.stringify([row]),
    });
  });
  await page.route("**/rest/v1/profiles*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    }),
  );

  await page.goto("/dither");
  const choice = page.locator('nav.app-nav fig-choice[value="cloud:cached-shader"]');
  await expect(choice).toHaveCount(1);
  const image = choice.locator("fig-image");
  await expect(image).toHaveAttribute("src", thumbnail);
  await choice.evaluate((element) => {
    element.dataset.cacheIdentity = "preserved";
  });

  releaseListing();
  await expect.poll(() => listingRequests).toBe(1);
  await page.waitForTimeout(250);

  await expect(choice).toHaveAttribute("data-cache-identity", "preserved");
  await expect(image).toHaveAttribute("src", thumbnail);
});
