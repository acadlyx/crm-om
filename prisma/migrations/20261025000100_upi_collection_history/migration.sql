CREATE TABLE "upi_collections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "customer_id" UUID,
  "invoice_id" UUID,
  "upi_id" VARCHAR(256) NOT NULL,
  "payer_name" VARCHAR(160),
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "transaction_ref" VARCHAR(80) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "utr" VARCHAR(160),
  "paid_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "payment_id" UUID,
  "receipt_id" UUID,
  "notes" TEXT,
  "created_by_user_id" UUID,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "upi_collections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "upi_collections_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "upi_collections_scope_check" CHECK ("customer_id" IS NOT NULL OR "invoice_id" IS NOT NULL),
  CONSTRAINT "upi_collections_status_check" CHECK ("status" IN ('PENDING', 'PAID', 'EXPIRED', 'FAILED')),
  CONSTRAINT "upi_collections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "upi_collections_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "upi_collections_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "upi_collections_tenant_id_transaction_ref_key" ON "upi_collections"("tenant_id", "transaction_ref");
CREATE UNIQUE INDEX "upi_collections_tenant_id_idempotency_key_key" ON "upi_collections"("tenant_id", "idempotency_key");
CREATE UNIQUE INDEX "upi_collections_tenant_id_utr_key" ON "upi_collections"("tenant_id", "utr");
CREATE INDEX "upi_collections_tenant_id_status_created_at_idx" ON "upi_collections"("tenant_id", "status", "created_at");
CREATE INDEX "upi_collections_tenant_id_customer_id_created_at_idx" ON "upi_collections"("tenant_id", "customer_id", "created_at");
CREATE INDEX "upi_collections_tenant_id_invoice_id_status_idx" ON "upi_collections"("tenant_id", "invoice_id", "status");
