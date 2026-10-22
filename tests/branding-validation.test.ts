import { describe, expect, it } from "vitest";
import { DEFAULT_BRANDING } from "../lib/branding/defaults";
import { brandingSchema } from "../lib/security/branding-validation";

describe("branding defaults and validation", () => {
  it("uses neutral defaults when storage is empty", () => {
    expect(DEFAULT_BRANDING.productName).toBe("Business CRM");
    expect(DEFAULT_BRANDING.logoUrl).toBeNull();
  });

  it("accepts valid input fields without the output-only updatedAt field", () => {
    const { updatedAt: _updatedAt, ...fields } = DEFAULT_BRANDING;
    expect(brandingSchema.safeParse({ ...fields, supportEmail: "", supportWebsite: "" }).success).toBe(true);
  });

  it("rejects invalid color and email", () => {
    const { updatedAt: _updatedAt, ...fields } = DEFAULT_BRANDING;
    expect(brandingSchema.safeParse({ ...fields, primaryColor: "red" }).success).toBe(false);
    expect(brandingSchema.safeParse({ ...fields, supportEmail: "invalid" }).success).toBe(false);
  });
});
