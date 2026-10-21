import { z } from "zod";
const optionalUrl = z.union([z.literal(""), z.string().url().max(2048)]).optional().transform(v => v || null);
const optionalEmail = z.union([z.literal(""), z.string().email().max(320)]).optional().transform(v => v || null);
export const brandingSchema = z.object({
  productName: z.string().trim().min(1).max(120),
  productTagline: z.string().trim().min(1).max(240),
  logoUrl: optionalUrl, faviconUrl: optionalUrl,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  supportEmail: optionalEmail, supportWebsite: optionalUrl,
  footerText: z.string().trim().min(1).max(500),
}).strict();
