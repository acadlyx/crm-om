import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { cacheBustedAssetUrl, renderFooterText } from "@/lib/branding/service";

describe("branding surface helpers", () => {
  it("cache-busts asset URLs after settings change", () => {
    expect(cacheBustedAssetUrl("https://cdn.example/logo.png","2026-10-22T01:00:00.000Z")).toContain("brand_v=");
    expect(cacheBustedAssetUrl(null,"2026-10-22T01:00:00.000Z")).toBeNull();
  });
  it("renders footer placeholders from the centralized brand", () => {
    expect(renderFooterText("© {year} {product_name}","My Product",2026)).toBe("© 2026 My Product");
  });
});
