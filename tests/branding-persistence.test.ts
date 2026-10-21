import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const row = {
    id:"global",productName:"Business CRM",productTagline:"Tagline",logoUrl:null,faviconUrl:null,
    primaryColor:"#2563eb",supportEmail:null,supportWebsite:null,footerText:"© {year} {product_name}",
    updatedAt:new Date("2026-10-22T00:00:00.000Z"),
  };
  const tx = {
    platformSettings:{update:vi.fn(async ({data}:{data:Record<string,unknown>})=>({...row,...data,updatedAt:new Date("2026-10-22T01:00:00.000Z")}))},
    auditLog:{create:vi.fn(async()=>({}))},
  };
  const db = {
    platformSettings:{
      findUnique:vi.fn(async()=>row),
      create:vi.fn(async()=>row),
    },
    $transaction:vi.fn(async (callback:(transaction:typeof tx)=>Promise<unknown>)=>callback(tx)),
  };
  return {row,tx,db};
});
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({db:mocks.db}));
import { getPlatformBranding, updatePlatformBranding } from "@/lib/branding/service";

describe("platform branding persistence service",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.db.platformSettings.findUnique.mockResolvedValue(mocks.row as never);
    mocks.db.platformSettings.create.mockResolvedValue(mocks.row as never);
    mocks.tx.platformSettings.update.mockImplementation(async ({data}:{data:Record<string,unknown>})=>({...mocks.row,...data,updatedAt:new Date("2026-10-22T01:00:00.000Z")}) as never);
  });
  it("initializes the singleton defaults when the row is missing",async()=>{
    mocks.db.platformSettings.findUnique.mockResolvedValueOnce(null as never).mockResolvedValueOnce(mocks.row as never);
    const result=await getPlatformBranding();
    expect(mocks.db.platformSettings.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({id:"global",productName:"Business CRM"})}));
    expect(result.productName).toBe("Business CRM");
  });
  it("writes branding and its audit event in one transaction",async()=>{
    const result=await updatePlatformBranding({
      productName:"Changed Product",productTagline:"New tagline",logoUrl:null,faviconUrl:null,
      primaryColor:"#123456",supportEmail:"help@example.test",supportWebsite:null,
      footerText:"© {year} {product_name}",
    },"admin-id");
    expect(mocks.db.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.platformSettings.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:"global"},data:expect.objectContaining({productName:"Changed Product",primaryColor:"#123456"})}));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({actorUserId:"admin-id",action:"platform.branding.updated"})}));
    expect(result.productName).toBe("Changed Product");
  });
  it("uses defaults when database reads fail",async()=>{
    mocks.db.platformSettings.findUnique.mockRejectedValueOnce(new Error("database unavailable"));
    const result=await getPlatformBranding();
    expect(result.productName).toBe("Business CRM");
    expect(result.logoUrl).toBeNull();
  });
});
