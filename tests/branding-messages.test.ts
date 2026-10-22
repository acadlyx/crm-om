import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getPlatformBranding: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/branding/service", () => ({
  getPlatformBranding: mocks.getPlatformBranding,
  renderFooterText: (template: string, productName: string) => template.replaceAll("{product_name}", productName).replaceAll("{year}", "2026"),
  cacheBustedAssetUrl: (url: string | null) => url,
}));
import { buildSystemEmail, buildSystemNotification } from "@/lib/branding/messages";

describe("system-message branding", () => {
  it("renders the current product branding in system email without trusting HTML input", async () => {
    mocks.getPlatformBranding.mockResolvedValue({
      productName:"Current Product",productTagline:"Tagline",logoUrl:null,faviconUrl:null,
      primaryColor:"#123456",supportEmail:"help@example.test",supportWebsite:"https://support.example.test",
      footerText:"© {year} {product_name}. All rights reserved.",updatedAt:"2026-10-22T00:00:00.000Z",
    });
    const email=await buildSystemEmail({subject:"Welcome",title:"Welcome <user>",bodyText:"Line one\nLine two<script>",actionLabel:"Open",actionUrl:"https://app.example.test"});
    expect(email.html).toContain("Current Product");
    expect(email.html).toContain("#123456");
    expect(email.html).toContain("© 2026 Current Product");
    expect(email.html).toContain("Line one<br>Line two&lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.text).toContain("help@example.test");
  });
  it("drops unsafe notification links but preserves safe internal application paths", async () => {
    mocks.getPlatformBranding.mockResolvedValue({
      productName:"Changed Product",productTagline:"",logoUrl:null,faviconUrl:null,
      primaryColor:"#123456",supportEmail:null,supportWebsite:null,footerText:"{product_name}",updatedAt:"2026-10-22T00:00:00.000Z",
    });
    const unsafe=await buildSystemNotification({title:"Alert",body:"Something changed",href:"javascript:alert(1)"});
    const internal=await buildSystemNotification({title:"Alert",body:"Something changed",href:"/notifications"});
    expect(unsafe.href).toBeNull();
    expect(internal.href).toBe("/notifications");
    expect(internal.sourceLabel).toBe("Changed Product");
  });
});
