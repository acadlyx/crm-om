import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendSystemEmail: vi.fn(),
  createSystemNotification: vi.fn(),
  EmailProviderNotConfiguredError: class EmailProviderNotConfiguredError extends Error {},
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/messaging/resend", () => ({
  sendSystemEmail: mocks.sendSystemEmail,
  EmailProviderNotConfiguredError: mocks.EmailProviderNotConfiguredError,
}));
vi.mock("@/lib/notifications/service", () => ({ createSystemNotification: mocks.createSystemNotification }));
import { deliverSystemMessage } from "@/lib/messaging/delivery";

describe("unified system-message delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSystemNotification.mockResolvedValue({ id: "notification-1" });
    mocks.sendSystemEmail.mockResolvedValue({ provider: "resend", providerMessageId: "msg-1", status: "accepted" });
  });

  it("persists an in-app notice and sends branded email with a stable idempotency key", async () => {
    const result = await deliverSystemMessage({
      recipientUserId: "user-a", title: "Invoice ready", body: "Your invoice is ready.",
      href: "https://app.example.test/invoices/1", emailTo: "user@example.test", idempotencyKey: "invoice:1:ready",
    });
    expect(mocks.createSystemNotification).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: "user-a", idempotencyKey: "invoice:1:ready" }));
    expect(mocks.sendSystemEmail).toHaveBeenCalledWith("user@example.test", expect.objectContaining({
      subject: "Invoice ready", title: "Invoice ready", bodyText: "Your invoice is ready.",
    }), { idempotencyKey: "system-message:user-a:invoice:1:ready" });
    expect(result.email.status).toBe("accepted");
  });

  it("keeps the durable in-app notification if email delivery is not configured", async () => {
    mocks.sendSystemEmail.mockRejectedValue(new mocks.EmailProviderNotConfiguredError());
    const result = await deliverSystemMessage({
      recipientUserId: "user-a", title: "Notice", body: "Body", emailTo: "user@example.test",
    });
    expect(result.notification.id).toBe("notification-1");
    expect(result.email).toEqual({ status: "failed", errorCode: "provider_not_configured" });
  });

  it("does not call an email provider when no email recipient is requested", async () => {
    const result = await deliverSystemMessage({ recipientUserId: "user-a", title: "Notice", body: "Body" });
    expect(mocks.sendSystemEmail).not.toHaveBeenCalled();
    expect(result.email.status).toBe("not_requested");
  });
});
