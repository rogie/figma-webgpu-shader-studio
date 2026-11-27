import { expect, test } from "@playwright/test";

test("disconnect wins over an in-flight Figma token refresh", async ({ page }) => {
  let finishRefresh;
  const pending = new Promise((resolve) => { finishRefresh = resolve; });
  let refreshCount = 0;
  await page.route("**/functions/v1/figma-shaders", async (route) => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const operation = route.request().postDataJSON().op;
    if (operation !== "oauth-refresh") return route.fulfill({ status: 500, headers });
    refreshCount += 1;
    await pending;
    return route.fulfill({
      headers,
      json: { accessToken: "fixture-new-token", refreshToken: "fixture-new-refresh", expiresIn: 3600 },
    });
  });
  await page.goto("/shader/dither");
  const result = page.evaluate(async () => {
    const tokens = await import("/src/lib/figmaAccessToken.js");
    const figma = await import("/src/services/figmaShaders.js");
    tokens.setFigmaOAuthSession({
      accessToken: "fixture-token",
      refreshToken: "fixture-refresh",
      expiresAt: Date.now() - 10_000,
    });
    return figma.testFigmaConnection().then(() => "success", (error) => error.code);
  });
  await expect.poll(() => refreshCount).toBe(1);
  await page.evaluate(async () => {
    const figma = await import("/src/services/figmaShaders.js");
    figma.disconnectFigma();
  });
  finishRefresh();
  await expect(result).resolves.toBe("figma_connection_changed");
  expect(await page.evaluate(async () => {
    const tokens = await import("/src/lib/figmaAccessToken.js");
    return tokens.getFigmaAccessToken();
  })).toBe("");
});
