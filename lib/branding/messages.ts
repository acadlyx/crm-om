import "server-only";
import { getPlatformBranding, renderFooterText, cacheBustedAssetUrl } from "@/lib/branding/service";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch { return null; }
}
function safeNotificationHref(value: string | undefined): string | null {
  if (!value) return null;
  // Keep ordinary app-relative paths on this origin; reject protocol-relative/backslash URLs.
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/[\u0000-\u001f]/.test(value)) return value;
  return safeHttpUrl(value);
}

export type SystemMessage = {
  subject: string;
  title: string;
  bodyText: string;
  actionLabel?: string;
  actionUrl?: string;
};

/** Email systems call this at send time so the message uses current database branding. */
export async function buildSystemEmail(message: SystemMessage) {
  const brand = await getPlatformBranding();
  const supportLine = brand.supportEmail ? "Support: " + brand.supportEmail : "";
  const footer = renderFooterText(brand.footerText, brand.productName);
  const actionUrl = safeHttpUrl(message.actionUrl);
  const action = actionUrl && message.actionLabel
    ? '<p><a href="' + escapeHtml(actionUrl) + '">' + escapeHtml(message.actionLabel) + "</a></p>"
    : "";
  const supportUrl = safeHttpUrl(brand.supportWebsite);
  const supportLink = supportUrl ? '<a href="' + escapeHtml(supportUrl) + '">Support website</a>' : "";
  const logoUrl = cacheBustedAssetUrl(safeHttpUrl(brand.logoUrl), brand.updatedAt);
  const logo = logoUrl ? '<img src="' + escapeHtml(logoUrl) + '" alt="" style="max-height:48px;max-width:180px">' : "";
  const safeBody = escapeHtml(message.bodyText).replaceAll("\n", "<br>");
  const brandHeader = logo + '<strong>' + escapeHtml(brand.productName) + "</strong><div>" + escapeHtml(brand.productTagline) + "</div>";
  const html = '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#152238">' +
    '<header style="border-bottom:3px solid ' + escapeHtml(brand.primaryColor) + ';padding:16px 0">' + brandHeader + "</header>" +
    "<main><h1>" + escapeHtml(message.title) + "</h1><p>" + safeBody + "</p>" + action + "</main>" +
    '<footer style="border-top:1px solid #e5e7eb;padding-top:16px;font-size:12px;color:#667085"><p>' +
    escapeHtml(supportLine) + "</p><p>" + escapeHtml(footer) + "</p>" + supportLink + "</footer></body></html>";
  return {
    subject: message.subject,
    text: [brand.productName, brand.productTagline, "", message.title, "", message.bodyText, "", supportLine, footer, supportUrl || ""].filter(Boolean).join("\n"),
    html,
    branding: { productName: brand.productName, supportEmail: brand.supportEmail, supportWebsite: supportUrl },
  };
}

/** Shared envelope for in-app or push-notification adapters. */
export async function buildSystemNotification(input: { title: string; body: string; href?: string }) {
  const brand = await getPlatformBranding();
  return {
    title: input.title,
    body: input.body,
    href: safeNotificationHref(input.href),
    sourceLabel: brand.productName,
    supportEmail: brand.supportEmail,
  };
}
