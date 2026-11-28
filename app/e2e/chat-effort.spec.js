import { expect, test } from "@playwright/test";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-user-api-key",
};

function shaderEdit(source) {
  return [
    "<summary>Will adjust the shader.</summary>",
    "<description>Increases contrast while preserving the colors of the image.</description>",
    "```typescript",
    source.trimEnd(),
    "```",
  ].join("\n");
}

test("effort follows the model, persists, and is sent in Plan and Agent requests", async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const requests = [];
  await page.addInitScript(() => {
    localStorage.setItem("shader-studio.providerKeys", JSON.stringify({ openai: "test-key", grok: "test-key" }));
    // FigUI3 creates this non-interactive container the first time a tooltip opens.
    const observer = new MutationObserver(() => {
      if (!document.body) return;
      observer.disconnect();
      const overlay = document.createElement("div");
      overlay.setAttribute("data-figui-overlay-root", "");
      document.body.append(overlay);
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.pathname !== "/functions/v1/chat") return route.abort();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const payload = request.postDataJSON();
    if (payload.action === "list-models") {
      const ids = payload.provider === "grok"
        ? ["grok-4.6"]
        : ["gpt-6.2-sol", "gpt-6.2-astra", "gpt-6.1-terra", "gpt-5.6-turbo"];
      return route.fulfill({ headers: cors, json: { models: ids.map((id) => ({ id })) } });
    }
    requests.push(payload);
    const prompt = payload.messages.at(-1).content;
    let text = payload.mode === "plan"
      ? "# Contrast plan\n\nIncrease the contrast without changing the color balance."
      : "Shader advice only.";
    if (prompt === "Try automatic repair") {
      text = shaderEdit("export function render(device, frame) { const broken = ; }");
    } else if (prompt.startsWith("Auto-repair attempt")) {
      text = shaderEdit("// Repair kept its effort\n" + requests.at(-2).source);
    }
    const events = [{ type: "delta", text }, { type: "done" }];
    return route.fulfill({
      headers: { ...cors, "content-type": "text/event-stream" },
      body: events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    });
  });

  await page.goto("/shader/dither");
  const picker = page.locator(".chat-model-picker-trigger");
  const effortLabel = picker.locator(".chat-model-picker-effort");
  const popup = page.getByRole("dialog", { name: "Model and effort", exact: true });
  const slider = popup.getByRole("slider", { name: "Reasoning effort" });
  const model = popup.getByRole("button", { name: "Model", exact: true });
  const input = page.locator("fig-input-text.chat-input textarea");

  async function send(text) {
    const count = requests.length;
    await input.fill(text);
    await input.press("Enter");
    await expect.poll(() => requests.length).toBe(count + 1);
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeHidden();
    return requests.at(-1);
  }
  async function chooseModel(label) {
    if (!(await popup.isVisible())) await picker.click();
    const openBounds = await picker.boundingBox();
    await model.click();
    await popup.getByRole("option", { name: label, exact: true }).click();
    await expect(model).toContainText(label);
    await expect(popup).toBeVisible();
    await expect(picker).toHaveAccessibleName("Select model/effort");
    expect(await picker.boundingBox()).toEqual(openBounds);
  }

  await expect(effortLabel).toHaveText("Default");
  await expect(picker).toHaveAttribute("type", "select");
  await expect(picker).toHaveAttribute("pill", "");
  expect(await send("Default agent request")).not.toHaveProperty("reasoningEffort");
  const buttonBounds = await picker.boundingBox();
  await picker.press("Enter");
  await expect(model).toBeFocused();
  await expect(picker).toHaveText("Select model/effort");
  await expect(picker).toHaveAccessibleName("Select model/effort");
  await expect(picker).toHaveAttribute("selected", "");
  await expect(picker).toHaveAttribute("aria-expanded", "true");
  expect(await picker.boundingBox()).toEqual(buttonBounds);
  await model.press("Enter");
  const modelMenu = popup.locator("fig-select").getByRole("listbox");
  await expect(modelMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modelMenu).toBeHidden();
  await expect(popup).toBeVisible();
  const popupBounds = await popup.boundingBox();
  const modelBounds = await popup.locator("fig-select").boundingBox();
  expect(popupBounds.y).toBeLessThan(buttonBounds.y);
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(popupBounds.width).toBeCloseTo(10 * rem, 0);
  expect(modelBounds.width).toBeLessThan(popupBounds.width);
  expect(modelBounds.x + modelBounds.width / 2).toBeCloseTo(popupBounds.x + popupBounds.width / 2, 0);
  await expect(popup.locator('fig-stack[direction="vertical"][gap="0"] > h3.chat-effort-label + fig-select:not([full])')).toHaveCount(1);
  await expect(page.locator("[data-figui-overlay-root] > .chat-model-picker-popup")).toHaveCSS("pointer-events", "auto");
  await expect(slider).toHaveAttribute("aria-valuemax", "6");
  await expect(popup.locator('fig-property > fig-slider[slot="input"]')).toHaveCount(1);
  const sliderBounds = await slider.boundingBox();
  const sliderY = sliderBounds.y + sliderBounds.height / 2;
  await page.mouse.move(sliderBounds.x + sliderBounds.width * 0.08, sliderY);
  await page.mouse.down();
  await expect(popup).toBeVisible();
  await page.mouse.move(sliderBounds.x + sliderBounds.width * 0.62, sliderY, { steps: 8 });
  await expect(slider).toHaveAttribute("aria-valuetext", "High");
  await page.mouse.move(sliderBounds.x + sliderBounds.width * 0.62, popupBounds.y - 10);
  await page.mouse.up();
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("heading", { level: 3, name: "High", exact: true })).toBeVisible();
  await expect(picker).toHaveText("Select model/effort");
  expect(await picker.boundingBox()).toEqual(buttonBounds);
  expect(await popup.boundingBox()).toEqual(popupBounds);
  await slider.press("Escape");
  await expect(popup).toBeHidden();
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await expect(picker).not.toHaveAttribute("selected", "");
  await expect(effortLabel).toHaveText("High");
  expect((await picker.boundingBox()).width).toBeLessThan(buttonBounds.width);

  expect(await send("High effort agent request")).toMatchObject({
    provider: "openai", model: "gpt-6.2-sol", mode: "agent", reasoningEffort: "high",
  });
  await page.locator('fig-button[aria-label="Enable plan mode"]').click();
  expect(await send("High effort plan request")).toMatchObject({
    provider: "openai", model: "gpt-6.2-sol", mode: "plan", reasoningEffort: "high",
  });
  await page.getByRole("button", { name: "Build plan", exact: true }).click();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests.at(-1)).toMatchObject({ mode: "agent", reasoningEffort: "high" });
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeHidden();

  await input.fill("Try automatic repair");
  await input.press("Enter");
  await expect.poll(() => requests.length).toBe(6);
  expect(requests.slice(-2).map((request) => request.reasoningEffort)).toEqual(["high", "high"]);
  expect(requests.at(-1).messages.at(-1).content).toMatch(/^Auto-repair attempt 1/);
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeHidden();

  await chooseModel("GPT-6.1 Terra");
  await expect(slider).toHaveAttribute("aria-valuetext", "Default");
  await expect(slider).toHaveAttribute("aria-valuemax", "7");
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "None");
  await slider.press("Escape");
  await expect(picker).toHaveAccessibleName("Model and effort: GPT-6.1 Terra, None");
  expect(await send("Terra without reasoning")).toMatchObject({
    model: "gpt-6.1-terra", reasoningEffort: "none",
  });

  await chooseModel("GPT-5.6 Turbo");
  await expect(slider).toHaveAttribute("aria-valuetext", "Default");
  await expect(slider).toBeDisabled();
  await expect(picker).toBeEnabled();
  await chooseModel("Grok 4.6");
  await expect(slider).toBeDisabled();
  await picker.click();
  await expect(picker).toHaveAccessibleName("Model and effort: Grok 4.6, Default");
  expect(await send("Non-OpenAI request")).not.toHaveProperty("reasoningEffort");

  await chooseModel("GPT-6.2 Astra");
  await expect(slider).toBeEnabled();
  await expect(slider).toHaveAttribute("aria-valuetext", "Default");
  await chooseModel("GPT-6.2 Sol");
  await expect(slider).toHaveAttribute("aria-valuetext", "High");
  await picker.click();
  await expect(effortLabel).toHaveText("High");
  await page.reload();
  await expect(effortLabel).toHaveText("High");
  await picker.click();
  const openLabel = picker.getByText("Select model/effort", { exact: true });
  await expect(openLabel).toBeVisible();
  expect(await openLabel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "Default");
  // Click where typing starts, outside the popup anchored above the footer.
  await input.click({ position: { x: 16, y: 12 } });
  await expect(popup).toBeHidden();
  await expect(effortLabel).toHaveText("Default");
  expect(await send("Reset to provider default")).not.toHaveProperty("reasoningEffort");
});

test("old Cursor settings fall back to a configured provider and keep shader chat history", async ({ page }) => {
  const providers = [];
  await page.addInitScript(() => {
    localStorage.setItem("shader-studio.providerKeys", JSON.stringify({ cursor: "retired-key", grok: "test-key" }));
    localStorage.setItem("shader-studio.chatModel", JSON.stringify({ provider: "cursor", id: "composer-2.5" }));
    localStorage.setItem("shader-studio.chatThreads.v1", JSON.stringify({
      "preset:dither": [{ role: "assistant", content: "Existing shader discussion" }],
    }));
  });
  await page.route("**/functions/v1/chat", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const { action, provider } = request.postDataJSON();
    providers.push(provider);
    if (action === "list-models") {
      return route.fulfill({ headers: cors, json: { models: [{ id: "grok-4.6" }] } });
    }
    return route.fulfill({
      headers: { ...cors, "content-type": "text/event-stream" },
      body: 'data: {"type":"delta","text":"Grok reply"}\n\ndata: {"type":"done"}\n\n',
    });
  });
  await page.goto("/shader/dither");
  const picker = page.locator(".chat-model-picker-trigger");
  await expect(picker).toHaveAccessibleName(/Model and effort: Grok 4\.6/);
  await expect(page.getByText("Existing shader discussion", { exact: true })).toBeVisible();
  await picker.click();
  const modelDialog = page.getByRole("dialog", { name: "Model and effort", exact: true });
  await modelDialog.getByRole("button", { name: "Model", exact: true }).click();
  await expect(modelDialog.getByRole("option", { name: "Grok 4.6", exact: true })).toBeVisible();
  await expect(modelDialog.getByText(/Cursor|Composer 2\.5/)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  const keys = page.locator('.settings-popup fig-group[name="AI API keys"]');
  await expect(keys.locator("fig-field > label")).toHaveText(["OpenAI", "Anthropic", "Gemini", "Grok"]);
  await page.locator(".settings-popup").getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("shader-studio.providerKeys")))).toEqual({
    openai: "", anthropic: "", gemini: "", grok: "test-key",
  });
  await page.keyboard.press("Escape");

  const input = page.locator("fig-input-text.chat-input textarea");
  await input.fill("Continue the conversation");
  await input.press("Enter");
  await expect(page.getByText("Grok reply", { exact: true })).toBeVisible();
  expect(providers).not.toHaveLength(0);
  expect(new Set(providers)).toEqual(new Set(["grok"]));
});
