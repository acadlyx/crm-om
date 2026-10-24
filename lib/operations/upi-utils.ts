export type UpiUriInput = {
  upiId: string;
  businessName: string;
  amount: number;
  transactionRef: string;
  payerName?: string | null;
  invoiceNumber?: string | null;
};

export function buildUpiUri(input: UpiUriInput): string {
  const params = new URLSearchParams();
  params.set("pa", input.upiId);
  params.set("pn", input.businessName.slice(0, 60));
  params.set("am", input.amount.toFixed(2));
  params.set("cu", "INR");
  params.set("tr", input.transactionRef);
  params.set("tn", (input.invoiceNumber ? "Invoice " + input.invoiceNumber : "Business payment") + " " + input.transactionRef);
  return "upi://pay?" + params.toString();
}

export function parseStatementCsv(source: string, maxDataRows = 500): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      if (rows.length > maxDataRows + 1) {
        throw new Error("Statement CSV exceeds the 500-transaction import limit. Split it into smaller files.");
      }
    } else {
      cell += ch;
    }
  }

  if (quoted) throw new Error("Statement CSV has an unclosed quoted field.");
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some((value) => value !== "")) rows.push(row);
  }
  if (rows.length > maxDataRows + 1) {
    throw new Error("Statement CSV exceeds the 500-transaction import limit. Split it into smaller files.");
  }
  return rows;
}

export function normalizeStatementHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findStatementColumn(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(normalizeStatementHeader(header)));
}

export function invoiceOutstandingBalance(item: Record<string, unknown>): number {
  const payments = Array.isArray(item.payments) ? item.payments as Array<Record<string, unknown>> : [];
  const allocations = Array.isArray(item.receiptAllocations) ? item.receiptAllocations as Array<Record<string, unknown>> : [];
  const paidFromPayments = payments.filter((payment) => payment.status === "POSTED")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const paidFromAllocations = allocations.filter((allocation) => {
    const receipt = allocation.receipt && typeof allocation.receipt === "object"
      ? allocation.receipt as Record<string, unknown>
      : {};
    return receipt.status === "POSTED";
  }).reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0);
  return Math.max(0, Number(item.total || 0) - paidFromPayments - paidFromAllocations);
}

export function safeUpiFilename(value: string): string {
  const safe = value.replace(/[\\/\\\\\\s]+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/\\.{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return safe || "upi-qr";
}
