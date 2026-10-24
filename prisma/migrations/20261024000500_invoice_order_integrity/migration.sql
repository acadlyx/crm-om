-- Preserve invoice discounts and guarantee one invoice per sales order.
ALTER TABLE "invoices"
  ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "invoices_discount_amount_nonnegative_check" CHECK ("discount_amount" >= 0);

CREATE UNIQUE INDEX "invoices_tenant_id_sales_order_id_key" ON "invoices"("tenant_id", "sales_order_id");
