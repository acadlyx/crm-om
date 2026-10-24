export type AmountRecord = { amount: unknown; status?: string };
export type ReceiptAllocationRecord = { amount: unknown; receipt: { status: string } };

export function numericAmount(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sumPostedAmounts(records: AmountRecord[]): number {
  return roundMoney(records
    .filter((record) => record.status === "POSTED")
    .reduce((sum, record) => sum + numericAmount(record.amount), 0));
}

export function sumPostedAllocations(records: ReceiptAllocationRecord[]): number {
  return roundMoney(records
    .filter((record) => record.receipt.status === "POSTED")
    .reduce((sum, record) => sum + numericAmount(record.amount), 0));
}

export function outstandingBalance(
  total: unknown,
  payments: AmountRecord[],
  receiptAllocations: ReceiptAllocationRecord[],
): number {
  return roundMoney(Math.max(
    0,
    numericAmount(total) - sumPostedAmounts(payments) - sumPostedAllocations(receiptAllocations),
  ));
}

export function invoiceStatusFromBalance(args: {
  total: unknown;
  paid: unknown;
  dueDate: Date;
  today?: Date;
  wasDraft?: boolean;
}): "PAID" | "PARTIALLY_PAID" | "DRAFT" | "OVERDUE" | "SENT" {
  const total = numericAmount(args.total);
  const paid = numericAmount(args.paid);
  if (paid + 0.005 >= total) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";
  if (args.wasDraft) return "DRAFT";
  const today = args.today ?? new Date();
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  return args.dueDate < startOfToday ? "OVERDUE" : "SENT";
}

export function receivableAgeBucket(dueDate: Date, asOf = new Date()): "NOT_DUE" | "DAYS_1_7" | "DAYS_8_30" | "DAYS_31_60" | "DAYS_60_PLUS" {
  const day = new Date(asOf);
  day.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const days = Math.floor((day.getTime() - due.getTime()) / 86400000);
  if (days <= 0) return "NOT_DUE";
  if (days <= 7) return "DAYS_1_7";
  if (days <= 30) return "DAYS_8_30";
  if (days <= 60) return "DAYS_31_60";
  return "DAYS_60_PLUS";
}
