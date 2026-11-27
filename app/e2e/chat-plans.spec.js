import { expect, test } from "@playwright/test";
import { loadEnv } from "vite";

test.use({ launchOptions: { args: ["--enable-unsafe-webgpu", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } });


const original = "# Original plan\n\nKeep the tones subtle.";
const revised = "# Revised plan\n\nIncrease the contrast.";
const interrupted = "# Interrupted plan\n\nPartial draft.";

test("a built plan stays built across windows and only completed revisions can be built", async ({ context, page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const requests = [];
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, apikey, content-type, x-user-api-key",
  };
  await context.addInitScript(() => {
    localStorage.setItem("shader-studio.providerKeys", JSON.stringify({ openai: "test-key" }));
    localStorage.setItem("shader-studio.chatModel", JSON.stringify({ provider: "openai", id: "gpt-6.2-sol" }));
    localStorage.setItem("shader-studio.chatMode", "plan");
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.pathname !== "/functions/v1/chat") return route.abort();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const payload = request.postDataJSON();
    if (payload.action === "list-models") {
      return route.fulfill({ headers: cors, json: { models: [{ id: "gpt-6.2-sol" }] } });
    }
    requests.push(payload);
    const prompt = payload.messages.at(-1).content;
    const edit = [
      "<summary>Will implement the original plan.</summary>",
      "<description>Subtle tonal changes shape the input image.</description>",
      "```typescript",
      "// Implemented the original plan",
      payload.source.trimEnd(),
      "```",
    ].join("\n");
    const response = {
      "Draft a plan": original,
      "Revise the plan": revised,
      "Draft an interrupted plan": interrupted,
    }[prompt] ?? edit;
    const events = [{ type: "delta", text: response }];
    if (response !== interrupted) events.push({ type: "done" });
    return route.fulfill({
      headers: { ...cors, "content-type": "text/event-stream" },
      body: events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    });
  });

  function buildButton(tab) {
    return tab.getByRole("button", { name: "Build plan", exact: true });
  }
  async function send(tab, prompt) {
    const input = tab.locator("fig-input-text.chat-input textarea");
    await input.fill(prompt);
    await input.press("Enter");
  }

  await page.goto("/shader/dither");
  await send(page, "Draft a plan");
  await expect(buildButton(page)).toBeVisible();
  const other = await context.newPage();
  await other.goto("/shader/dither");
  await expect(buildButton(other)).toBeVisible();

  await buildButton(page).click();
  await expect(page.getByText("Applied plan.md", { exact: true })).toBeVisible();
  await expect(buildButton(page)).toHaveCount(0);
  await expect(other.getByText("Applied plan.md", { exact: true })).toBeVisible();
  await expect(buildButton(other)).toHaveCount(0);

  await page.getByRole("button", { name: "Clear chat" }).click();
  await page.reload();
  await expect(page.getByText("Applied plan.md", { exact: true })).toBeVisible();
  await expect(buildButton(page)).toHaveCount(0);
  expect(requests).toHaveLength(2);

  await send(page, "Draft an interrupted plan");
  await expect(page.getByText("Plan interrupted.", { exact: true })).toBeVisible();
  await expect(page.getByText("Interrupted plan", { exact: true })).toBeVisible();
  await expect(page.getByText(/stream ended before/).first()).toBeAttached();
  await expect(buildButton(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Applied plan.md", { exact: true })).toBeVisible();
  await expect(buildButton(page)).toHaveCount(0);

  await send(page, "Revise the plan");
  await expect(page.getByText("The plan for Revised plan is complete.", { exact: false })).toBeVisible();
  await expect(buildButton(page)).toBeVisible();
});

test("an owned fill remembers its built plan in a separate browser context", async ({ browser, context, page, baseURL }) => {
  const owner = "19ec130f-8bc8-40c5-86e3-774aed96f926";
  const shaderId = "c6a0055e-ca28-4659-a4af-4bdefca67d31";
  const origin = new URL(baseURL).origin;
  const project = new URL(loadEnv("development", process.cwd()).VITE_SUPABASE_URL).hostname.split(".")[0];
  let planStatus = "unknown";
  let committedSource = null;
  let checkpointStarted = false;
  let finishCheckpoint;
  const checkpointGate = new Promise((resolve) => { finishCheckpoint = resolve; });
  const shader = {
    id: shaderId,
    owner_id: owner,
    kind: "fill",
    name: "Older cloud fill",
    source: "export function render(device, frame) {}",
    parameter_values: {},
    state_revision: 1,
    versioned_state_revision: 1,
    updated_at: "2026-11-26T00:00:00Z",
    is_public: false,
  };
  const user = { id: owner, email: "plan-test@example.com", user_metadata: {} };
  const storageKey = `sb-${project}-auth-token`;

  async function mockSupabaseFor(browserContext) {
    await browserContext.addInitScript(({ user, storageKey }) => {
      localStorage.setItem(storageKey, JSON.stringify({
        access_token: "fake.plan.test",
        refresh_token: "fixture",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      }));
      localStorage.setItem("shader-studio.providerKeys", JSON.stringify({ openai: "test-key" }));
      localStorage.setItem("shader-studio.chatModel", JSON.stringify({ provider: "openai", id: "gpt-6.2-sol" }));
    }, { user, storageKey });
    await browserContext.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
        "access-control-expose-headers": "content-range",
      };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const json = (body) => route.fulfill({ headers, json: body });
      if (url.pathname === "/auth/v1/user") return json(user);
      if (url.pathname === "/rest/v1/shaders") {
        return json(request.headers().accept?.includes("vnd.pgrst.object") ? shader : [shader]);
      }
      if (url.pathname.endsWith("/rpc/shader_plan_build_status")) return json(planStatus);
      if (url.pathname.endsWith("/rpc/claim_shader_plan_build")) {
        if (planStatus === "building" || planStatus === "built") return json({ status: planStatus });
        planStatus = "building";
        return json({ status: "claimed", leaseId: "b19d07a8-6314-417c-846e-16a0612d7e55" });
      }
      if (url.pathname.endsWith("/rpc/release_shader_plan_build")) {
        if (planStatus === "building") planStatus = "ready";
        return json(null);
      }
      if (url.pathname.endsWith("/rpc/commit_shader_document")) {
        const payload = request.postDataJSON();
        const source = payload.p_document.p_source;
        if (payload.p_plan_lease_id) {
          expect(payload.p_document.p_checkpoint_kind).toBe("agent");
          expect(payload.p_plan_revision).toMatch(/^[a-f0-9]{64}$/);
          checkpointStarted = true;
          await checkpointGate;
          committedSource = source;
          planStatus = "built";
        }
        return json({ ...shader, source, state_revision: 2, versioned_state_revision: 2 });
      }
      if (url.pathname.startsWith("/rest/v1/")) return json([]);
      if (url.pathname.endsWith("/shader-plans") && url.pathname.includes("/list/")) {
        return json([]);
      }
      if (url.pathname.includes("/shader-plans/") && url.pathname.endsWith("/plan.md")) {
        return route.fulfill({ headers, contentType: "text/markdown", body: original });
      }
      if (url.pathname === "/functions/v1/chat") {
        const payload = request.postDataJSON();
        if (payload.action === "list-models") return json({ models: [{ id: "gpt-6.2-sol" }] });
        const text = "<summary>Will update the fill.</summary>\n<description>Subtle tones fill the canvas.</description>\n" +
          "```typescript\n// Built from the cloud plan\n" + shader.source + "\n```";
        const events = [{ type: "delta", text }, { type: "done" }];
        return route.fulfill({
          headers, contentType: "text/event-stream",
          body: events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
        });
      }
      return route.abort();
    });
  }

  await mockSupabaseFor(context);
  await page.goto(`/shader/${shaderId}`);
  const build = page.getByRole("button", { name: "Build plan", exact: true });
  await expect(build).toBeVisible();
  await build.click();
  await expect.poll(() => checkpointStarted).toBe(true);
  expect(planStatus).toBe("building");
  await expect(page.getByText("Applied plan.md", { exact: true })).toHaveCount(0);

  const separate = await browser.newContext({ baseURL });
  try {
    await mockSupabaseFor(separate);
    const reopened = await separate.newPage();
    await reopened.goto(`/shader/${shaderId}`);
    await expect(reopened.getByRole("button", { name: "Build plan", exact: true })).toBeDisabled();
    finishCheckpoint();
    await expect.poll(() => planStatus).toBe("built");
    expect(committedSource).toContain("Built from the cloud plan");
    await reopened.reload();
    await expect(reopened.getByText("Applied plan.md", { exact: true })).toBeVisible();
    await expect(reopened.getByRole("button", { name: "Build plan", exact: true })).toHaveCount(0);
  } finally {
    finishCheckpoint();
    await separate.close();
  }
});
