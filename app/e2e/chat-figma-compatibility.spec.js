import { expect, test } from "@playwright/test";

const olderReply = "The previous agent suggested using gestureId.";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-user-api-key",
};

function edit(source) {
  return [
    "<summary>Will update the shader.</summary>",
    "<description>Subtle tonal changes shape the input image.</description>",
    "```typescript",
    source.trimEnd(),
    "```",
  ].join("\n");
}

test("old shader chat uses the selected OpenAI model and only applies completed Figma edits", async ({ page, context, baseURL }) => {
  const requests = [];
  const origin = new URL(baseURL).origin;
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });

  await page.addInitScript((savedReply) => {
    localStorage.setItem("shader-studio.providerKeys", JSON.stringify({ openai: "mock-test-key" }));
    localStorage.setItem("shader-studio.chatModel", JSON.stringify({ provider: "openai", id: "gpt-6.2-sol" }));
    localStorage.setItem("shader-studio.chatMode", "agent");
    localStorage.setItem("shader-studio.chatThreads.v1", JSON.stringify({
      "preset:dither": [
        { role: "user", content: "Older shader request" },
        { role: "assistant", content: savedReply },
      ],
    }));
  }, olderReply);

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.pathname !== "/functions/v1/chat") return route.abort();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });

    const payload = request.postDataJSON();
    if (payload.action === "list-models") {
      return route.fulfill({ headers: cors, json: { models: [
        { id: "gpt-6.2-sol", label: "GPT-6.2 Sol" },
        { id: "gpt-6.2-astra", label: "GPT-6.2 Astra" },
      ] } });
    }
    requests.push(payload);

    const prompt = payload.messages.at(-1).content;
    const responses = {
      "Try unsupported input": edit(payload.source.replace(
        "export function render(device, frame) {",
        "export function render(device, frame) {\n  var dragged = frame.mousePosition.gestureId",
      )),
      "Give advice": "This is an example.\n```typescript\n// Advice only\n" + payload.source + "\n```",
      "Try an interrupted edit": edit("// Interrupted edit\n" + payload.source),
      "Add a held-button effect": edit("// Completed native edit\n" + payload.source.replace(
        "export function render(device, frame) {",
        "export function render(device, frame) {\n  var held = frame.mousePosition.down",
      )),
    };
    const events = [{ type: "delta", text: responses[prompt] }];
    if (prompt !== "Try an interrupted edit") events.push({ type: "done" });
    return route.fulfill({
      headers: { ...cors, "content-type": "text/event-stream" },
      body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    });
  });

  await page.goto("/shader/dither");
  await expect(page.getByText(olderReply)).toBeVisible();
  const expandCode = page.getByRole("button", { name: "Expand code", exact: true });
  if (await expandCode.isVisible()) await expandCode.click();
  const editor = page.locator(".cm-content").first();
  await expect(editor).toBeVisible();
  const initialSource = await editor.innerText();
  const input = page.locator("fig-input-text.chat-input textarea");
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  const modelPicker = page.getByRole("button", { name: "Model", exact: true });

  async function send(prompt, result) {
    await input.fill(prompt);
    await input.press("Enter");
    if (result) await expect(page.getByText(result).first()).toBeAttached();
    await expect(stop).toBeHidden();
  }

  await send("Try unsupported input", "Figma shader compatibility:");
  expect(requests[0]).toMatchObject({ provider: "openai", model: "gpt-6.2-sol" });
  expect(await editor.innerText()).toBe(initialSource);
  expect(requests[0].messages).toContainEqual(expect.objectContaining({ role: "assistant", content: olderReply }));
  expect(requests[0].skills).toContain("Figma MCP shader contract");
  expect(requests[0].skills).toContain("frame.mousePosition.down");
  expect(requests[0].skills).not.toMatch(/gestureId|endReason|frame\.audio|supportsAudio/);

  await send("Give advice", "This is an example.");
  expect(await editor.innerText()).toBe(initialSource);

  await send("Try an interrupted edit", "stream ended before the agent finished");
  expect(await editor.innerText()).toBe(initialSource);

  await modelPicker.click();
  await page.getByText("GPT-6.2 Astra", { exact: true }).click();
  await send("Add a held-button effect");
  expect(requests.at(-1)).toMatchObject({ provider: "openai", model: "gpt-6.2-astra" });
  await expect(editor).toContainText("Completed native edit");
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("frame.mousePosition.down");
  expect(requests).toHaveLength(4);
});
