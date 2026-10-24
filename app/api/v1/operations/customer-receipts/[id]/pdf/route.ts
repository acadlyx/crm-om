import { PDFDocument, StandardFonts, rgb, type Color as PDFColor, type PDFImage, type PDFFont } from "pdf-lib";
import { requireWorkspaceAccess } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { db } from "@/lib/db";
import { normalizeReceiptTemplate } from "@/lib/receipts/template";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;

const BLACK = rgb(0.13, 0.17, 0.16);
const MUTED = rgb(0.38, 0.43, 0.41);
const LIGHT_BORDER = rgb(0.86, 0.89, 0.87);
const PALE = rgb(0.96, 0.975, 0.965);
const WHITE = rgb(1, 1, 1);
const DANGER = rgb(0.7, 0.15, 0.16);

function pdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/₹/g, "INR ")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[\u2012-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2022\u00b7]/g, "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function asMoney(value: unknown, currency: string): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "INR",
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0).replace(/[\u00a0\u202f]/g, " ");
}

type RGBTriplet = { r: number; g: number; b: number };

function fromHex(value: string): RGBTriplet {
  const hex = value.replace("#", "");
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

function toPdfColor(color: RGBTriplet): PDFColor {
  return rgb(color.r, color.g, color.b);
}

function tint(color: RGBTriplet, amount: number): RGBTriplet {
  return {
    r: color.r + (1 - color.r) * amount,
    g: color.g + (1 - color.g) * amount,
    b: color.b + (1 - color.b) * amount,
  };
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const value = pdfText(text);
  if (!value) return [];
  const words = value.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? line + " " + word : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(
  page: ReturnType<PDFDocument["addPage"]>,
  value: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size: number,
  color = BLACK,
  lineHeight = size + 4,
  maxLines = 5,
): number {
  const lines = wrapText(value, font, size, width).slice(0, maxLines);
  for (const line of lines) {
    page.drawText(line, { x, y, size, font, color });
    y -= lineHeight;
  }
  return y;
}

async function embedTrustedLogo(pdf: PDFDocument, logoUrl: string | null | undefined): Promise<PDFImage | null> {
  if (!logoUrl || !process.env.S3_PUBLIC_BASE_URL) return null;
  try {
    const base = new URL(process.env.S3_PUBLIC_BASE_URL);
    const target = new URL(logoUrl);
    const basePath = base.pathname.replace(/\/$/, "");
    if (base.protocol !== "https:" || target.protocol !== "https:" || target.origin !== base.origin ||
      !target.pathname.startsWith(basePath + "/")) return null;

    const response = await fetch(target, { signal: AbortSignal.timeout(2500), cache: "no-store" });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const length = Number(response.headers.get("content-length") || 0);
    if (!["image/png", "image/jpeg"].includes(type) || (length > 1_500_000)) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 1_500_000) return null;
    return type === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    // A bad or unsupported business logo must not prevent a receipt download.
    return null;
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return Response.json({ error: { message: access.message } }, { status: access.status });

  const permission = await requireWorkspacePermission(access, "customer-receipts", "read");
  if (!permission.ok) return Response.json({ error: { message: permission.message } }, { status: permission.status });

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: { message: "Invalid receipt identifier." } }, { status: 400 });
  }

  const receipt = await db.customerReceipt.findFirst({
    where: { id, tenantId: access.tenantId },
    include: {
      customer: { select: { name: true, company: true, email: true, phone: true } },
      allocations: { include: { invoice: { select: { invoiceNumber: true } } }, orderBy: { invoice: { invoiceNumber: "asc" } } },
    },
  });
  if (!receipt) return Response.json({ error: { message: "Receipt not found in this workspace." } }, { status: 404 });
  const receiptNumber = receipt.receiptNumber;

  const settings = await db.businessSettings.findUnique({ where: { tenantId: access.tenantId } });
  const preferences = settings?.preferences && typeof settings.preferences === "object" && !Array.isArray(settings.preferences)
    ? settings.preferences as Record<string, unknown>
    : {};
  const template = normalizeReceiptTemplate(preferences.receiptTemplate);
  const accent = fromHex(template.accentColor);
  const pdf = await PDFDocument.create();
  pdf.setTitle(template.title + " - " + receipt.receiptNumber);
  pdf.setSubject("Customer payment receipt");
  pdf.setCreator(settings?.businessName || "Business CRM");
  pdf.setProducer("Business CRM");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const logo = await embedTrustedLogo(pdf, settings?.logoUrl);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 46;

  function nextPage() {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - 48;
    page.drawText(pdfText(settings?.businessName || "Business"), { x: MARGIN, y, size: 12, font: bold, color: BLACK });
    page.drawText("RECEIPT " + pdfText(receiptNumber) + " - CONTINUED", {
      x: MARGIN, y: y - 18, size: 8, font: normal, color: MUTED,
    });
    page.drawLine({ start: { x: MARGIN, y: y - 28 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 28 }, thickness: 1, color: toPdfColor(accent) });
    y -= 48;
  }

  function ensureSpace(height: number) {
    if (y - height < 54) nextPage();
  }

  const businessName = pdfText(settings?.businessName || "Business");
  if (logo) {
    const scale = Math.min(86 / logo.width, 50 / logo.height, 1);
    page.drawImage(logo, {
      x: PAGE_WIDTH - MARGIN - logo.width * scale,
      y: y - logo.height * scale + 2,
      width: logo.width * scale,
      height: logo.height * scale,
    });
  } else {
    const initials = businessName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    page.drawRectangle({ x: PAGE_WIDTH - MARGIN - 42, y: y - 38, width: 42, height: 42, color: toPdfColor(tint(accent, 0.85)), borderColor: toPdfColor(tint(accent, 0.55)), borderWidth: 0.8 });
    page.drawText(pdfText(initials || "BC"), { x: PAGE_WIDTH - MARGIN - 34, y: y - 23, size: 13, font: bold, color: toPdfColor(accent) });
  }

  page.drawText(businessName, { x: MARGIN, y, size: 17, font: bold, color: BLACK, maxWidth: 390 });
  let businessY = y - 19;
  if (settings?.address) businessY = drawWrapped(page, settings.address, MARGIN, businessY, 390, normal, 8, MUTED, 11, 2) - 1;
  const contact = [settings?.contactEmail, settings?.contactPhone].filter(Boolean).join("  |  ");
  if (contact) businessY = drawWrapped(page, contact, MARGIN, businessY, 390, normal, 8, MUTED, 11, 2);
  y = Math.min(businessY - 12, y - 61);

  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: template.style === "minimal" ? 0.6 : 1.6, color: toPdfColor(accent) });
  y -= 31;

  if (template.style === "modern") {
    page.drawRectangle({ x: MARGIN, y: y - 8, width: PAGE_WIDTH - MARGIN * 2, height: 36, color: toPdfColor(tint(accent, 0.88)) });
    page.drawText(pdfText(template.title), { x: MARGIN + 12, y: y + 4, size: 18, font: bold, color: toPdfColor(accent) });
    y -= 44;
  } else {
    page.drawText(pdfText(template.title), { x: MARGIN, y, size: 19, font: bold, color: template.style === "classic" ? toPdfColor(accent) : BLACK });
    y -= 26;
  }

  if (receipt.status === "REVERSED") {
    page.drawRectangle({ x: MARGIN, y: y - 3, width: PAGE_WIDTH - MARGIN * 2, height: 25, color: rgb(1, 0.94, 0.94), borderColor: DANGER, borderWidth: 0.8 });
    page.drawText("REVERSED - NOT VALID AS A PAYMENT CONFIRMATION", { x: MARGIN + 9, y: y + 5, size: 8.8, font: bold, color: DANGER });
    y -= 38;
  }

  const amountCardHeight = 78;
  page.drawRectangle({ x: MARGIN, y: y - amountCardHeight + 9, width: 236, height: amountCardHeight, color: toPdfColor(tint(accent, 0.92)), borderColor: toPdfColor(tint(accent, 0.67)), borderWidth: 0.8 });
  page.drawText("AMOUNT RECEIVED", { x: MARGIN + 14, y: y - 12, size: 8, font: bold, color: MUTED });
  page.drawText(pdfText(asMoney(receipt.amount, settings?.currency || "INR")), { x: MARGIN + 14, y: y - 42, size: 19, font: bold, color: toPdfColor(accent), maxWidth: 208 });
  page.drawText("Receipt " + pdfText(receipt.receiptNumber), { x: MARGIN + 14, y: y - 59, size: 8.5, font: normal, color: MUTED });
  page.drawText("STATUS", { x: MARGIN + 260, y: y - 12, size: 8, font: bold, color: MUTED });
  page.drawText(pdfText(receipt.status), { x: MARGIN + 260, y: y - 29, size: 11, font: bold, color: receipt.status === "REVERSED" ? DANGER : toPdfColor(accent) });
  page.drawText("DATE RECEIVED", { x: MARGIN + 260, y: y - 48, size: 8, font: bold, color: MUTED });
  page.drawText(new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: settings?.timezone || "Asia/Kolkata" }).format(receipt.receivedAt), {
    x: MARGIN + 260, y: y - 63, size: 10, font: normal, color: BLACK,
  });
  y -= 99;

  page.drawText("RECEIVED FROM", { x: MARGIN, y, size: 8, font: bold, color: MUTED });
  y -= 18;
  page.drawText(pdfText(receipt.customer.name), { x: MARGIN, y, size: 13, font: bold, color: BLACK, maxWidth: PAGE_WIDTH - MARGIN * 2 });
  y -= 17;
  if (receipt.customer.company) { page.drawText(pdfText(receipt.customer.company), { x: MARGIN, y, size: 9, font: normal, color: MUTED }); y -= 14; }
  if (template.showCustomerContact) {
    const customerContact = [receipt.customer.email, receipt.customer.phone].filter(Boolean).join("  |  ");
    if (customerContact) { y = drawWrapped(page, customerContact, MARGIN, y, PAGE_WIDTH - MARGIN * 2, normal, 8.5, MUTED, 12, 2); }
  }
  y -= 12;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.6, color: LIGHT_BORDER });
  y -= 22;

  const col1 = MARGIN;
  const col2 = MARGIN + 250;
  page.drawText("PAYMENT METHOD", { x: col1, y, size: 8, font: bold, color: MUTED });
  page.drawText(pdfText(String(receipt.method).replaceAll("_", " ")), { x: col1, y: y - 16, size: 10, font: normal, color: BLACK });
  if (template.showReference && receipt.reference) {
    page.drawText("TRANSACTION REFERENCE", { x: col2, y, size: 8, font: bold, color: MUTED });
    page.drawText(pdfText(receipt.reference), { x: col2, y: y - 16, size: 10, font: normal, color: BLACK, maxWidth: PAGE_WIDTH - MARGIN - col2 });
  }
  y -= 39;

  if (template.showAllocations && receipt.allocations.length) {
    ensureSpace(80);
    page.drawText("INVOICE ALLOCATION", { x: MARGIN, y, size: 10.5, font: bold, color: BLACK });
    y -= 19;
    page.drawRectangle({ x: MARGIN, y: y - 6, width: PAGE_WIDTH - MARGIN * 2, height: 21, color: template.style === "minimal" ? PALE : toPdfColor(tint(accent, 0.9)) });
    page.drawText("INVOICE", { x: MARGIN + 9, y: y + 1, size: 8, font: bold, color: BLACK });
    page.drawText("AMOUNT ALLOCATED", { x: PAGE_WIDTH - MARGIN - 145, y: y + 1, size: 8, font: bold, color: BLACK });
    y -= 19;

    let allocated = 0;
    for (const allocation of receipt.allocations) {
      ensureSpace(26);
      page.drawText(pdfText(allocation.invoice.invoiceNumber), { x: MARGIN + 9, y, size: 9, font: normal, color: BLACK, maxWidth: 290 });
      page.drawText(pdfText(asMoney(allocation.amount, settings?.currency || "INR")), {
        x: PAGE_WIDTH - MARGIN - 145, y, size: 9, font: normal, color: BLACK, maxWidth: 135,
      });
      allocated += Number(allocation.amount);
      y -= 19;
    }
    page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 8 }, thickness: 0.6, color: LIGHT_BORDER });
    page.drawText("Total allocated", { x: MARGIN + 9, y: y - 5, size: 9, font: bold, color: BLACK });
    page.drawText(pdfText(asMoney(allocated, settings?.currency || "INR")), { x: PAGE_WIDTH - MARGIN - 145, y: y - 5, size: 9, font: bold, color: BLACK });
    y -= 29;
    const unallocated = Number(receipt.amount) - allocated;
    if (unallocated > 0.005) {
      page.drawText("Unallocated balance: " + pdfText(asMoney(unallocated, settings?.currency || "INR")), { x: MARGIN + 9, y, size: 8.5, font: italic, color: MUTED });
      y -= 17;
    }
  }

  if (template.showNotes && receipt.notes) {
    ensureSpace(52);
    y -= 3;
    page.drawText("NOTES", { x: MARGIN, y, size: 8, font: bold, color: MUTED });
    y -= 14;
    y = drawWrapped(page, receipt.notes, MARGIN, y, PAGE_WIDTH - MARGIN * 2, normal, 9, BLACK, 13, 6) - 5;
  }

  ensureSpace(80);
  if (template.footerText) {
    y = drawWrapped(page, template.footerText, MARGIN, y - 2, PAGE_WIDTH - MARGIN * 2, italic, 9, MUTED, 13, 4) - 12;
  }
  if (template.signatureLabel) {
    const lineY = Math.max(y - 28, 70);
    page.drawLine({ start: { x: PAGE_WIDTH - MARGIN - 170, y: lineY }, end: { x: PAGE_WIDTH - MARGIN, y: lineY }, thickness: 0.7, color: MUTED });
    page.drawText(pdfText(template.signatureLabel), { x: PAGE_WIDTH - MARGIN - 170, y: lineY - 14, size: 8, font: normal, color: MUTED });
  }
  page.drawLine({ start: { x: MARGIN, y: 38 }, end: { x: PAGE_WIDTH - MARGIN, y: 38 }, thickness: 0.5, color: LIGHT_BORDER });
  page.drawText(businessName + "  |  Generated from Business CRM", { x: MARGIN, y: 24, size: 7, font: normal, color: MUTED });

  const bytes = await pdf.save();
  const safeNumber = pdfText(receipt.receiptNumber).replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 48) || "receipt";
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="receipt-' + safeNumber + '.pdf"; filename*=UTF-8\'\'' + encodeURIComponent("receipt-" + safeNumber + ".pdf"),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
