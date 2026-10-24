import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ db: {} }));
import { canManagePlatformBranding, canManageTenantSettings, tenantScopeForSession } from "@/lib/authz";

describe("branding authorization helpers", () => {
  it("allows only platform administrators to edit global branding", () => {
    expect(canManagePlatformBranding("PLATFORM_ADMIN")).toBe(true);
    expect(canManagePlatformBranding("TENANT_ADMIN")).toBe(false);
    expect(canManagePlatformBranding("STAFF")).toBe(false);
    expect(canManagePlatformBranding(undefined)).toBe(false);
  });
  it("requires an assigned tenant scope for business settings", () => {
    expect(canManageTenantSettings("TENANT_ADMIN","tenant-a")).toBe(true);
    expect(canManageTenantSettings("TENANT_ADMIN",null)).toBe(false);
    expect(canManageTenantSettings("PLATFORM_ADMIN","tenant-a")).toBe(true);
    expect(canManageTenantSettings("PLATFORM_ADMIN",null)).toBe(false);
  });
  it("never switches tenant using a browser-supplied identifier", () => {
    expect(tenantScopeForSession("TENANT_ADMIN","tenant-a")).toBe("tenant-a");
    expect(tenantScopeForSession("TENANT_ADMIN","tenant-a","tenant-a")).toBe("tenant-a");
    expect(tenantScopeForSession("TENANT_ADMIN","tenant-a","tenant-b")).toBeNull();
    expect(tenantScopeForSession("PLATFORM_ADMIN","tenant-a","tenant-a")).toBe("tenant-a");
    expect(tenantScopeForSession("PLATFORM_ADMIN","tenant-a","tenant-b")).toBeNull();
    expect(tenantScopeForSession("PLATFORM_ADMIN",null,"tenant-a")).toBeNull();
  });
});
