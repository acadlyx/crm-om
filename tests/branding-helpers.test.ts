import { describe, expect, it } from "vitest";
import { DEFAULT_BRANDING } from "../lib/branding/defaults";
import { brandingSchema } from "../lib/security/branding-validation";

describe("branding defaults and validation", () => {
  it("uses a neutral fallback and no custom image assets", () => {
    expect(DEFAULT_BRANDING.productName).toBe("Business CRM");
    expect(DEFAULT_BRANDING.logoUrl).toBeNull();
    expect(DEFAULT_BRANDING.faviconUrl).toBeNull();
  });
  it("accepts valid configuration fields without updatedAt", () => {
    const { updatedAt: _updatedAt, ...fields } = DEFAULT_BRANDING;
    expect(brandingSchema.safeParse({ ...fields, supportWebsite: "", supportEmail: "" }).success).toBe(true);
  });
  it("rejects malformed colors, emails, and non-http URLs", () => {
    const { updatedAt: _updatedAt, ...fields } = DEFAULT_BRANDING;
    expect(brandingSchema.safeParse({ ...fields, primaryColor: "red" }).success).toBe(false);
    expect(brandingSchema.safeParse({ ...fields, supportEmail: "not-an-email" }).success).toBe(false);
    expect(brandingSchema.safeParse({ ...fields, supportWebsite: "javascript:alert(1)" }).success).toBe(false);
  });
});
