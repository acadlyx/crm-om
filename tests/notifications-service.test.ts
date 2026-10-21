import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildSystemNotification: vi.fn(),
  db: { systemNotification: { findUnique: vi.fn(), create: vi.fn() } },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/branding/messages", () => ({ buildSystemNotification: mocks.buildSystemNotification }));
import { createSystemNotification } from "@/lib/notifications/service";

describe("persistent branded notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildSystemNotification.mockResolvedValue({
      title: "Notice", body: "Text", href: "https://example.test/path",
      sourceLabel: "Database Brand", supportEmail: "help@example.test",
    });
    mocks.db.systemNotification.findUnique.mockResolvedValue(null);
    mocks.db.systemNotification.create.mockResolvedValue({ id: "notification-id", sourceLabel: "Database Brand" });
  });
  it("persists the current branded envelope to a specific recipient", async () => {
    const result = await createSystemNotification({ recipientUserId: "user-a", title: "Notice", body: "Text" });
    expect(mocks.db.systemNotification.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      recipientUserId: "user-a", sourceLabel: "Database Brand", supportEmail: "help@example.test",
    }) });
    expect(result.sourceLabel).toBe("Database Brand");
  });
  it("reuses a recipient-scoped idempotency key instead of duplicating a notification", async () => {
    mocks.db.systemNotification.findUnique.mockResolvedValue({ id: "existing", recipientUserId: "user-a" });
    const result = await createSystemNotification({ recipientUserId: "user-a", title: "Notice", body: "Text", idempotencyKey: "invoice:123:due" });
    expect(result.id).toBe("existing");
    expect(mocks.db.systemNotification.create).not.toHaveBeenCalled();
  });
});
