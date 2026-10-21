import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    platformSettings: { findUnique: vi.fn(), upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    requirePlatformAdmin: vi.fn(),
    getPlatformBranding: vi.fn(),
    tx,
    db: { $transaction: vi.fn(async (callback: (t: typeof tx) => unknown) => callback(tx)) },
    revalidatePath: vi.fn(),
  };
});
vi.mock("@/lib/authz", () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock("@/lib/branding/service", () => ({ getPlatformBranding: mocks.getPlatformBranding }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { GET, PATCH } from "../app/api/v1/platform-settings/branding/route";

const branding = {
  productName: "Business CRM",
  productTagline: "A clearer view",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#2563EB",
  supportEmail: null,
  supportWebsite: null,
  footerText: "Powered by Business CRM",
};

describe("platform branding API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPlatformBranding.mockResolvedValue(branding);
    mocks.tx.platformSettings.findUnique.mockResolvedValue(null);
    mocks.tx.platformSettings.upsert.mockResolvedValue({ id: "global", ...branding, updatedAt: new Date("2026-10-22T00:00:00Z") });
    mocks.tx.auditLog.create.mockResolvedValue({});
  });

  it("returns default-backed configuration without caching", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).data.productName).toBe("Business CRM");
  });

  it("rejects users without platform-admin permission", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({ ok: false, status: 403, user: null });
    const response = await PATCH(new Request("http://localhost/api/v1/platform-settings/branding", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(branding),
    }) as never);
    expect(response.status).toBe(403);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("persists changes, audits them, and invalidates server-rendered surfaces", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({ ok: true, user: { id: "admin-id" } });
    const response = await PATCH(new Request("http://localhost/api/v1/platform-settings/branding", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" },
      body: JSON.stringify({ ...branding, productName: "Operations Suite" }),
    }) as never);
    expect(response.status).toBe(200);
    expect(mocks.tx.platformSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "global" },
      update: expect.objectContaining({ productName: "Operations Suite" }),
    }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/login");
  });
});
