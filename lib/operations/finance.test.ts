import { describe, expect, it } from "vitest";
import {
  invoiceStatusFromBalance,
  outstandingBalance,
  receivableAgeBucket,
  sumPostedAllocations,
  sumPostedAmounts,
} from "./finance";

describe("finance calculation rules", () => {
  it("counts only posted legacy payments", () => {
    expect(sumPostedAmounts([
      { amount: "45.25", status: "POSTED" },
      { amount: 10, status: "REVERSED" },
      { amount: 4.75, status: "POSTED" },
    ])).toBe(50);
  });

  it("counts only allocations whose parent receipt is posted", () => {
    expect(sumPostedAllocations([
      { amount: "25.10", receipt: { status: "POSTED" } },
      { amount: "10.00", receipt: { status: "REVERSED" } },
    ])).toBe(25.1);
  });

  it("does not count a receipt twice when it is allocated over multiple invoices", () => {
    const receipt = { amount: 100, status: "POSTED" };
    const allocations = [
      { amount: 65, receipt: { status: receipt.status } },
      { amount: 35, receipt: { status: receipt.status } },
    ];
    expect(sumPostedAmounts([receipt])).toBe(100);
    expect(sumPostedAllocations(allocations)).toBe(100);
    expect(outstandingBalance(180, [], allocations)).toBe(80);
    expect(outstandingBalance(100, [], allocations)).toBe(0);
  });

  it("prevents negative balances after over-allocation or rounding noise", () => {
    expect(outstandingBalance("50.00", [{ amount: 50.01, status: "POSTED" }], [])).toBe(0);
  });

  it("derives invoice status after a payment reversal", () => {
    const today = new Date("2026-10-24T12:00:00");
    expect(invoiceStatusFromBalance({ total: 100, paid: 100, dueDate: new Date("2026-10-01"), today })).toBe("PAID");
    expect(invoiceStatusFromBalance({ total: 100, paid: 50, dueDate: new Date("2026-10-01"), today })).toBe("PARTIALLY_PAID");
    expect(invoiceStatusFromBalance({ total: 100, paid: 0, dueDate: new Date("2026-10-01"), today })).toBe("OVERDUE");
    expect(invoiceStatusFromBalance({ total: 100, paid: 0, dueDate: new Date("2026-11-01"), today })).toBe("SENT");
  });

  it("puts dues into the requested ageing bands", () => {
    const asOf = new Date("2026-10-24T12:00:00");
    expect(receivableAgeBucket(new Date("2026-10-25T00:00:00"), asOf)).toBe("NOT_DUE");
    expect(receivableAgeBucket(new Date("2026-10-17T00:00:00"), asOf)).toBe("DAYS_1_7");
    expect(receivableAgeBucket(new Date("2026-10-01T00:00:00"), asOf)).toBe("DAYS_8_30");
    expect(receivableAgeBucket(new Date("2026-09-01T00:00:00"), asOf)).toBe("DAYS_31_60");
    expect(receivableAgeBucket(new Date("2026-08-01T00:00:00"), asOf)).toBe("DAYS_60_PLUS");
  });
});
