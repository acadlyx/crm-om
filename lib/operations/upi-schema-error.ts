/** True only for Prisma's missing-table error on UPI collection history. */
export function isMissingUpiCollectionTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { table?: unknown }; message?: unknown };
  if (candidate.code !== "P2021") return false;
  const table = typeof candidate.meta?.table === "string" ? candidate.meta.table : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return /upi_collections/i.test(table || message);
}

export const UPI_SCHEMA_NOT_READY_MESSAGE =
  "UPI collection storage is not initialized. Ask your platform administrator to apply the pending UPI history migration.";
