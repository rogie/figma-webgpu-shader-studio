import { expect, test } from "@playwright/test";

test("collapsing code and chat gives the remaining height to the preview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    localStorage.setItem("figma-shader-studio:preview-height", "300");
  });
  await page.goto("/shader/dither");
  const preview = page.locator(".shader-viewer-visualizer");
  const sidebar = page.locator(".shader-viewer-sidebar");
  await page.getByRole("button", { name: "Collapse code", exact: true }).click();
  await page.getByRole("button", { name: "Collapse AI chat", exact: true }).click();
  await expect(preview).not.toHaveCSS("height", "300px");
  const viewerBounds = await page.locator("main.shader-viewer").boundingBox();
  const sidebarBounds = await sidebar.boundingBox();
  const previewBounds = await preview.boundingBox();
  expect(Math.abs(sidebarBounds.y + sidebarBounds.height - viewerBounds.y - viewerBounds.height)).toBeLessThan(1);
  expect(sidebarBounds.y - previewBounds.y - previewBounds.height).toBe(16);
  expect(sidebarBounds.height).toBe(96);
  await page.getByRole("button", { name: "Expand AI chat", exact: true }).click();
  await expect(preview).toHaveCSS("height", "300px");
});

test("properties resize within navigation limits and remember their width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/shader/dither");
  const handle = page.getByRole("separator", { name: "Resize shader properties", exact: true });
  const panel = page.locator(".shader-properties-panel");
  const navigation = page.getByRole("separator", { name: "Resize shader navigation", exact: true });
  const maxWidth = Number(await navigation.getAttribute("aria-valuemax"));
  await expect(handle).toHaveAttribute("aria-valuemin", "280");
  await expect(handle).toHaveAttribute("aria-valuemax", String(maxWidth));

  for (const viewportWidth of [1440, 1920]) {
    await page.setViewportSize({ width: viewportWidth, height: 1000 });
    await handle.press("Home");
    await expect(panel).toHaveCSS("width", "280px");
    const bounds = await handle.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x - 200, bounds.y + bounds.height / 2);
    await page.mouse.up();
    await expect(panel).toHaveCSS("width", `${maxWidth}px`);
    await handle.press("ArrowRight");
    await expect(panel).toHaveCSS("width", `${maxWidth - 16}px`);
  }
  await page.reload();
  await expect(panel).toHaveCSS("width", `${maxWidth - 16}px`);
  await handle.dblclick();
  await expect(panel).toHaveCSS("width", "280px");
  await page.setViewportSize({ width: 390, height: 740 });
  await expect(handle).toBeHidden();
});

test("stored and keyboard sizes keep the desktop preview inside the editor", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("figma-shader-studio:code-width", "10000");
  });
  await page.goto("/shader/dither");

  const splitter = page.getByRole("separator", { name: "Resize code and preview panes" });
  const preview = page.locator(".shader-preview.shader-viewer-visualizer");
  const inspector = page.locator(".shader-properties-panel");
  await expect(splitter).toHaveAttribute("aria-orientation", "vertical");
  expect((await preview.boundingBox()).width).toBeGreaterThanOrEqual(220);
  const panel = await inspector.boundingBox();
  expect(panel.x + panel.width).toBeLessThanOrEqual(1920);

  await splitter.press("ArrowLeft");
  expect((await preview.boundingBox()).width).toBeGreaterThan(220);
  await splitter.press("ArrowRight");
  expect((await preview.boundingBox()).width).toBeGreaterThanOrEqual(220);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(splitter).toHaveAttribute("aria-orientation", "horizontal");
  const code = page.locator(".shader-viewer-code");
  const chat = page.locator(".shader-viewer-chat");
  const stackedPreview = await preview.boundingBox();
  const codePanel = await code.boundingBox();
  const chatPanel = await chat.boundingBox();
  expect(stackedPreview.y + stackedPreview.height).toBeLessThanOrEqual(codePanel.y);
  expect(codePanel.y + codePanel.height).toBeLessThanOrEqual(chatPanel.y);
});

test("a compact editor remounts in stacked mode and its properties remain reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto("/shader/dither");

  const splitter = page.getByRole("separator", { name: "Resize code and preview panes" });
  await expect(splitter).toHaveAttribute("aria-orientation", "horizontal");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(splitter).toHaveCount(0);
  await page.goBack();
  await expect(splitter).toHaveAttribute("aria-orientation", "horizontal");
  await page.getByRole("button", { name: "Hide library" }).click();
  const preview = page.locator(".shader-preview.shader-viewer-visualizer");
  const inspector = page.locator(".shader-viewer > .shader-properties-panel");
  expect((await preview.boundingBox()).width).toBeGreaterThan(300);
  await inspector.getByRole("button", { name: "Export", exact: true }).scrollIntoViewIfNeeded();
  await expect(inspector.getByRole("button", { name: "Export", exact: true })).toBeInViewport();
});
