import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireTenantUser: vi.fn(),
  db: { businessSettings: { findUnique: vi.fn(), upsert: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock("@/lib/authz", () => ({ requireTenantUser: mocks.requireTenantUser }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
import { GET, PUT } from "../app/api/v1/tenant-settings/route";

describe("tenant business identity isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantUser.mockResolvedValue({ok:true,user:{id:"user-a",tenantId:"tenant-a",role:"TENANT_ADMIN"}});
    mocks.db.businessSettings.findUnique.mockResolvedValue({tenantId:"tenant-a",businessName:"Tenant A"});
  });
  it("reads only the session tenant settings", async () => {
    const response = await GET(new Request("http://localhost/api/v1/tenant-settings") as never);
    expect(response.status).toBe(200);
    expect(mocks.db.businessSettings.findUnique).toHaveBeenCalledWith({where:{tenantId:"tenant-a"}});
  });
  it("rejects a request attempting to read a second tenant", async () => {
    const request = new Request("http://localhost/api/v1/tenant-settings?tenantId=tenant-b");
    const response = await GET(request as never);
    expect(response.status).toBe(403);
    expect(mocks.db.businessSettings.findUnique).not.toHaveBeenCalled();
  });
  it("rejects unknown tenant identifiers in write payloads", async () => {
    const request = new Request("http://localhost/api/v1/tenant-settings",{
      method:"PUT",headers:{origin:"http://localhost",host:"localhost","content-type":"application/json"},
      body:JSON.stringify({businessName:"Tenant B",invoicePrefix:"INV",tenantId:"tenant-b"}),
    });
    const response = await PUT(request as never);
    expect(response.status).toBe(422);
    expect(mocks.db.businessSettings.upsert).not.toHaveBeenCalled();
  });
});
