import { describe, expect, it } from "vitest";
import { isMissingUpiCollectionTable, UPI_SCHEMA_NOT_READY_MESSAGE } from "@/lib/operations/upi-schema-error";

describe("UPI collection schema diagnostics", () => {
  it("identifies Prisma missing-table errors for the UPI collection table", () => {
    expect(isMissingUpiCollectionTable({ code: "P2021", meta: { table: "public.upi_collections" } })).toBe(true);
    expect(isMissingUpiCollectionTable({ code: "P2021", message: "The table public.upi_collections does not exist" })).toBe(true);
  });

  it("does not misclassify unrelated missing tables or other database errors", () => {
    expect(isMissingUpiCollectionTable({ code: "P2021", meta: { table: "public.invoices" } })).toBe(false);
    expect(isMissingUpiCollectionTable({ code: "P2002", message: "unique constraint" })).toBe(false);
    expect(isMissingUpiCollectionTable(null)).toBe(false);
  });

  it("gives administrators an actionable initialization message", () => {
    expect(UPI_SCHEMA_NOT_READY_MESSAGE).toMatch(/platform administrator/i);
    expect(UPI_SCHEMA_NOT_READY_MESSAGE).toMatch(/migration/i);
  });
});
