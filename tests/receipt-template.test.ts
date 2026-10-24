import { describe, expect, it } from "vitest";
import { DEFAULT_RECEIPT_TEMPLATE, normalizeReceiptTemplate } from "../lib/receipts/template";

describe("normalizeReceiptTemplate", () => {
  it("uses branded defaults when a business has no saved receipt template", () => {
    expect(normalizeReceiptTemplate(undefined)).toEqual(DEFAULT_RECEIPT_TEMPLATE);
  });

  it("preserves allowed user preferences and explicit false toggles", () => {
    expect(normalizeReceiptTemplate({
      style: "modern",
      title: "Customer Receipt",
      accentColor: "#0055aa",
      footerText: "  Paid with thanks.  ",
      signatureLabel: "",
      showAllocations: false,
      showReference: false,
      showNotes: true,
      showCustomerContact: false,
    })).toEqual({
      style: "modern",
      title: "Customer Receipt",
      accentColor: "#0055AA",
      footerText: "Paid with thanks.",
      signatureLabel: "",
      showAllocations: false,
      showReference: false,
      showNotes: true,
      showCustomerContact: false,
    });
  });

  it("falls back safely for invalid style, colour, and text", () => {
    expect(normalizeReceiptTemplate({
      style: "download",
      title: "",
      accentColor: "url(javascript:alert(1))",
      footerText: "x".repeat(600),
      signatureLabel: "y".repeat(100),
      showAllocations: "false",
    })).toEqual({
      ...DEFAULT_RECEIPT_TEMPLATE,
      footerText: "x".repeat(400),
      signatureLabel: "y".repeat(80),
    });
  });
});
