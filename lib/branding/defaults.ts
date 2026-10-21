export const DEFAULT_BRANDING = Object.freeze({
  productName: "Business CRM",
  productTagline: "A clearer view of your business",
  logoUrl: null as string | null,
  faviconUrl: null as string | null,
  primaryColor: "#2563EB",
  supportEmail: null as string | null,
  supportWebsite: null as string | null,
  footerText: "Powered by Business CRM",
});
export type Branding = {
  productName: string; productTagline: string; logoUrl: string | null; faviconUrl: string | null;
  primaryColor: string; supportEmail: string | null; supportWebsite: string | null; footerText: string; updatedAt?: string;
};
