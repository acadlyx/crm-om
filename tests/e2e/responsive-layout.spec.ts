import { expect, test, type Page } from "@playwright/test";

const email = process.env.PLATFORM_ADMIN_EMAIL || "admin@example.test";
const password = process.env.PLATFORM_ADMIN_PASSWORD || "ci-only-password-long-enough";
const widths = [320, 375, 390, 768, 1024, 1280, 1440] as const;
const representativeWidths = [320, 390, 768, 1440] as const;

async function expectNoHorizontalOverflow(page: Page, route: string, width: number) {
  await page.setViewportSize({ width, height: 844 });
  // Let the browser recalculate responsive layout at the new viewport without
  // needlessly reloading the route and re-querying every server component.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.document,
    `${route} causes horizontal page overflow at ${width}px (${dimensions.document}px content in a ${dimensions.viewport}px viewport)`,
  ).toBeLessThanOrEqual(dimensions.viewport);
}

async function openWorkspaceRoute(page: Page, route: string) {
  await page.goto(route);
  await expect(page).toHaveURL((url) => url.pathname === route);
  await expect(page.locator(".workspace-shell")).toBeVisible();
}

test("representative CRM screens do not create page-level horizontal overflow", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/logintoprivatecrmbysyzent7456");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard(?:$|\?)/);

  const allWidthRoutes = ["/dashboard", "/crm/customers", "/operations/products"];
  const representativeRoutes = ["/crm/invoices", "/operations/sales-orders", "/settings/business"];

  // Load each route once, then exercise all CSS breakpoints while that route
  // remains open. This keeps coverage equivalent while reducing 33 navigations
  // to six navigations and makes the suite less sensitive to CI database latency.
  for (const route of allWidthRoutes) {
    await openWorkspaceRoute(page, route);
    for (const width of widths) {
      await expectNoHorizontalOverflow(page, route, width);
    }
  }

  for (const route of representativeRoutes) {
    await openWorkspaceRoute(page, route);
    for (const width of representativeWidths) {
      await expectNoHorizontalOverflow(page, route, width);
    }
  }
});
