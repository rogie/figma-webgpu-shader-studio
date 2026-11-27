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

  const libraryResize = page.getByRole("separator", { name: "Resize shader navigation" });
  const navigation = page.getByRole("navigation", { name: "Shader library" });
  const splitter = page.getByRole("separator", { name: "Resize code and preview panes" });
  await expect(splitter).toHaveAttribute("aria-orientation", "horizontal");
  await expect(navigation).toHaveCSS("width", "64px");
  await libraryResize.press("ArrowRight");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(splitter).toHaveCount(0);
  await page.goBack();
  await expect(splitter).toHaveAttribute("aria-orientation", "horizontal");
  await libraryResize.press("Home");
  const preview = page.locator(".shader-preview.shader-viewer-visualizer");
  const inspector = page.locator(".shader-viewer > .shader-properties-panel");
  expect((await preview.boundingBox()).width).toBeGreaterThan(260);
  await inspector.getByRole("button", { name: "Export", exact: true }).scrollIntoViewIfNeeded();
  await expect(inspector.getByRole("button", { name: "Export", exact: true })).toBeInViewport();
});

test("dragging the library snaps to and from a thumbnail rail at 160px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    localStorage.setItem("figma-shader-studio:app-nav-collapsed", "true");
    localStorage.setItem("figma-shader-studio:library-view", "grid");
    localStorage.setItem("figma-shader-studio:library-sections", JSON.stringify({ fill: false }));
    localStorage.setItem("figma-shader-studio:drafts", JSON.stringify([
      { id: "draft:compact-effect", name: "Rail effect", kind: "effect", source: "" },
      { id: "draft:compact-fill", name: "Rail fill", kind: "fill", source: "" },
    ]));
  });
  await page.goto("/shader/dither");

  const nav = page.getByRole("navigation", { name: "Shader library" });
  const handle = page.getByRole("separator", { name: "Resize shader navigation" });
  const headers = nav.locator(".app-nav-headers");
  const fill = nav.locator('fig-choice[aria-label="Rail fill"]');
  await expect(nav).toHaveCSS("width", "240px");
  await expect(nav.getByRole("heading", { name: "Shader studio", exact: true })).toBeVisible();
  await expect(fill).toBeHidden();
  await expect(page.getByRole("button", { name: /^(show|hide) library$/i })).toHaveCount(0);

  async function dragBy(delta) {
    const bounds = await handle.boundingBox();
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + delta, y);
    return { x, y };
  }

  await dragBy(-81);
  await expect(nav).toHaveCSS("width", "159px");
  await expect(headers).toBeVisible();
  await page.mouse.up();
  await expect(nav).toHaveCSS("width", "64px");
  await expect(headers).toBeHidden();
  await expect(nav.locator(".shader-list-header").first()).toBeHidden();
  await expect(fill).toBeVisible();
  await expect(fill.locator("fig-footer")).toBeHidden();
  await expect(page.locator(".app-nav-account")).toBeHidden();
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await expect(settings).toHaveCSS("width", "64px");
  await expect(settings).toHaveCSS("justify-content", "center");

  await page.reload();
  await expect(nav).toHaveCSS("width", "64px");
  const { x, y } = await dragBy(32);
  const fillLabel = fill.locator(".fig-card-label");
  await expect(nav).toHaveCSS("width", "96px");
  await expect(headers).toBeHidden();
  await expect(fillLabel).toBeVisible();
  await expect(fillLabel).toHaveCSS("min-width", "0px");
  await expect(fillLabel).toHaveCSS("text-overflow", "ellipsis");
  expect(await fillLabel.evaluate((label) => label.scrollWidth > label.clientWidth)).toBe(true);
  await page.mouse.move(x + 95, y);
  await page.mouse.up();
  await expect(nav).toHaveCSS("width", "64px");
  await expect(fillLabel).toBeHidden();
  await dragBy(96);
  await expect(nav).toHaveCSS("width", "160px");
  await expect(headers).toBeHidden();
  await expect(fillLabel).toBeVisible();
  await page.mouse.up();
  await expect(nav).toHaveCSS("width", "160px");
  await expect(headers).toBeVisible();
  await expect(fill).toBeHidden();
});

test("a library drag can finish after the resize handle loses pointer capture", async ({ page }) => {
  await page.goto("/shader/dither");
  const nav = page.getByRole("navigation", { name: "Shader library" });
  const handle = page.getByRole("separator", { name: "Resize shader navigation" });
  await handle.press("Home");
  await expect(nav).toHaveCSS("width", "64px");

  await handle.evaluate((element) => {
    element.addEventListener("gotpointercapture", (event) => {
      element.dataset.testPointerId = String(event.pointerId);
    }, { once: true });
  });

  const bounds = await handle.boundingBox();
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 112, y);
  await expect(nav).toHaveCSS("width", "176px");
  await handle.evaluate((element) => {
    element.releasePointerCapture(Number(element.dataset.testPointerId));
  });
  await page.mouse.move(x + 144, y);
  await page.mouse.up();

  await expect(nav).toHaveCSS("width", "208px");
  await expect(nav.locator(".app-nav-headers")).toBeVisible();
});

test("preview settings keeps canvas controls interactive in an anchored popup", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("figma-shader-studio:canvas-color", "#FFFFFF80");
  });
  await page.goto("/shader/dither");

  const trigger = page.getByRole("button", { name: "Preview settings", exact: true });
  const popup = page.getByRole("dialog", { name: "Preview settings", exact: true });
  await trigger.click();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveCSS("width", "240px");
  for (const row of await popup.locator("fig-property").all()) {
    await expect(row).toHaveAttribute("ratio", "1:2");
  }

  const handles = popup.getByRole("switch", { name: "Handles", exact: true });
  await expect(handles).toBeChecked();
  await handles.click();
  await expect(handles).not.toBeChecked();

  const color = popup.getByRole("textbox", { name: "Canvas color hex color" });
  const opacity = popup.getByRole("spinbutton", { name: "Canvas color opacity" });
  await expect(opacity).toHaveValue("50%");
  await color.fill("12AB34");
  await opacity.fill("25");
  await opacity.press("Tab");
  await expect.poll(() => page.evaluate(() =>
    localStorage.getItem("figma-shader-studio:canvas-color"),
  )).toBe("#12AB3440");

  await trigger.click();
  await expect(popup).toBeHidden();
  await trigger.click();
  await expect(handles).not.toBeChecked();
});
