import { describe, expect, it } from "vitest";
import { DEFAULT_BRANDING } from "../lib/branding/defaults";
import { brandingSchema } from "../lib/security/branding-validation";
describe("branding defaults and validation",()=>{
 it("uses neutral defaults when storage is empty",()=>{expect(DEFAULT_BRANDING.productName).toBe("Business CRM");expect(DEFAULT_BRANDING.logoUrl).toBeNull();});
 it("accepts valid values",()=>{expect(brandingSchema.safeParse({...DEFAULT_BRANDING,supportEmail:"",supportWebsite:""}).success).toBe(true);});
 it("rejects invalid color and email",()=>{expect(brandingSchema.safeParse({...DEFAULT_BRANDING,primaryColor:"red"}).success).toBe(false);expect(brandingSchema.safeParse({...DEFAULT_BRANDING,supportEmail:"invalid"}).success).toBe(false);});
});
