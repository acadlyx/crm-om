import { z } from "zod";

const httpUrl = z.string().trim().url().max(2048).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "URL must use HTTP or HTTPS");
const optionalEmail = z.union([
  z.string().trim().email().max(320), z.literal(""), z.null(),
]).optional().transform((value) => value || null);
const optionalUrl = z.union([httpUrl, z.literal(""), z.null()]).optional().transform((value) => value || null);

export const brandingSchema = z.object({
  productName: z.string().trim().min(1).max(120),
  productTagline: z.string().trim().min(1).max(240),
  logoUrl: optionalUrl,
  faviconUrl: optionalUrl,
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  supportEmail: optionalEmail,
  supportWebsite: optionalUrl,
  footerText: z.string().trim().min(1).max(500),
}).strict();

export const tenantSettingsSchema = z.object({
  businessName: z.string().trim().min(1).max(160),
  logoUrl: optionalUrl,
  contactEmail: optionalEmail,
  contactPhone: z.union([z.string().trim().max(40), z.literal(""), z.null()]).optional().transform((value) => value || null),
  address: z.union([z.string().trim().max(1000), z.literal(""), z.null()]).optional().transform((value) => value || null),
  invoicePrefix: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/),
  invoiceIdentity: z.record(z.string(), z.unknown()).default({}),
  preferences: z.record(z.string(), z.unknown()).default({}),
}).strict();
