import { expect, test } from "@playwright/test";

const email = process.env.PLATFORM_ADMIN_EMAIL || "admin@example.test";
const password = process.env.PLATFORM_ADMIN_PASSWORD || "ci-only-password-long-enough";
const widths = [320, 375, 390, 768, 1024, 1280, 1440] as const;

test("representative CRM screens do not create page-level horizontal overflow", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard(?:$|\?)/);

  const allWidthRoutes = ["/dashboard", "/crm/customers", "/operations/products"];
  const representativeRoutes = ["/crm/invoices", "/operations/sales-orders", "/settings/business"];

  for (const route of allWidthRoutes) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(route);
      await expect(page).toHaveURL((url) => url.pathname === route);
      await expect(page.locator(".workspace-shell")).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(
        dimensions.document,
        `${route} causes horizontal page overflow at ${width}px (${dimensions.document}px content in a ${dimensions.viewport}px viewport)`,
      ).toBeLessThanOrEqual(dimensions.viewport);
    }
  }

  for (const route of representativeRoutes) {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(route);
      await expect(page).toHaveURL((url) => url.pathname === route);
      await expect(page.locator(".workspace-shell")).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(
        dimensions.document,
        `${route} causes horizontal page overflow at ${width}px (${dimensions.document}px content in a ${dimensions.viewport}px viewport)`,
      ).toBeLessThanOrEqual(dimensions.viewport);
    }
  }
});
