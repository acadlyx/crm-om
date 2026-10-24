import { describe, expect, it } from "vitest";
import {
  buildUpiUri,
  findStatementColumn,
  invoiceOutstandingBalance,
  parseStatementCsv,
  safeUpiFilename,
} from "../lib/operations/upi-utils";

describe("buildUpiUri", () => {
  it("encodes a fixed INR amount and reconcilable transaction reference", () => {
    const uri = buildUpiUri({
      upiId: "billing.team@bank",
      businessName: "A & B Traders",
      amount: 1234.5,
      transactionRef: "AYZABC123",
      invoiceNumber: "INV 2026/014",
    });
    expect(uri.startsWith("upi://pay?")).toBe(true);
    const params = new URLSearchParams(uri.slice(uri.indexOf("?") + 1));
    expect(params.get("pa")).toBe("billing.team@bank");
    expect(params.get("pn")).toBe("A & B Traders");
    expect(params.get("am")).toBe("1234.50");
    expect(params.get("cu")).toBe("INR");
    expect(params.get("tr")).toBe("AYZABC123");
    expect(params.get("tn")).toBe("Invoice INV 2026/014 AYZABC123");
  });
});

describe("parseStatementCsv", () => {
  it("handles quoted commas, escaped quotes and Windows line endings", () => {
    const csv = [
      "Transaction Ref,UPI Ref No.,Amount,Remarks",
      'AYZ001,UTR0001,250.00,"paid, online"',
      'AYZ002,UTR0002,10.50,"memo ""hello"""',
    ].join("\r\n");
    expect(parseStatementCsv(csv)).toEqual([
      ["Transaction Ref", "UPI Ref No.", "Amount", "Remarks"],
      ["AYZ001", "UTR0001", "250.00", "paid, online"],
      ["AYZ002", "UTR0002", "10.50", 'memo "hello"'],
    ]);
  });

  it("rejects malformed quoted values and oversized imports", () => {
    expect(() => parseStatementCsv('Ref,UTR,Amount\nA,1,10\n"B,2,30')).toThrow(/unclosed quoted field/i);
    expect(() => parseStatementCsv("Ref,UTR,Amount\nA,1,10\nB,2,20", 1)).toThrow(/500-transaction import limit/i);
  });

  it("matches common bank statement header variants", () => {
    const headers = ["Transaction Remarks", "UPI Ref No.", "Credit"];
    expect(findStatementColumn(headers, ["transactionref", "remarks"])).toBe(0);
    expect(findStatementColumn(headers, ["utr", "upirefno", "rrn"])).toBe(1);
    expect(findStatementColumn(headers, ["amount", "credit"])).toBe(2);
  });
});

describe("invoiceOutstandingBalance", () => {
  it("subtracts only posted invoice payments and allocations to posted receipts", () => {
    expect(invoiceOutstandingBalance({
      total: 1000,
      payments: [
        { amount: 200, status: "POSTED" },
        { amount: 70, status: "PENDING" },
      ],
      receiptAllocations: [
        { amount: 300, receipt: { status: "POSTED" } },
        { amount: 100, receipt: { status: "REVERSED" } },
      ],
    })).toBe(500);
  });

  it("never reports a negative outstanding balance", () => {
    expect(invoiceOutstandingBalance({
      total: 100,
      payments: [{ amount: 125, status: "POSTED" }],
      receiptAllocations: [],
    })).toBe(0);
  });
});

describe("safeUpiFilename", () => {
  it("removes path separators and unsafe characters", () => {
    expect(safeUpiFilename("../INV/2026 01")).toBe("INV-2026-01");
    expect(safeUpiFilename("***")).toBe("upi-qr");
  });
});
