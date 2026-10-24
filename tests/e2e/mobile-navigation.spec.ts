import { expect, test } from "@playwright/test";

const email = process.env.PLATFORM_ADMIN_EMAIL || "admin@example.test";
const password = process.env.PLATFORM_ADMIN_PASSWORD || "ci-only-password-long-enough";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("mobile workspace navigation opens, closes, and stays within the viewport", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard(?:$|\?)/);

  const openButton = page.getByRole("button", { name: "Open navigation menu" });
  await expect(openButton).toBeVisible();
  await expect(page.locator("#app-sidebar")).not.toBeVisible();

  await openButton.click();
  const closeButton = page.getByRole("button", { name: "Close navigation menu" }).first();
  await expect(closeButton).toBeVisible();
  await expect(page.locator("#app-sidebar")).toBeVisible();
  await expect(page.locator("#app-sidebar").getByRole("link", { name: "Overview" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#app-sidebar")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation menu" })).toHaveAttribute("aria-expanded", "false");

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: do¶»§q«^