import { describe, expect, it } from "vitest";
import { detectAllowedImage, validateBrandingImage } from "@/lib/security/image-validation";

const png = new Uint8Array(33);
png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52,0,0,0,1,0,0,0,1,8,6,0,0,0]);

describe("branding asset validation", () => {
  it("detects image content and rejects SVG", () => {
    expect(detectAllowedImage(png,"logo")).toEqual({extension:"png",mime:"image/png"});
    expect(detectAllowedImage(new TextEncoder().encode("<svg></svg>"),"logo")).toBeNull();
  });
  it("rejects mismatched extensions and declared MIME types", () => {
    expect(validateBrandingImage({size:png.length,type:"image/png",name:"brand.png"},png,"logo").ok).toBe(true);
    expect(validateBrandingImage({size:png.length,type:"image/png",name:"brand.svg"},png,"logo").ok).toBe(false);
    expect(validateBrandingImage({size:png.length,type:"image/jpeg",name:"brand.png"},png,"logo").ok).toBe(false);
  });
  it("uses stricter favicon size limits", () => {
    expect(validateBrandingImage({size:512*1024+1,type:"image/png",name:"icon.png"},png,"favicon").ok).toBe(false);
  });
});
