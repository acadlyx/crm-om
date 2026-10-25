import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { defaultDocumentTemplate } from "@/lib/documents/templates";
import { renderDocumentPdf, type DocumentPDFData } from "@/lib/documents/pdf-renderer";

const sample: DocumentPDFData = {
  kind: "invoice",
  number: "INV-TEST-0042",
  status: "PARTIALLY_PAID",
  currency: "INR",
  business: { name: "Northstar Studio", address: "14 Market Road, New Delhi", email: "accounts@example.test", phone: "+91 98765 43210" },
  party: { label: "Bill to", name: "Meridian Supplies", company: "Meridian Supplies Pvt Ltd", email: "finance@example.test", address: "Mumbai, India" },
  metadata: [{ label: "Issue date", value: "24 Oct 2026" }, { label: "Due date", value: "08 Nov 2026" }],
  items: [
    { description: "Design services", quantity: "2", unitPrice: "INR 10,000.00", discount: "INR 0.00", tax: "INR 3,600.00", total: "INR 23,600.00" },
  ],
  totals: [{ label: "Invoice total", value: "INR 23,600.00", strong: true }, { label: "Balance due", value: "INR 11,100.00", strong: true }],
  history: [{ label: "Payment · 24 Oct 2026 · UPI", value: "INR 12,500.00" }],
  notes: "Thank you for your business.",
};

describe("renderDocumentPdf", () => {
  it("returns a valid PDF with the expected title and A4 portrait dimensions", async () => {
    const bytes = await renderDocumentPdf(sample, defaultDocumentTemplate("invoice"));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toContain("INV-TEST-0042");
    expect(pdf.getPage(0).getWidth()).toBeLessThan(pdf.getPage(0).getHeight());
  });

  it("respects landscape letter page setup and paginates long item lists", async () => {
    const template = { ...defaultDocumentTemplate("invoice"), paperSize: "LETTER" as const, orientation: "landscape" as const };
    const items = Array.from({ length: 70 }, (_, index) => ({
      description: "Service item " + (index + 1) + " with a moderately long description for wrapping",
      quantity: "1", unitPrice: "INR 100.00", total: "INR 100.00",
    }));
    const bytes = await renderDocumentPdf({ ...sample, items }, template);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
