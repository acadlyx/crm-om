import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ buildSystemEmail: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/branding/messages", () => ({ buildSystemEmail: mocks.buildSystemEmail }));
import { EmailProviderNotConfiguredError, sendSystemEmail } from "@/lib/messaging/resend";

describe("Resend email delivery adapter", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_only");
    vi.stubEnv("RESEND_FROM_EMAIL", "notify@example.test");
    mocks.buildSystemEmail.mockResolvedValue({
      subject: "Account update", html: "<p>Dynamic Brand</p>", text: "Dynamic Brand",
      branding: { productName: "Dynamic Brand", supportEmail: null, supportWebsite: null },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "resend-msg-123" }), {
      status: 200, headers: { "content-type": "application/json" },
    })));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("sends current branding through the Resend API and reports provider acceptance", async () => {
    const result = await sendSystemEmail("customer@example.test", {
      subject: "Account update", title: "Your account changed", bodyText: "This is an update",
    });
    expect(result).toEqual({ provider: "resend", providerMessageId: "resend-msg-123", status: "accepted" });
    expect(fetch).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
    const init = vi.mocked(fetch).mock.calls[0][1]!;
    const body = JSON.parse(String(init.body));
    expect(body.from).toBe('"Dynamic Brand" <notify@example.test>');
    expect(body.to).toEqual(["customer@example.test"]);
    expect(body.html).toContain("Dynamic Brand");
  });

  it("fails explicitly when delivery credentials are missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendSystemEmail("customer@example.test", {
      subject: "Account update", title: "Your account changed", bodyText: "This is an update",
    })).rejects.toBeInstanceOf(EmailProviderNotConfiguredError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not treat provider rejection as a successful send", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    await expect(sendSystemEmail("customer@example.test", {
      subject: "Account update", title: "Your account changed", bodyText: "This is an update",
    })).rejects.toThrow(/rejected the message/);
  });
});
