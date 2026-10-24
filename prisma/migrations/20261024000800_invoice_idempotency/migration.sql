-- Prevent duplicate direct invoices when a request is retried after a timeout.
ALTER TABLE "invoices"
  ADD COLUMN "idempotency_key" VARCHAR(160);

CREATE UNIQUE INDEX "invoices_tenant_id_idempotency_key_key"
  ON "invoices"("tenant_id", "idempotency_key");
