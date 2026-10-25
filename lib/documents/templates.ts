export const DOCUMENT_KINDS = ["invoice", "customerReceipt", "supplierBill", "supplierPayment"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_BLOCKS = [
  { key: "business", label: "Business identity", description: "Logo, business name and contact details" },
  { key: "title", label: "Document heading", description: "Title, number and status" },
  { key: "party", label: "Customer / supplier", description: "Who the document is for" },
  { key: "metadata", label: "Dates and references", description: "Issue date, due date and related references" },
  { key: "items", label: "Items / allocations", description: "Line items or payment allocations" },
  { key: "totals", label: "Totals and balance", description: "Amounts, paid balance and amount due" },
  { key: "history", label: "Payment history", description: "Linked payments or allocations" },
  { key: "notes", label: "Notes", description: "Record notes" },
  { key: "custom", label: "Custom text block", description: "A custom heading and message of your choice" },
  { key: "signature", label: "Signature area", description: "Authorisation / signature line" },
  { key: "footer", label: "Footer", description: "A custom footer printed on the document" },
] as const;
export type DocumentBlockKey = (typeof DOCUMENT_BLOCKS)[number]["key"];

export type DocumentTemplate = {
  title: string;
  accentColor: string;
  paperSize: "A4" | "LETTER";
  orientation: "portrait" | "landscape";
  headerStyle: "band" | "rule" | "plain";
  fontFamily: "Helvetica" | "TimesRoman" | "Courier";
  fontSize: number;
  titleSize: number;
  logoSize: number;
  logoPosition: "left" | "center" | "right";
  showLogo: boolean;
  showStatus: boolean;
  blockOrder: DocumentBlockKey[];
  hiddenBlocks: DocumentBlockKey[];
  signatureLabel: string;
  footerText: string;
  customHeading: string;
  customText: string;
};

export type DocumentTemplates = Record<DocumentKind, DocumentTemplate>;

const BLOCK_KEYS = DOCUMENT_BLOCKS.map((block) => block.key) as DocumentBlockKey[];
const DEFAULTS: Record<DocumentKind, Omit<DocumentTemplate, "blockOrder" | "hiddenBlocks"> & { blockOrder: DocumentBlockKey[]; hiddenBlocks: DocumentBlockKey[] }> = {
  invoice: {
    title: "Tax Invoice", accentColor: "#176B4D", paperSize: "A4", orientation: "portrait",
    headerStyle: "band", fontFamily: "Helvetica", fontSize: 9, titleSize: 25, logoSize: 64, logoPosition: "left",
    showLogo: true, showStatus: true,
    blockOrder: ["business", "title", "party", "metadata", "items", "totals", "history", "notes", "custom", "signature", "footer"],
    hiddenBlocks: ["custom"], signatureLabel: "Authorised signature",
    footerText: "Thank you for your business.", customHeading: "Additional information", customText: "",
  },
  customerReceipt: {
    title: "Payment Receipt", accentColor: "#176B4D", paperSize: "A4", orientation: "portrait",
    headerStyle: "rule", fontFamily: "TimesRoman", fontSize: 9, titleSize: 24, logoSize: 58, logoPosition: "left",
    showLogo: true, showStatus: true,
    blockOrder: ["business", "title", "party", "metadata", "totals", "items", "history", "notes", "custom", "signature", "footer"],
    hiddenBlocks: ["custom"], signatureLabel: "Received / authorised by",
    footerText: "Thank you for your payment.", customHeading: "Additional information", customText: "",
  },
  supplierBill: {
    title: "Supplier Bill", accentColor: "#315FC9", paperSize: "A4", orientation: "portrait",
    headerStyle: "band", fontFamily: "Helvetica", fontSize: 9, titleSize: 24, logoSize: 64, logoPosition: "left",
    showLogo: true, showStatus: true,
    blockOrder: ["business", "title", "party", "metadata", "items", "totals", "history", "notes", "custom", "signature", "footer"],
    hiddenBlocks: ["custom", "signature"], signatureLabel: "Authorised signature",
    footerText: "Please retain this document for your records.", customHeading: "Additional information", customText: "",
  },
  supplierPayment: {
    title: "Supplier Payment Voucher", accentColor: "#315FC9", paperSize: "A4", orientation: "portrait",
    headerStyle: "rule", fontFamily: "TimesRoman", fontSize: 9, titleSize: 24, logoSize: 58, logoPosition: "left",
    showLogo: true, showStatus: true,
    blockOrder: ["business", "title", "party", "metadata", "totals", "items", "history", "notes", "custom", "signature", "footer"],
    hiddenBlocks: ["custom"], signatureLabel: "Authorised by",
    footerText: "Generated for your accounting records.", customHeading: "Additional information", customText: "",
  },
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function safeText(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}
function safeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : fallback;
}
function safeBlocks(value: unknown, fallback: DocumentBlockKey[], allowEmpty = false): DocumentBlockKey[] {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<DocumentBlockKey>();
  const items: DocumentBlockKey[] = [];
  for (const item of value) {
    if (typeof item === "string" && BLOCK_KEYS.includes(item as DocumentBlockKey) && !seen.has(item as DocumentBlockKey)) {
      seen.add(item as DocumentBlockKey);
      items.push(item as DocumentBlockKey);
    }
  }
  if (allowEmpty) return items;
  if (items.length === 0) return [...fallback];
  return [...items, ...fallback.filter((key) => !seen.has(key))];
}

export function defaultDocumentTemplate(kind: DocumentKind): DocumentTemplate {
  return { ...DEFAULTS[kind], blockOrder: [...DEFAULTS[kind].blockOrder], hiddenBlocks: [...DEFAULTS[kind].hiddenBlocks] };
}

export function normalizeDocumentTemplate(kind: DocumentKind, value: unknown): DocumentTemplate {
  const fallback = DEFAULTS[kind];
  const input = objectValue(value);
  const orientation = input.orientation === "landscape" ? "landscape" : "portrait";
  const headerStyle = input.headerStyle === "rule" || input.headerStyle === "plain" ? input.headerStyle : "band";
  const logoPosition = input.logoPosition === "center" || input.logoPosition === "right" ? input.logoPosition : "left";
  const paperSize = input.paperSize === "LETTER" ? "LETTER" : "A4";
  const fontFamily = input.fontFamily === "TimesRoman" || input.fontFamily === "Courier" ? input.fontFamily : "Helvetica";
  const accentColor = typeof input.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(input.accentColor)
    ? input.accentColor.toUpperCase() : fallback.accentColor;
  const blockOrder = safeBlocks(input.blockOrder, fallback.blockOrder);
  const hiddenBlocks = safeBlocks(input.hiddenBlocks, fallback.hiddenBlocks, true);
  return {
    title: safeText(input.title, fallback.title, 80) || fallback.title,
    accentColor, paperSize, orientation, headerStyle, fontFamily,
    fontSize: safeInteger(input.fontSize, fallback.fontSize, 7, 13),
    titleSize: safeInteger(input.titleSize, fallback.titleSize, 16, 34),
    logoSize: safeInteger(input.logoSize, fallback.logoSize, 28, 104),
    logoPosition,
    showLogo: typeof input.showLogo === "boolean" ? input.showLogo : fallback.showLogo,
    showStatus: typeof input.showStatus === "boolean" ? input.showStatus : fallback.showStatus,
    blockOrder, hiddenBlocks,
    signatureLabel: safeText(input.signatureLabel, fallback.signatureLabel, 100),
    footerText: safeText(input.footerText, fallback.footerText, 500),
    customHeading: safeText(input.customHeading, fallback.customHeading, 80),
    customText: safeText(input.customText, fallback.customText, 1200),
  };
}

export function normalizeDocumentTemplates(value: unknown): DocumentTemplates {
  const input = objectValue(value);
  return {
    invoice: normalizeDocumentTemplate("invoice", input.invoice),
    customerReceipt: normalizeDocumentTemplate("customerReceipt", input.customerReceipt),
    supplierBill: normalizeDocumentTemplate("supplierBill", input.supplierBill),
    supplierPayment: normalizeDocumentTemplate("supplierPayment", input.supplierPayment),
  };
}
