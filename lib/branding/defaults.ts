/** Central fallback values. Keep temporary product identity defined only here and in the initial DB migration. */
export const DEFAULT_BRANDING = Object.freeze({
  productName: "Business CRM",
  productTagline: "A clearer way to run your business.",
  logoUrl: null as string | null,
  faviconUrl: null as string | null,
  primaryColor: "#2563EB",
  supportEmail: null as string | null,
  supportWebsite: null as string | null,
  footerText: "© {year} {product_name}. All rights reserved.",
  updatedAt: new Date(0).toISOString(),
});

export type Branding = {
  productName: string;
  productTagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
  supportWebsite: string | null;
  footerText: string;
  updatedAt: string;
};
