-- Enforce idempotent retries for legacy invoice payments.
ALTER TABLE "payments"
  ADD COLUMN "idempotency_key" VARCHAR(160);

CREATE UNIQUE INDEX "payments_tenant_id_idempotency_key_key"
  ON "payments"("tenant_id", "idempotency_key");
