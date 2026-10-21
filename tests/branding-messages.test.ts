import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getPlatformBranding: vi.fn() }));
vi.mock("@/lib/branding/service", () => ({ getPlatformBranding: mocks.getPlatformBranding }));
import { getBrandingForSystemMessage } from "../lib/branding/messages";

describe("system-message branding", () => {
  it("uses the current branding and support details for notification signatures", async () => {
    mocks.getPlatformBranding.mockResolvedValue({
      productName: "Current Brand", productTagline: "Tagline", logoUrl: null, faviconUrl: null,
      primaryColor: "#123456", supportEmail: "help@example.test", supportWebsite: null,
      footerText: "Footer from settings",
    });
    const value = await getBrandingForSystemMessage();
    expect(value.productName).toBe("Current Brand");
    expect(value.signature).toBe("Current Brand · help@example.test");
    expect(value.footerText).toBe("Footer from settings");
  });
});
