import { expect, test } from "@playwright/test";

const email = process.env.PLATFORM_ADMIN_EMAIL || "admin@example.test";
const password = process.env.PLATFORM_ADMIN_PASSWORD || "ci-only-password-long-enough";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("mobile workspace navigation opens, closes, and stays within the viewport", async ({ page }) => {
  await page.goto("/logintoprivatecrmbysyzent7456");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard(?:$|\?)/);

  const sidebar = page.locator("#workspace-sidebar .sidebar");
  const openButton = page.getByRole("button", { name: "Open navigation menu" });
  await expect(openButton).toBeVisible();
  await expect(sidebar).not.toBeVisible();

  await openButton.click();
  await expect(page.getByRole("button", { name: "Close navigation menu" })).toBeVisible();
  await expect(sidebar).toBeVisible();
  const overviewLink = sidebar.getByRole("link", { name: "Overview" });
  await expect(overviewLink).toBeVisible();
  await expect(overviewLink).toHaveAttribute("aria-current", "page");
  await expect(sidebar.locator('.sidebar-link[aria-current="page"]')).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(sidebar).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation menu" })).toHaveAttribute("aria-expanded", "false");

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});
