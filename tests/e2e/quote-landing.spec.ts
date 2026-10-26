import { expect, test } from "@playwright/test";

test("landing page shows only a quote and separates quote changes from design changes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const canvas = page.getByRole("button", { name: /change the quote design/i });
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(1);

  // Compare authored quote content, not rendered innerText: each design may
  // apply its own CSS text-transform without changing the actual quotation.
  const quoteText = page.locator(".quote-text");
  const firstQuote = await quoteText.textContent();
  const firstDesign = await page.locator(".quote-landing").getAttribute("class");
  await canvas.click();
  await expect(page.locator(".quote-landing")).not.toHaveAttribute("class", firstDesign || "");
  expect(await quoteText.textContent()).toBe(firstQuote);

  await canvas.dispatchEvent("pointerdown", { clientX: 330, clientY: 420, pointerId: 1, pointerType: "touch", isPrimary: true, button: 0 });
  await canvas.dispatchEvent("pointerup", { clientX: 210, clientY: 422, pointerId: 1, pointerType: "touch", isPrimary: true, button: 0 });
  await expect.poll(() => quoteText.textContent()).not.toBe(firstQuote);
  await expect(page.getByRole("link")).toHaveCount(0);
});
