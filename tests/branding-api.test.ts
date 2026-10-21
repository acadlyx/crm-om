import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  getPlatformBranding: vi.fn(),
  updatePlatformBranding: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/authz", () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock("@/lib/branding/service", () => ({
  getPlatformBranding: mocks.getPlatformBranding,
  updatePlatformBranding: mocks.updatePlatformBranding,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { GET, PATCH } from "../app/api/v1/platform-settings/branding/route";

const valid = {
  productName: "New Neutral Name",
  productTagline: "New tagline",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#123456",
  supportEmail: "help@example.test",
  supportWebsite: "https://support.example.test",
  footerText: "© {year} {product_name}",
};

function req(body: unknown, headers: Record<string,string> = {}) {
  return new Request("http://localhost/api/v1/platform-settings/branding", {
    method: "PATCH",
    headers: { origin: "http://localhost", host: "localhost", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as never;
}

describe("platform branding API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlatformAdmin.mockResolvedValue({ok:true,user:{id:"platform-admin-id"}});
    mocks.getPlatformBranding.mockResolvedValue({...valid,updatedAt:"2026-10-22T00:00:00.000Z"});
    mocks.updatePlatformBranding.mockResolvedValue({...valid,productName:"New Neutral Name",updatedAt:"2026-10-22T00:00:00.000Z"});
  });

  it("returns current public branding with no-store headers", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects tenant administrators from global writes", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({ok:false,status:403,user:null});
    const response = await PATCH(req(valid));
    expect(response.status).toBe(403);
    expect(mocks.updatePlatformBranding).not.toHaveBeenCalled();
  });

  it("rejects requests with a missing or foreign Origin", async () => {
    const missing = await PATCH(req(valid, {origin:""}));
    const foreign = await PATCH(req(valid, {origin:"https://attacker.example"}));
    expect(missing.status).toBe(403);
    expect(foreign.status).toBe(403);
    expect(mocks.updatePlatformBranding).not.toHaveBeenCalled();
  });

  it("persists a valid update, audits through the service, and invalidates branded surfaces", async () => {
    const response = await PATCH(req(valid));
    expect(response.status).toBe(200);
    expect(mocks.updatePlatformBranding).toHaveBeenCalledWith(valid,"platform-admin-id");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/login");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects malicious URLs and unknown tenant-scoping fields", async () => {
    const response = await PATCH(req({...valid,supportWebsite:"javascript:alert(1)",tenantId:"tenant-b"}));
    expect(response.status).toBe(422);
    expect(mocks.updatePlatformBranding).not.toHaveBeenCalled();
  });
});
