import { describe, expect, it } from "vitest";
import {
  DOCUMENT_BLOCKS, DOCUMENT_KINDS, defaultDocumentTemplate,
  normalizeDocumentTemplate, normalizeDocumentTemplates,
} from "@/lib/documents/templates";

describe("document templates", () => {
  it("provides independent branded defaults for every printable document", () => {
    const templates = normalizeDocumentTemplates(undefined);
    expect(Object.keys(templates)).toEqual(DOCUMENT_KINDS);
    expect(templates.invoice.title).toBe("Tax Invoice");
    expect(templates.customerReceipt.title).toBe("Payment Receipt");
    expect(templates.supplierBill.title).toBe("Supplier Bill");
    expect(templates.supplierPayment.title).toBe("Supplier Payment Voucher");
    expect(templates.invoice).not.toBe(templates.customerReceipt);
  });

  it("preserves drag-and-drop order and explicit hidden block choices", () => {
    const defaults = defaultDocumentTemplate("invoice");
    const custom = normalizeDocumentTemplate("invoice", {
      ...defaults,
      blockOrder: ["title", "business", "items"],
      hiddenBlocks: ["history", "custom"],
      showLogo: false,
      logoPosition: "right",
    });
    expect(custom.blockOrder.slice(0, 3)).toEqual(["title", "business", "items"]);
    expect(custom.blockOrder).toHaveLength(DOCUMENT_BLOCKS.length);
    expect(custom.hiddenBlocks).toEqual(["history", "custom"]);
    expect(custom.showLogo).toBe(false);
    expect(custom.logoPosition).toBe("right");
  });

  it("sanitizes bad input while keeping size, color and text values within bounds", () => {
    const normalized = normalizeDocumentTemplate("supplierBill", {
      title: "  " + "B".repeat(120),
      accentColor: "url(javascript:alert(1))",
      fontSize: 90,
      titleSize: 2,
      logoSize: 500,
      paperSize: "LEGAL",
      orientation: "sideways",
      blockOrder: ["totals", "totals", "unsupported"],
      hiddenBlocks: ["not-a-block"],
      footerText: "F".repeat(800),
    });
    expect(normalized.title).toHaveLength(80);
    expect(normalized.accentColor).toBe("#315FC9");
    expect(normalized.fontSize).toBe(13);
    expect(normalized.titleSize).toBe(16);
    expect(normalized.logoSize).toBe(104);
    expect(normalized.paperSize).toBe("A4");
    expect(normalized.orientation).toBe("portrait");
    expect(new Set(normalized.blockOrder).size).toBe(DOCUMENT_BLOCKS.length);
    expect(normalized.blockOrder[0]).toBe("totals");
    expect(normalized.hiddenBlocks).toEqual([]);
    expect(normalized.footerText).toHaveLength(500);
  });
});
