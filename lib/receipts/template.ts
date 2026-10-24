export type ReceiptTemplateStyle = "classic" | "modern" | "minimal";

export type ReceiptTemplate = {
  style: ReceiptTemplateStyle;
  title: string;
  accentColor: string;
  footerText: string;
  signatureLabel: string;
  showAllocations: boolean;
  showReference: boolean;
  showNotes: boolean;
  showCustomerContact: boolean;
};

export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplate = {
  style: "classic",
  title: "Payment Receipt",
  accentColor: "#176B4D",
  footerText: "Thank you for your business.",
  signatureLabel: "Authorized signature",
  showAllocations: true,
  showReference: true,
  showNotes: true,
  showCustomerContact: true,
};

export function normalizeReceiptTemplate(value: unknown): ReceiptTemplate {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const style = input.style === "modern" || input.style === "minimal" ? input.style : "classic";
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 70) : "";
  const color = typeof input.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(input.accentColor)
    ? input.accentColor.toUpperCase()
    : DEFAULT_RECEIPT_TEMPLATE.accentColor;
  const footerText = typeof input.footerText === "string" ? input.footerText.trim().slice(0, 400) : "";
  const signatureLabel = typeof input.signatureLabel === "string" ? input.signatureLabel.trim().slice(0, 80) : "";
  const bool = (key: keyof Pick<ReceiptTemplate, "showAllocations" | "showReference" | "showNotes" | "showCustomerContact">) =>
    typeof input[key] === "boolean" ? input[key] as boolean : DEFAULT_RECEIPT_TEMPLATE[key];

  return {
    style,
    title: title || DEFAULT_RECEIPT_TEMPLATE.title,
    accentColor: color,
    footerText,
    signatureLabel,
    showAllocations: bool("showAllocations"),
    showReference: bool("showReference"),
    showNotes: bool("showNotes"),
    showCustomerContact: bool("showCustomerContact"),
  };
}
