import { expect, test } from "@playwright/test";

test("export tabs switch panels and actions by click and keyboard", async ({ page }) => {
  await page.goto("/shader/dither");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export", exact: true });
  const image = dialog.getByRole("tab", { name: "Image", exact: true });
  const video = dialog.getByRole("tab", { name: "Video", exact: true });
  const embed = dialog.getByRole("tab", { name: "Embed", exact: true });
  const imagePanel = dialog.locator("#export-tab-image");
  const videoPanel = dialog.locator("#export-tab-video");
  const embedPanel = dialog.locator("#export-tab-embed");

  await expect(image).toHaveAttribute("aria-selected", "true");
  await expect(imagePanel).toBeVisible();
  await expect(videoPanel).toBeHidden();
  await expect(embedPanel).toBeHidden();

  await video.click();
  await expect(video).toHaveAttribute("aria-selected", "true");
  await expect(imagePanel).toBeHidden();
  await expect(dialog.getByRole("tabpanel", { name: "Video" })).toBeVisible();
  await expect(embedPanel).toBeHidden();
  await expect(videoPanel.getByText("Frame rate", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Export", exact: true })).toBeVisible();

  await video.press("ArrowRight");
  await expect(embed).toBeFocused();
  await expect(embed).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("tabpanel", { name: "Embed" })).toBeVisible();
  await expect(videoPanel).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Copy", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Export", exact: true })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(embed).toHaveAttribute("aria-selected", "true");
  await expect(embedPanel).toBeVisible();
  await image.click();
  await expect(dialog.getByRole("tabpanel", { name: "Image" })).toBeVisible();
  await expect(embedPanel).toBeHidden();
});
