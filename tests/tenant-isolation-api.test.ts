import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireTenantUser: vi.fn(),
  db: { businessSettings: { findUnique: vi.fn(), upsert: vi.fn() } },
}));
vi.mock("@/lib/authz", () => ({ requireTenantUser: mocks.requireTenantUser }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
import { GET, PUT } from "../app/api/v1/tenant-settings/route";

describe("tenant settings isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantUser.mockResolvedValue({ ok: true, user: { id: "u1", tenantId: "tenant-a", role: "TENANT_ADMIN" } });
    mocks.db.businessSettings.findUnique.mockResolvedValue(null);
    mocks.db.businessSettings.upsert.mockResolvedValue({ tenantId: "tenant-a", businessName: "Shop A" });
  });
  it("scopes reads to the authenticated tenant", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.db.businessSettings.findUnique).toHaveBeenCalledWith({ where: { tenantId: "tenant-a" } });
  });
  it("rejects caller-supplied tenant IDs rather than allowing tenant switching", async () => {
    const response = await PUT(new Request("http://localhost/api/v1/tenant-settings", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessName: "Shop B", invoicePrefix: "INV", tenantId: "tenant-b" }),
    }) as never);
    expect(response.status).toBe(400);
    expect(mocks.db.businessSettings.upsert).not.toHaveBeenCalled();
  });
});
