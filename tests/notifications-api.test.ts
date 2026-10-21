import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  db: { systemNotification: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() } },
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
import { GET } from "@/app/api/v1/notifications/route";
import { PATCH } from "@/app/api/v1/notifications/[id]/route";

describe("notification API recipient isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-a", email: "a@example.test" } });
    mocks.db.systemNotification.findMany.mockResolvedValue([]);
    mocks.db.systemNotification.count.mockResolvedValue(0);
    mocks.db.systemNotification.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.systemNotification.findFirst.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", readAt: new Date() });
  });
  it("queries only the current user's notifications", async () => {
    const response = await GET(new Request("http://localhost/api/v1/notifications"));
    expect(response.status).toBe(200);
    expect(mocks.db.systemNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { recipientUserId: "user-a" } }));
  });
  it("marks notifications read only inside the current user's recipient scope", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const response = await PATCH(new Request("http://localhost/api/v1/notifications/" + id), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(mocks.db.systemNotification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id, recipientUserId: "user-a", readAt: null } }));
  });
  it("rejects unauthenticated reads", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/v1/notifications"))).status).toBe(401);
  });
});
