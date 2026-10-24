import { describe, expect, it } from "vitest";
import {
  invoiceStatusFromBalance,
  numericAmount,
  outstandingBalance,
  receivableAgeBucket,
  roundMoney,
  sumPostedAllocations,
  sumPostedAmounts,
} from "@/lib/operations/finance";

describe("posted financial calculations", () => {
  it("normalizes invalid numeric inputs and rounds money to cents", () => {
    expect(numericAmount(null)).toBe(0);
    expect(numericAmount("not-a-number")).toBe(0);
    expect(roundMoney(10.125)).toBe(10.13);
    expect(roundMoney(10.1)).toBe(10.1);
  });

  it("counts only posted payments, excluding reversals", () => {
    expect(sumPostedAmounts([
      { amount: "40.25", status: "POSTED" },
      { amount: "10.00", status: "REVERSED" },
      { amount: "9.75", status: "POSTED" },
    ])).toBe(50);
  });

  it("uses posted receipt allocations for each invoice balance, not full receipt amounts", () => {
    const allocations = [
      { amount: "60.00", receipt: { status: "POSTED" } },
      { amount: "25.00", receipt: { status: "POSTED" } },
      { amount: "50.00", receipt: { status: "REVERSED" } },
    ];
    expect(sumPostedAllocations(allocations)).toBe(85);
    expect(outstandingBalance("200.00", [], allocations)).toBe(115);
  });

  it("combines legacy payments and receipt allocations without counting reversed transactions", () => {
    expect(outstandingBalance("300.00", [
      { amount: "70.00", status: "POSTED" },
      { amount: "30.00", status: "REVERSED" },
    ], [
      { amount: "100.00", receipt: { status: "POSTED" } },
      { amount: "50.00", receipt: { status: "REVERSED" } },
    ])).toBe(130);
  });

  it("never returns a negative receivable and preserves cent precision", () => {
    expect(outstandingBalance("100.00", [{ amount: "120.00", status: "POSTED" }], [])).toBe(0);
    expect(outstandingBalance("100.00", [{ amount: "40.10", status: "POSTED" }], [
      { amount: "10.20", receipt: { status: "POSTED" } },
    ])).toBe(49.7);
  });
});

describe("invoice state and ageing boundaries", () => {
  const today = new Date("2026-10-25T12:00:00");
  const dueTomorrow = new Date("2026-10-26T00:00:00");
  const dueYesterday = new Date("2026-10-24T00:00:00");

  it("derives paid, partial, overdue, sent, and draft statuses from reconciled balances", () => {
    expect(invoiceStatusFromBalance({ total: 100, paid: 100, dueDate: dueYesterday, today })).toBe("PAID");
    expect(invoiceStatusFromBalance({ total: 100, paid: 20, dueDate: dueYesterday, today })).toBe("PARTIALLY_PAID");
    expect(invoiceStatusFromBalance({ total: 100, paid: 0, dueDate: dueYesterday, today })).toBe("OVERDUE");
    expect(invoiceStatusFromBalance({ total: 100, paid: 0, dueDate: dueTomorrow, today })).toBe("SENT");
    expect(invoiceStatusFromBalance({ total: 100, paid: 0, dueDate: dueYesterday, today, wasDraft: true })).toBe("DRAFT");
  });

  it("classifies ageing at each requested boundary", () => {
    const dueDaysAgo = (days: number) => new Date("2026-10-25T00:00:00").getTime() - days * 86400000;
    expect(receivableAgeBucket(new Date(dueDaysAgo(0)), today)).toBe("NOT_DUE");
    expect(receivableAgeBucket(new Date(dueDaysAgo(1)), today)).toBe("DAYS_1_7");
    expect(receivableAgeBucket(new Date(dueDaysAgo(7)), today)).toBe("DAYS_1_7");
    expect(receivableAgeBucket(new Date(dueDaysAgo(8)), today)).toBe("DAYS_8_30");
    expect(receivableAgeBucket(new Date(dueDaysAgo(30)), today)).toBe("DAYS_8_30");
    expect(receivableAgeBucket(new Date(dueDaysAgo(31)), today)).toBe("DAYS_31_60");
    expect(receivableAgeBucket(new Date(dueDaysAgo(60)), today)).toBe("DAYS_31_60");
    expect(receivableAgeBucket(new Date(dueDaysAgo(61)), today)).toBe("DAYS_60_PLUS");
  });
});
