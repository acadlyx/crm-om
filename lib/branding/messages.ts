import "server-only";
import { getPlatformBranding } from "@/lib/branding/service";

/** Shared email/notification code should use this helper instead of hardcoding product labels. */
export async function getBrandingForSystemMessage() {
  const brand = await getPlatformBranding();
  return {
    productName: brand.productName,
    supportEmail: brand.supportEmail,
    supportWebsite: brand.supportWebsite,
    footerText: brand.footerText,
    signature: brand.supportEmail
      ? brand.productName + " · " + brand.supportEmail
      : brand.productName,
  };
}
