import { expect, test } from "@playwright/test";

const email = process.env.PLATFORM_ADMIN_EMAIL || "admin@example.test";
const password = process.env.PLATFORM_ADMIN_PASSWORD || "ci-only-password-long-enough";

test("branding update persists and appears on a fresh request without restarting the app", async ({ page, request, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required.");
  const apiUrl = new URL("/api/v1/platform-settings/branding", baseURL).toString();
  const initialResponse = await request.get(apiUrl);
  expect(initialResponse.ok()).toBeTruthy();
  const initial = (await initialResponse.json()).data;

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard(?:$|\?)/);
  await page.goto("/platform-settings/branding");
  await expect(page.getByRole("heading", { name: /branding/i })).toBeVisible();

  const changedName = "Live Branding " + Date.now();
  await page.getByLabel(/product name/i).fill(changedName);
  await page.getByRole("button", { name: /save branding/i }).click();
  await expect(page.getByRole("status")).toContainText(/branding saved/i);

  // No process restart or build occurs between the update and this fresh request.
  await page.reload();
  await expect(page).toHaveTitle(new RegExp(changedName));
  await expect(page.getByText(changedName, { exact: true }).first()).toBeVisible();
  const persistedResponse = await request.get(apiUrl);
  expect((await persistedResponse.json()).data.productName).toBe(changedName);

  // browserContext.request shares the authenticated browser cookies with the page.
  const { updatedAt: _updatedAt, ...originalConfig } = initial;
  const restore = await page.context().request.fetch(apiUrl, {
    method: "PATCH",
    headers: { origin: baseURL, "content-type": "application/json" },
    data: originalConfig,
  });
  expect(restore.ok()).toBeTruthy();
});
