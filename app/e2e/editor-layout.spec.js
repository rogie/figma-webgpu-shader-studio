import { expect, test } from "@playwright/test";

test("collapsing code and chat gives the remaining height to the preview", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1000 });
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

test("code and AI chat share a row beneath the preview on wide editors", async ({ page }) => {
  await page.setViewportSize({ width: 1548, height: 1319 });
  await page.addInitScript(() => {
    localStorage.setItem("figma-shader-studio:app-nav-width", "64");
  });
  await page.goto("/shader/dither");

  const preview = page.locator(".shader-viewer-visualizer");
  const code = page.locator(".shader-viewer-code");
  const chat = page.locator(".shader-viewer-chat");
  const previewDivider = page.getByRole("separator", { name: "Resize code and preview panes" });
  const chatDivider = page.getByRole("separator", { name: "Resize code and chat panes" });
  await expect(chat).toBeVisible();
  await expect(previewDivider).toHaveAttribute("aria-orientation", "horizontal");
  await expect(chatDivider).toHaveAttribute("aria-orientation", "vertical");
  const previewBounds = await preview.boundingBox();
  const codeBounds = await code.boundingBox();
  const chatBounds = await chat.boundingBox();
  expect(codeBounds.y).toBe(previewBounds.y + previewBounds.height + 16);
  expect(chatBounds.y).toBe(codeBounds.y);
  expect(chatBounds.x).toBe(codeBounds.x + codeBounds.width + 16);
  expect(chatBounds.width).toBe(codeBounds.width);
  expect(chatBounds.height).toBe(codeBounds.height);

  await page.getByRole("button", { name: "Collapse code", exact: true }).click();
  await expect(code).toHaveCSS("height", "40px");
  await page.getByRole("button", { name: "Collapse AI chat", exact: true }).click();
  await expect(previewDivider).toBeHidden();
  await expect(page.locator(".shader-viewer-sidebar")).toHaveCSS("height", "40px");
  expect((await preview.boundingBox()).height).toBeGreaterThan(previewBounds.height);

  await page.getByRole("button", { name: "Expand code", exact: true }).click();
  await page.getByRole("button", { name: "Expand AI chat", exact: true }).click();
  await page.setViewportSize({ width: 1000, height: 1000 });
  await expect(chatDivider).toBeVisible();
  const stackedCode = await code.boundingBox();
  expect((await chat.boundingBox()).y).toBeGreaterThan(stackedCode.y + stackedCode.height);
});

test("properties resize within navigation limits and remember their width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/shader/dither");
  const handle = page.getByRole("separator", { name: "Resize shader properties", exact: true });
  const panel = page.locator(".shader-properties-panel");
  const navigation = page.getByRole("separator", { name: "Resize shader navigation", exact: true });
  const maxWidth = Number(await navigation.getAttribute("aria-valuemax"));
  await expect(handle).toHaveAttribute("aria-valuemin", "260");
  await expect(handle).toHaveAttribute("aria-valuemax", String(maxWidth));

  for (const viewportWidth of [1440, 1920]) {
    await page.setViewportSize({ width: viewportWidth, height: 1000 });
    await handle.press("Home");
    await expect(panel).toHaveCSS("width", "260px");
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
  await expect(panel).toHaveCSS("width", "260px");
  await page.setViewportSize({ width: 390, height: 740 });
  await expect(handle).toBeHidden();
});

test("composition preview and inspector share the shader editor layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    localStorage.setItem("figma-shader-studio:drafts", JSON.stringify([
      { id: "draft:inspector", name: "Composition layout", kind: "composition" },
    ]));
  });
  await page.goto("/composer/draft%3Ainspector");

  const viewer = page.locator('main.shader-viewer[data-layout="composition"]');
  const preview = viewer.locator(".shader-viewer-visualizer");
  const inspector = viewer.getByRole("complementary", { name: "Composition" });
  const title = inspector.locator(".shader-editor-header input");
  const resizer = viewer.getByRole("separator", { name: "Resize shader properties" });
  await expect(title).toHaveValue("Composition layout");
  await expect(inspector.getByRole("heading", { name: "Effects" })).toBeVisible();
  await expect(inspector.getByRole("button", { name: "Export", exact: true })).toBeVisible();
  await expect(inspector).toHaveCSS("width", "260px");
  await expect(viewer.getByRole("separator", { name: "Resize code and preview panes" })).toHaveCount(0);

  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const previewBounds = await preview.boundingBox();
    const inspectorBounds = await inspector.boundingBox();
    expect(inspectorBounds.y).toBe(previewBounds.y);
    expect(inspectorBounds.x - previewBounds.x - previewBounds.width).toBe(16);
    expect(width - inspectorBounds.x - inspectorBounds.width).toBe(16);
    expect(inspectorBounds.height).toBeLessThan(previewBounds.height);
    await expect(inspector).toHaveCSS("border-left-width", "0px");
    await expect(inspector).toHaveCSS("border-radius", await preview.evaluate((node) => getComputedStyle(node).borderRadius));
  }

  await resizer.press("ArrowLeft");
  await expect(inspector).toHaveCSS("width", "276px");
  await page.setViewportSize({ width: 390, height: 740 });
  await expect(resizer).toBeHidden();
  const previewBounds = await preview.boundingBox();
  const inspectorBounds = await inspector.boundingBox();
  expect(inspectorBounds.y).toBeGreaterThanOrEqual(previewBounds.y + previewBounds.height);
  expect(inspectorBounds.width).toBe(previewBounds.width);
});

test("standalone shader properties open at the shared inspector width", async ({ page }) => {
  await page.goto("/shader/dither/view");
  await page.getByRole("button", { name: "Show properties", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Properties", exact: true })).toHaveCSS("width", "260px");
});

test("Sources follows the experimental audio setting and shows saved inputs while off", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("figma-shader-studio:experimental-audio", "false");
    localStorage.setItem("figma-shader-studio:drafts", JSON.stringify([
      {
        id: "draft:saved-source",
        name: "Saved audio source",
        kind: "fill",
        source: "export default function Fill() {}",
        composition: { inputs: [{ id: "saved-mic", type: "microphone", enabled: false }] },
      },
      { id: "draft:no-sources", name: "Empty sources", kind: "composition" },
    ]));
  });
  const inspector = page.locator(".shader-properties-panel");
  const sources = inspector.getByRole("heading", { name: "Sources", exact: true });
  const addInput = inspector.getByRole("button", { name: "Add input", exact: true });
  await page.goto("/shader/sphere");
  await expect(inspector.locator(".shader-editor-header input")).toHaveValue("Sphere");
  await expect(sources).toHaveCount(0);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  const experimental = page.locator('.settings-popup fig-group[name="Experimental"]');
  await experimental.getByRole("button", { name: "Experimental", exact: true }).click();
  const audio = experimental.getByRole("switch");
  await audio.click();
  await expect(sources).toBeVisible();
  await expect(addInput).toBeEnabled();
  await audio.click();
  await expect(sources).toHaveCount(0);

  await page.goto("/shader/draft%3Asaved-source");
  await expect(sources).toBeVisible();
  await expect(inspector.getByText(/Enable Audio inputs in Settings/)).toBeVisible();
  await expect(inspector.locator('fig-property[aria-label="Microphone"]')).toBeVisible();
  await expect(addInput).toBeDisabled();

  await page.goto("/composer/draft%3Ano-sources");
  await expect(inspector.getByRole("heading", { name: "Effects", exact: true })).toBeVisible();
  await expect(sources).toHaveCount(0);
});

async function dragDivider(page, divider, dx, dy, checkDuringDrag) {
  await divider.scrollIntoViewIfNeeded();
  const bounds = await divider.boundingBox();
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  expect(await divider.evaluate((node, point) => {
    const hit = document.elementFromPoint(point.x, point.y);
    return hit === node ? true : { hit: hit?.className, point, divider: node.className };
  }, { x, y })).toBe(true);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  try {
    await checkDuringDrag?.();
  } finally {
    await page.mouse.up();
  }
}

for (const [width, height] of [
  [2560, 1440], [1920, 1080], [1601, 900], [1548, 1319], [1200, 800],
  [1001, 800], [1001, 500], [1000, 800], [999, 650], [900, 540],
  [741, 800], [740, 740], [600, 640], [390, 740], [320, 568],
]) {
  test(`editor dividers resize at ${width} × ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      localStorage.setItem("figma-shader-studio:app-nav-width", "64");
      localStorage.setItem("figma-shader-studio:preview-height", "180");
    });
    await page.goto("/shader/dither");

    const nav = page.getByRole("navigation", { name: "Shader library" });
    const preview = page.locator(".shader-viewer-visualizer");
    const inspector = page.locator(".shader-properties-panel");
    const code = page.locator(".shader-viewer-code");
    const chat = page.locator(".shader-viewer-chat");
    const navDivider = page.getByRole("separator", { name: "Resize shader navigation" });
    const previewDivider = page.getByRole("separator", { name: "Resize code and preview panes" });
    const propertiesDivider = page.getByRole("separator", { name: "Resize shader properties" });
    const toolsDivider = page.getByRole("separator", { name: "Resize code and chat panes" });
    const sideBySide = width > 1000;

    await expect(chat).toBeVisible();
    await expect(toolsDivider).toHaveAttribute("aria-orientation", sideBySide ? "vertical" : "horizontal");

    await expect(nav).toHaveCSS("width", "64px");
    await dragDivider(page, navDivider, 96, 0, () => expect(nav).toHaveCSS("width", "160px"));
    await expect(nav.locator(".app-nav-headers")).toBeVisible();
    await dragDivider(page, navDivider, -96, 0);
    await expect(nav).toHaveCSS("width", "64px");

    if (width > 740) {
      await expect(inspector).toHaveCSS("width", "260px");
      await dragDivider(page, propertiesDivider, -32, 0, () => expect(inspector).toHaveCSS("width", "292px"));
      await expect(inspector).toHaveCSS("width", "292px");
      await dragDivider(page, propertiesDivider, 32, 0);
      await expect(inspector).toHaveCSS("width", "260px");
    } else {
      await expect(propertiesDivider).toBeHidden();
      expect((await inspector.boundingBox()).x).toBe((await preview.boundingBox()).x);
    }

    await expect(previewDivider).toHaveAttribute("aria-orientation", "horizontal");
    await expect(preview).toHaveCSS("height", "180px");
    await dragDivider(page, previewDivider, 0, 24, () => expect(preview).toHaveCSS("height", "204px"));
    await expect(preview).toHaveCSS("height", "204px");
    await dragDivider(page, previewDivider, 0, -24);
    await expect(preview).toHaveCSS("height", "180px");

    const beforeCode = await code.boundingBox();
    const beforeChat = await chat.boundingBox();
    const dimension = sideBySide ? "width" : "height";
    const delta = sideBySide ? 24 : 20;
    await dragDivider(page, toolsDivider, sideBySide ? delta : 0, sideBySide ? 0 : delta, async () => {
      await expect.poll(async () => Math.round((await code.boundingBox())[dimension] - beforeCode[dimension])).toBe(delta);
    });
    expect((await chat.boundingBox())[dimension]).toBeCloseTo(beforeChat[dimension] - delta, 0);
    await dragDivider(page, toolsDivider, sideBySide ? -delta : 0, sideBySide ? 0 : -delta);
    expect((await code.boundingBox())[dimension]).toBeCloseTo(beforeCode[dimension], 0);

    const send = chat.getByRole("button", { name: "Send", exact: true });
    await expect(send).toBeVisible();
    const chatPanel = await chat.boundingBox();
    const sendButton = await send.boundingBox();
    expect(sendButton.x + sendButton.width).toBeLessThanOrEqual(chatPanel.x + chatPanel.width);
  });
}

test("tool divider switches axes and preserves separate sizes across the breakpoint", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/shader/dither");
  const divider = page.getByRole("separator", { name: "Resize code and chat panes" });
  const code = page.locator(".shader-viewer-code");
  const chat = page.locator(".shader-viewer-chat");
  await expect(chat).toBeVisible();
  const equalWidth = (await code.boundingBox()).width;
  await divider.press("ArrowRight");
  expect((await code.boundingBox()).width).toBeCloseTo(equalWidth + 16, 0);
  const resizedWidth = (await code.boundingBox()).width;
  await page.reload();
  expect((await code.boundingBox()).width).toBeCloseTo(resizedWidth, 0);

  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(divider).toHaveAttribute("aria-orientation", "horizontal");
  const initialHeight = (await chat.boundingBox()).height;
  await divider.press("ArrowUp");
  expect((await chat.boundingBox()).height).toBe(initialHeight + 16);

  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(divider).toHaveAttribute("aria-orientation", "vertical");
  expect((await code.boundingBox()).width).toBeCloseTo(resizedWidth, 0);
  await divider.dblclick();
  expect((await code.boundingBox()).width).toBeCloseTo(equalWidth, 0);

  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(divider).toHaveAttribute("aria-orientation", "horizontal");
  expect((await chat.boundingBox()).height).toBe(initialHeight + 16);
  await divider.dblclick();
  expect((await chat.boundingBox()).height).toBe(initialHeight);
});

test("wide saved rails and a narrow chat keep the controls inside the editor", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("figma-shader-studio:app-nav-width", "400");
    localStorage.setItem("figma-shader-studio:properties-width", "400");
  });
  await page.goto("/shader/dither");
  const nav = page.getByRole("navigation", { name: "Shader library" });
  const preview = page.locator(".shader-viewer-visualizer");
  const inspector = page.locator(".shader-properties-panel");
  const chat = page.locator(".shader-viewer-chat");
  const divider = page.getByRole("separator", { name: "Resize code and chat panes" });
  await expect(nav).toHaveCSS("width", "400px");
  await expect(inspector).toHaveCSS("width", "400px");

  await page.setViewportSize({ width: 1001, height: 800 });
  await expect(preview).toHaveCSS("width", "400px");
  await expect(divider).toHaveAttribute("aria-orientation", "vertical");
  await divider.press("End");
  expect((await chat.boundingBox()).width).toBeCloseTo(115.2, 0);
  const buttons = chat.getByRole("button", { name: /^(Send|Model and effort:)/ });
  await expect(buttons).toHaveCount(2);
  const chatBounds = await chat.boundingBox();
  for (const button of await buttons.all()) {
    const bounds = await button.boundingBox();
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(chatBounds.x + chatBounds.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(chatBounds.y + chatBounds.height);
  }

  await page.setViewportSize({ width: 1920, height: 900 });
  await expect(nav).toHaveCSS("width", "400px");
  await expect(inspector).toHaveCSS("width", "400px");
});

test("crossing the breakpoint mid-drag cancels the old axis and leaves the new axis draggable", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("figma-shader-studio:preview-height", "180");
    localStorage.setItem("figma-shader-studio:chat-height", "9000");
  });
  await page.goto("/shader/dither");
  const divider = page.getByRole("separator", { name: "Resize code and chat panes" });
  const code = page.locator(".shader-viewer-code");
  const chat = page.locator(".shader-viewer-chat");
  await expect(chat).toBeVisible();
  const initialWidth = (await code.boundingBox()).width;
  await dragDivider(page, divider, 48, 0, async () => {
    await expect.poll(async () => (await code.boundingBox()).width).toBeGreaterThan(initialWidth);
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(divider).toHaveAttribute("aria-orientation", "horizontal");
  });
  const initialHeight = (await chat.boundingBox()).height;
  expect(initialHeight).toBeLessThan(9000);
  await dragDivider(page, divider, 0, 24);
  expect((await chat.boundingBox()).height).toBe(initialHeight - 24);

  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(divider).toHaveAttribute("aria-orientation", "vertical");
  expect((await code.boundingBox()).width).toBeCloseTo(initialWidth, 0);
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
