-- Add explicit reversal state to legacy payments; historical records remain posted by default.
ALTER TABLE "payments"
  ADD COLUMN "status" "ReceiptStatus" NOT NULL DEFAULT 'POSTED';

CREATE INDEX "payments_tenant_id_invoice_id_status_idx" ON "payments"("tenant_id", "invoice_id", "status");
