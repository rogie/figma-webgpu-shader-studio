import { expect, test } from "@playwright/test";

test("canvas companions expose separate fields and preserve composite values", async ({ page }) => {
  await page.goto("/?playground=canvas-controls");
  await expect(page.locator(".canvas-control-example")).toHaveCount(5);
  await expect(page.locator("fig-input-point")).toHaveCount(0);

  const wind = page.getByRole("region", { name: "Point + angle + radius", exact: true });
  const rows = wind.locator("fig-property > fig-stack[slot=input]");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1).locator("fig-input-number").nth(0)).toHaveAttribute("aria-label", "Wind angle");
  await expect(rows.nth(1).locator("fig-input-number").nth(1)).toHaveAttribute("aria-label", "Wind radius");

  for (const [label, value] of [["Wind X", "62"], ["Wind Y", "41"], ["Wind angle", "15"], ["Wind radius", "35"]]) {
    const field = page.getByRole("spinbutton", { name: label, exact: true });
    await field.fill(value);
    await field.press("Tab");
  }
  await expect(wind.locator("fig-canvas-control")).toHaveAttribute("value", JSON.stringify({ x: 62, y: 41, radius: "35%", angle: 15 }));
  await expect(wind.locator('fig-tooltip[text="Angle"] > fig-input-number > fig-icon[slot="prepend"] svg')).toHaveCount(1);
  await expect(page.locator('fig-tooltip[text="Radius"] > fig-input-number > fig-icon[slot="prepend"] svg')).toHaveCount(2);
  const x = wind.getByRole("spinbutton", { name: "Wind X", exact: true });
  await x.hover();
  await expect(page.getByRole("tooltip").filter({ hasText: "X position" })).toBeVisible();
  await wind.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Wind X", exact: true })).toHaveValue("50%");
  await expect(wind.locator("fig-canvas-control")).toHaveAttribute("value", JSON.stringify({ x: 50, y: 50, radius: "30%", angle: -45 }));

  const line = page.getByRole("region", { name: "Two-point line", exact: true });
  const endpoint = page.getByRole("spinbutton", { name: "Line end X", exact: true });
  await endpoint.fill("82");
  await endpoint.press("Tab");
  await expect(line.locator("fig-canvas-control")).toHaveAttribute("value", JSON.stringify({ x: 25, y: 65, x2: 82, y2: 35 }));
});
