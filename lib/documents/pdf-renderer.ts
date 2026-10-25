import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { DocumentBlockKey, DocumentTemplate, DocumentKind } from "@/lib/documents/templates";

type Item = { description: string; quantity?: string; unitPrice?: string; discount?: string; tax?: string; total?: string; detail?: string };
type KeyValue = { label: string; value: string; strong?: boolean };
export type DocumentPDFData = {
  kind: DocumentKind;
  number: string;
  status?: string;
  currency?: string;
  business: { name: string; address?: string | null; email?: string | null; phone?: string | null; logoUrl?: string | null };
  party?: { label?: string; name: string; company?: string | null; email?: string | null; phone?: string | null; address?: string | null; taxId?: string | null };
  metadata?: KeyValue[];
  items?: Item[];
  totals?: KeyValue[];
  history?: KeyValue[];
  notes?: string | null;
  customHeading?: string;
  customText?: string;
  producer?: string;
};

const PAGE = { A4: [595.28, 841.89] as [number, number], LETTER: [612, 792] as [number, number] };
const BLACK = rgb(0.12, 0.16, 0.22);
const MUTED = rgb(0.40, 0.45, 0.52);
const LIGHT = rgb(0.88, 0.90, 0.93);
const PALE = rgb(0.96, 0.97, 0.99);
const WHITE = rgb(1, 1, 1);
type Color = { r: number; g: number; b: number };
function colorFromHex(hex: string): Color {
  const value = hex.replace("#", "");
  return { r: parseInt(value.slice(0, 2), 16) / 255, g: parseInt(value.slice(2, 4), 16) / 255, b: parseInt(value.slice(4, 6), 16) / 255 };
}
function lighten(color: Color, by: number): Color {
  return { r: color.r + (1 - color.r) * by, g: color.g + (1 - color.g) * by, b: color.b + (1 - color.b) * by };
}
function safeText(value: unknown): string {
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
function linesFor(text: string, font: PDFFont, size: number, width: number): string[] {
  const value = safeText(text);
  if (!value) return [];
  const result: string[] = [];
  let line = "";
  for (const word of value.split(" ")) {
    const candidate = line ? line + " " + word : word;
    if (!line || font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
    else { result.push(line); line = word; }
  }
  if (line) result.push(line);
  return result;
}
async function embedLogo(pdf: PDFDocument, url?: string | null): Promise<PDFImage | null> {
  if (!url || !process.env.S3_PUBLIC_BASE_URL) return null;
  try {
    const base = new URL(process.env.S3_PUBLIC_BASE_URL);
    const target = new URL(url);
    const basePath = base.pathname.replace(/\/$/, "");
    if (base.protocol !== "https:" || target.protocol !== "https:" || target.origin !== base.origin ||
      !target.pathname.startsWith(basePath + "/")) return null;
    const response = await fetch(target, { signal: AbortSignal.timeout(2500), cache: "no-store" });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const length = Number(response.headers.get("content-length") || 0);
    if (!["image/png", "image/jpeg"].includes(type) || length > 1_500_000) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 1_500_000) return null;
    return type === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function renderDocumentPdf(data: DocumentPDFData, template: DocumentTemplate): Promise<Uint8Array> {
  const base = PAGE[template.paperSize];
  const size = template.orientation === "landscape" ? [base[1], base[0]] as [number, number] : base;
  const [width, height] = size;
  const margin = template.orientation === "landscape" ? 38 : 46;
  const contentWidth = width - margin * 2;
  const accent = colorFromHex(template.accentColor);
  const accentTint = lighten(accent, 0.89);
  const bodySize = template.fontSize;
  const lineGap = bodySize + 4;
  const pdf = await PDFDocument.create();
  pdf.setTitle(safeText(template.title + " - " + data.number));
  pdf.setSubject(safeText(data.kind + " PDF"));
  pdf.setCreator(safeText(data.business.name || "Business"));
  pdf.setProducer(safeText(data.producer || "CRM document renderer"));
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const logo = template.showLogo ? await embedLogo(pdf, data.business.logoUrl) : null;

  let page = pdf.addPage(size);
  let y = height - margin;
  let pageIndex = 1;
  const newPage = () => {
    page = pdf.addPage(size);
    pageIndex += 1;
    y = height - margin;
    if (pageIndex > 1) {
      page.drawText(safeText(data.business.name), { x: margin, y, size: 10, font: bold, color: BLACK, maxWidth: contentWidth * 0.55 });
      page.drawText(safeText((template.title || "DOCUMENT") + " " + data.number + " - CONTINUED"), {
        x: margin, y: y - 15, size: 7.5, font: normal, color: MUTED, maxWidth: contentWidth,
      });
      page.drawLine({ start: { x: margin, y: y - 23 }, end: { x: width - margin, y: y - 23 }, thickness: 0.8, color: rgb(accent.r, accent.g, accent.b) });
      y -= 38;
    }
  };
  const ensure = (space: number) => { if (y - space < 54) newPage(); };
  const drawParagraph = (text: string, x: number, maxWidth: number, font = normal, fontSize = bodySize, color = MUTED, maxLines = 5) => {
    const wrapped = linesFor(text, font, fontSize, maxWidth).slice(0, maxLines);
    for (const line of wrapped) {
      ensure(fontSize + 5);
      page.drawText(line, { x, y, size: fontSize, font, color, maxWidth });
      y -= fontSize + 4;
    }
  };
  const heading = (label: string) => {
    ensure(31);
    page.drawText(safeText(label).toUpperCase(), { x: margin, y, size: 8, font: bold, color: rgb(accent.r, accent.g, accent.b), characterSpacing: 0.55 });
    y -= 15;
  };
  const drawKeyValues = (values: KeyValue[], columns = 2) => {
    if (!values.length) return;
    const cellWidth = contentWidth / columns;
    for (let index = 0; index < values.length; index += columns) {
      const row = values.slice(index, index + columns);
      const rowHeight = Math.max(...row.map((item) => linesFor(item.value, normal, bodySize, cellWidth - 14).length), 1) * lineGap + 13;
      ensure(rowHeight + 3);
      row.forEach((item, offset) => {
        const x = margin + offset * cellWidth;
        page.drawText(safeText(item.label).toUpperCase(), { x, y, size: 7.2, font: bold, color: MUTED, maxWidth: cellWidth - 10 });
        const wrapped = linesFor(item.value, item.strong ? bold : normal, bodySize, cellWidth - 14).slice(0, 3);
        wrapped.forEach((line, lineIndex) => page.drawText(line, {
          x, y: y - 13 - lineIndex * lineGap, size: bodySize,
          font: item.strong ? bold : normal, color: BLACK, maxWidth: cellWidth - 14,
        }));
      });
      y -= rowHeight;
    }
  };
  const drawItems = (items: Item[]) => {
    if (!items.length) {
      page.drawText("No line items recorded.", { x: margin, y, size: bodySize, font: normal, color: MUTED });
      y -= lineGap + 8;
      return;
    }
    const cols = [
      { label: "DESCRIPTION", key: "description" as const, ratio: 0.40 },
      { label: "QTY", key: "quantity" as const, ratio: 0.09 },
      { label: "RATE", key: "unitPrice" as const, ratio: 0.15 },
      { label: "DISCOUNT", key: "discount" as const, ratio: 0.11 },
      { label: "TAX", key: "tax" as const, ratio: 0.10 },
      { label: "AMOUNT", key: "total" as const, ratio: 0.15 },
    ];
    const xAt = (index: number) => margin + contentWidth * cols.slice(0, index).reduce((sum, col) => sum + col.ratio, 0);
    const drawTableHeader = () => {
      ensure(30);
      page.drawRectangle({ x: margin, y: y - 7, width: contentWidth, height: 22, color: template.headerStyle === "plain" ? PALE : rgb(accentTint.r, accentTint.g, accentTint.b) });
      cols.forEach((col, index) => {
        const colWidth = contentWidth * col.ratio - 7;
        page.drawText(col.label, { x: xAt(index) + 5, y: y + 1, size: 6.8, font: bold, color: BLACK, maxWidth: colWidth });
      });
      y -= 24;
    };
    drawTableHeader();
    for (const item of items) {
      const descWidth = contentWidth * cols[0].ratio - 12;
      const desc = linesFor([item.description, item.detail].filter(Boolean).join(" - "), normal, bodySize, descWidth).slice(0, 3);
      const rowHeight = Math.max(1, desc.length) * lineGap + 8;
      if (y - rowHeight < 54) {
        newPage();
        drawTableHeader();
      }
      desc.forEach((line, n) => page.drawText(line, { x: xAt(0) + 5, y: y - n * lineGap, size: bodySize, font: normal, color: BLACK, maxWidth: descWidth }));
      [item.quantity, item.unitPrice, item.discount, item.tax, item.total].forEach((value, index) => {
        if (!value) return;
        const colIndex = index + 1;
        page.drawText(safeText(value), {
          x: xAt(colIndex) + 4, y,
          size: bodySize - 0.3, font: normal, color: BLACK,
          maxWidth: contentWidth * cols[colIndex].ratio - 8,
        });
      });
      page.drawLine({ start: { x: margin, y: y - rowHeight + 4 }, end: { x: width - margin, y: y - rowHeight + 4 }, thickness: 0.45, color: LIGHT });
      y -= rowHeight;
    }
    y -= 8;
  };

  const blocks: DocumentBlockKey[] = template.blockOrder;
  for (const block of blocks) {
    if (template.hiddenBlocks.includes(block)) continue;
    if (block === "business") {
      ensure(88);
      if (template.headerStyle === "band") {
        page.drawRectangle({ x: margin, y: y - 66, width: contentWidth, height: 76, color: rgb(accentTint.r, accentTint.g, accentTint.b) });
      }
      const useLogo = Boolean(template.showLogo && logo);
      const centeredLogo = useLogo && template.logoPosition === "center";
      let logoHeight = 0;
      let logoWidth = 0;
      if (useLogo && logo) {
        const logoSize = template.logoSize;
        const scale = Math.min(logoSize / logo.width, logoSize / logo.height, 1);
        logoWidth = logo.width * scale;
        logoHeight = logo.height * scale;
        const logoX = template.logoPosition === "center" ? (width - logoWidth) / 2 : template.logoPosition === "right" ? width - margin - logoWidth : margin;
        page.drawImage(logo, { x: logoX, y: centeredLogo ? y - logoHeight + 3 : y - logoHeight + 7, width: logoWidth, height: logoHeight });
      }
      const nameX = useLogo && template.logoPosition === "left" ? margin + template.logoSize + 12 : margin;
      const nameY = centeredLogo ? y - logoHeight - 8 : y;
      const brandWidth = useLogo && !centeredLogo ? contentWidth - template.logoSize - 12 : contentWidth;
      page.drawText(safeText(data.business.name || "Business"), {
        x: nameX, y: nameY, size: 15, font: bold, color: BLACK, maxWidth: brandWidth,
        ...(centeredLogo ? { align: "center" as const } : {}),
      });
      let businessY = nameY - 18;
      for (const line of [data.business.address, [data.business.email, data.business.phone].filter(Boolean).join("  |  ")].filter(Boolean)) {
        const txt = safeText(line);
        if (txt) {
          page.drawText(txt, {
            x: nameX, y: businessY, size: 7.8, font: normal, color: MUTED, maxWidth: brandWidth,
            ...(centeredLogo ? { align: "center" as const } : {}),
          });
          businessY -= 11;
        }
      }
      y -= Math.max(centeredLogo ? logoHeight + 48 : logoHeight + 14, 55);
      if (template.headerStyle === "rule") {
        page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.7, color: rgb(accent.r, accent.g, accent.b) });
        y -= 17;
      } else if (template.headerStyle === "band") y -= 10;
    } else if (block === "title") {
      ensure(template.titleSize + 30);
      if (template.headerStyle === "band") {
        page.drawRectangle({ x: margin, y: y - template.titleSize - 13, width: contentWidth, height: template.titleSize + 22, color: WHITE, borderColor: rgb(accent.r, accent.g, accent.b), borderWidth: 0.7 });
      }
      page.drawText(safeText(template.title || data.kind), { x: margin + (template.headerStyle === "band" ? 11 : 0), y: y - template.titleSize + 2, size: template.titleSize, font: bold, color: rgb(accent.r, accent.g, accent.b), maxWidth: contentWidth - 12 });
      const numberY = y - template.titleSize - 7;
      page.drawText("DOCUMENT NO. " + safeText(data.number), { x: margin + (template.headerStyle === "band" ? 11 : 0), y: numberY, size: 8, font: bold, color: BLACK, maxWidth: contentWidth * 0.65 });
      if (template.showStatus && data.status) {
        const status = safeText(data.status.replaceAll("_", " "));
        page.drawText("STATUS  " + status, { x: width - margin - Math.min(160, normal.widthOfTextAtSize(status, 8) + 48), y: numberY, size: 8, font: bold, color: rgb(accent.r, accent.g, accent.b), maxWidth: 160 });
      }
      y -= template.titleSize + 31;
    } else if (block === "party" && data.party?.name) {
      heading(data.party.label || (data.kind === "invoice" ? "Bill to" : data.kind === "customerReceipt" ? "Received from" : "Supplier"));
      const name = safeText(data.party.name);
      page.drawText(name, { x: margin, y, size: bodySize + 3, font: bold, color: BLACK, maxWidth: contentWidth });
      y -= lineGap + 2;
      for (const value of [data.party.company, data.party.address, data.party.email, data.party.phone, data.party.taxId ? "Tax ID: " + data.party.taxId : null]) {
        if (value) drawParagraph(value, margin, contentWidth, normal, bodySize, MUTED, 2);
      }
      y -= 6;
    } else if (block === "metadata") {
      drawKeyValues(data.metadata || []);
      y -= 3;
    } else if (block === "items") {
      heading(data.kind === "customerReceipt" ? "Invoice allocations" : data.kind === "supplierPayment" ? "Bill allocations" : "Items");
      drawItems(data.items || []);
    } else if (block === "totals") {
      if ((data.totals || []).length) {
        heading("Summary");
        const totals = data.totals || [];
        const boxWidth = Math.min(300, contentWidth * 0.62);
        const x = width - margin - boxWidth;
        for (const total of totals) {
          ensure(22);
          const isStrong = !!total.strong;
          if (isStrong) page.drawRectangle({ x, y: y - 7, width: boxWidth, height: 22, color: rgb(accentTint.r, accentTint.g, accentTint.b) });
          page.drawText(safeText(total.label), { x: x + 7, y, size: bodySize, font: isStrong ? bold : normal, color: BLACK, maxWidth: boxWidth * 0.57 });
          page.drawText(safeText(total.value), { x: x + boxWidth * 0.58, y, size: bodySize, font: bold, color: BLACK, maxWidth: boxWidth * 0.38 });
          y -= 23;
        }
        y -= 8;
      }
    } else if (block === "history") {
      if ((data.history || []).length) {
        heading(data.kind === "supplierPayment" ? "Bill allocation details" : "Payment history");
        drawKeyValues(data.history || [], 2);
      }
    } else if (block === "notes") {
      if (data.notes) {
        heading("Notes");
        drawParagraph(data.notes, margin, contentWidth, italic, bodySize, MUTED, 12);
        y -= 7;
      }
    } else if (block === "custom") {
      const customText = safeText(data.customText || template.customText);
      if (customText) {
        heading(data.customHeading || template.customHeading);
        drawParagraph(customText, margin, contentWidth, normal, bodySize, MUTED, 20);
        y -= 6;
      }
    } else if (block === "signature") {
      ensure(67);
      const lineY = y - 31;
      const x = width - margin - 182;
      page.drawLine({ start: { x, y: lineY }, end: { x: width - margin, y: lineY }, thickness: 0.7, color: MUTED });
      page.drawText(safeText(template.signatureLabel), { x, y: lineY - 13, size: 7.5, font: normal, color: MUTED, maxWidth: 182 });
      y -= 58;
    } else if (block === "footer") {
      if (template.footerText) {
        ensure(40);
        page.drawLine({ start: { x: margin, y: y + 2 }, end: { x: width - margin, y: y + 2 }, thickness: 0.5, color: LIGHT });
        y -= 13;
        drawParagraph(template.footerText, margin, contentWidth, normal, Math.max(7, bodySize - 1), MUTED, 4);
      }
    }
    y -= 3;
  }

  const bytes = await pdf.save();
  return bytes;
}
