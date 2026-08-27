import { expect, test } from "@playwright/test";

test("embed shell is isolated, transparent, responsive, and named", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "gpu", {
      configurable: true,
      value: undefined,
    });
  });
  await page.setViewportSize({ width: 320, height: 240 });
  await page.goto("/e2e/fixtures/embed.html");

  await expect(page).toHaveTitle("Fixture shader effect");
  await expect(page.locator("canvas#shader")).toHaveCount(1);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#error")).toContainText("WebGPU is unavailable");
  await expect(page.locator('link[rel="stylesheet"]')).toHaveCount(0);

  const shell = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const canvas = document.querySelector("#shader").getBoundingClientRect();
    return {
      htmlBackground: html.backgroundColor,
      bodyBackground: body.backgroundColor,
      bodyMargin: body.margin,
      bodyPadding: body.padding,
      canvas: { width: canvas.width, height: canvas.height },
      resources: performance
        .getEntriesByType("resource")
        .map((entry) => entry.name),
    };
  });

  expect(shell.htmlBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shell.bodyBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shell.bodyMargin).toBe("0px");
  expect(shell.bodyPadding).toBe("0px");
  expect(shell.canvas).toEqual({ width: 320, height: 240 });
  expect(
    shell.resources.some(
      (url) => url.includes("figui3") || url.includes("mainApp")
    )
  ).toBe(false);

  await page.setViewportSize({ width: 640, height: 360 });
  await expect(page.locator("canvas#shader")).toHaveCSS("width", "640px");
  await expect(page.locator("canvas#shader")).toHaveCSS("height", "360px");
});

test("composition keeps bottom-to-top fills and ordered effects", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "gpu", {
      configurable: true,
      value: {},
    });
  });
  await page.goto("/e2e/fixtures/embed.html?mode=composition");
  await page.waitForFunction(() => Array.isArray(window.__embedLayers));

  expect(await page.evaluate(() => window.__embedLayers)).toEqual([
    { id: "bottom", role: "fill", sourceType: "shader" },
    { id: "top", role: "fill", sourceType: "shader" },
    { id: "first", role: "effect", sourceType: "shader" },
    { id: "second", role: "effect", sourceType: "shader" },
  ]);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#error")).toBeHidden();
});

test("video fills load as animated composition sources", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "gpu", {
      configurable: true,
      value: {},
    });
  });
  await page.goto("/e2e/fixtures/embed.html?mode=video");
  await page.waitForFunction(() => Array.isArray(window.__embedLayers));

  expect(await page.evaluate(() => window.__embedLayers)).toEqual([
    { id: "video", role: "fill", sourceType: "video" },
  ]);
  expect(await page.evaluate(() => window.__embedStarted)).toBe(true);
  await expect(page.locator("#error")).toBeHidden();
});

test("composition embeds load legacy input assets as image fills", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "gpu", {
      configurable: true,
      value: {},
    });
  });
  await page.goto("/e2e/fixtures/embed.html?mode=legacy-image");
  await page.waitForFunction(() => Array.isArray(window.__embedLayers));

  expect(await page.evaluate(() => window.__embedLayers)).toEqual([
    { id: "image", role: "fill", sourceType: "image" },
  ]);
  await expect(page.locator("#error")).toBeHidden();
});

test("HTML fills render a portable bitmap when live element capture is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "gpu", {
      configurable: true,
      value: {},
    });
  });
  await page.goto("/e2e/fixtures/embed.html?mode=html");
  await page.waitForFunction(() => Array.isArray(window.__embedLayers));

  expect(await page.evaluate(() => window.__embedLayers)).toEqual([
    { id: "html", role: "fill", sourceType: "image" },
  ]);
  await expect(page.locator("#error")).toBeHidden();
});

test("public embeds reject private shader dependencies and foreign assets", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "gpu", {
      configurable: true,
      value: {},
    });
  });

  await page.goto("/e2e/fixtures/embed.html?mode=private-dependency");
  await expect(page.locator("#error")).toContainText(
    "A referenced shader is not publicly readable."
  );

  await page.goto("/e2e/fixtures/embed.html?mode=foreign-asset");
  await expect(page.locator("#error")).toContainText(
    "A referenced fill asset is not publicly readable."
  );
});

test("generated iframe code grants WebGPU and camera permissions", async ({
  request,
}) => {
  const response = await request.get("/src/App.jsx");
  expect(response.ok()).toBe(true);
  const source = await response.text();
  expect(source).toContain('allow="webgpu; camera"');
});
