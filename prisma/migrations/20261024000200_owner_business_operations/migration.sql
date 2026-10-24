-- Additive business operations schema. Existing CRM tables and records are preserved.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SALES';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DELIVERY';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COLLECTIONS';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'INVENTORY_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';

CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT','CONFIRMED','PARTIALLY_DELIVERED','DELIVERED','CANCELLED');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT','ORDERED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING','DISPATCHED','PARTIALLY_DELIVERED','DELIVERED','FAILED','CANCELLED');
CREATE TYPE "ReceiptStatus" AS ENUM ('DRAFT','POSTED','REVERSED');
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING_STOCK','PURCHASE_RECEIPT','SALE_ISSUE','SALE_RETURN','PURCHASE_RETURN','ADJUSTMENT_IN','ADJUSTMENT_OUT','DAMAGE','LOSS');
CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN','COMPLETED','CANCELLED');

ALTER TABLE "business_settings"
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  ADD COLUMN "timezone" VARCHAR(80) NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN "financial_year_start_month" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "inventory_costing_method" VARCHAR(32) NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
  ADD COLUMN "default_payment_terms_days" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "customers"
  ADD COLUMN "addresses" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "credit_limit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "payment_terms_days" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "suppliers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "company" VARCHAR(160),
  "email" VARCHAR(320),
  "phone" VARCHAR(40),
  "address" TEXT,
  "tax_id" VARCHAR(80),
  "payment_terms_days" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "suppliers_tenant_id_name_idx" ON "suppliers"("tenant_id","name");
CREATE INDEX "suppliers_tenant_id_status_idx" ON "suppliers"("tenant_id","status");

CREATE TABLE "products" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "category" VARCHAR(120),
  "unit" VARCHAR(24) NOT NULL DEFAULT 'pcs',
  "description" TEXT,
  "purchase_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "selling_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "stock_on_hand" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "reorder_level" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "products_tenant_sku_key" UNIQUE ("tenant_id","sku"),
  CONSTRAINT "products_nonnegative_stock_check" CHECK ("stock_on_hand" >= 0),
  CONSTRAINT "products_nonnegative_prices_check" CHECK ("purchase_cost" >= 0 AND "selling_price" >= 0 AND "reorder_level" >= 0)
);
CREATE INDEX "products_tenant_id_name_idx" ON "products"("tenant_id","name");
CREATE INDEX "products_tenant_id_stock_on_hand_idx" ON "products"("tenant_id","stock_on_hand");

CREATE TABLE "inventory_movements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "movement_type" "InventoryMovementType" NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unit_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "reference_type" VARCHAR(64),
  "reference_id" UUID,
  "idempotency_key" VARCHAR(160),
  "notes" TEXT,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_movements_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "inventory_movements_unit_cost_nonnegative_check" CHECK ("unit_cost" >= 0)
);
CREATE UNIQUE INDEX "inventory_movements_tenant_id_idempotency_key_key" ON "inventory_movements"("tenant_id","idempotency_key");
CREATE INDEX "inventory_movements_tenant_product_created_idx" ON "inventory_movements"("tenant_id","product_id","created_at");
CREATE INDEX "inventory_movements_reference_idx" ON "inventory_movements"("tenant_id","reference_type","reference_id");

CREATE TABLE "sales_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "order_number" VARCHAR(48) NOT NULL,
  "customer_id" UUID NOT NULL,
  "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "order_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expected_delivery_at" TIMESTAMPTZ(6),
  "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "idempotency_key" VARCHAR(160),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_orders_tenant_order_number_key" UNIQUE ("tenant_id","order_number"),
  CONSTRAINT "sales_orders_totals_nonnegative_check" CHECK ("subtotal" >= 0 AND "discount_amount" >= 0 AND "tax_amount" >= 0 AND "total" >= 0)
);
CREATE UNIQUE INDEX "sales_orders_tenant_id_idempotency_key_key" ON "sales_orders"("tenant_id","idempotency_key");
CREATE INDEX "sales_orders_tenant_status_date_idx" ON "sales_orders"("tenant_id","status","order_date");
CREATE INDEX "sales_orders_tenant_customer_date_idx" ON "sales_orders"("tenant_id","customer_id","order_date");

CREATE TABLE "sales_order_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "description" VARCHAR(240),
  "quantity" DECIMAL(14,3) NOT NULL,
  "delivered_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "unit_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "line_total" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sales_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_order_items_quantities_check" CHECK ("quantity" > 0 AND "delivered_quantity" >= 0 AND "delivered_quantity" <= "quantity"),
  CONSTRAINT "sales_order_items_amounts_check" CHECK ("unit_price" >= 0 AND "unit_cost" >= 0 AND "line_total" >= 0)
);
CREATE INDEX "sales_order_items_order_id_idx" ON "sales_order_items"("order_id");
CREATE INDEX "sales_order_items_product_id_idx" ON "sales_order_items"("product_id");

CREATE TABLE "invoice_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id" UUID NOT NULL,
  "product_id" UUID,
  "description" VARCHAR(240) NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "line_total" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "invoice_items_amounts_check" CHECK ("quantity" > 0 AND "unit_price" >= 0 AND "tax_amount" >= 0 AND "line_total" >= 0)
);
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");
CREATE INDEX "invoice_items_product_id_idx" ON "invoice_items"("product_id");

CREATE TABLE "purchase_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "order_number" VARCHAR(48) NOT NULL,
  "supplier_id" UUID NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "order_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expected_at" DATE,
  "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "idempotency_key" VARCHAR(160),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_orders_tenant_order_number_key" UNIQUE ("tenant_id","order_number"),
  CONSTRAINT "purchase_orders_totals_nonnegative_check" CHECK ("subtotal" >= 0 AND "tax_amount" >= 0 AND "total" >= 0)
);
CREATE UNIQUE INDEX "purchase_orders_tenant_id_idempotency_key_key" ON "purchase_orders"("tenant_id","idempotency_key");
CREATE INDEX "purchase_orders_tenant_status_date_idx" ON "purchase_orders"("tenant_id","status","order_date");
CREATE INDEX "purchase_orders_tenant_supplier_date_idx" ON "purchase_orders"("tenant_id","supplier_id","order_date");

CREATE TABLE "purchase_order_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "received_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(12,2) NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_order_items_quantities_check" CHECK ("quantity" > 0 AND "received_quantity" >= 0 AND "received_quantity" <= "quantity"),
  CONSTRAINT "purchase_order_items_amounts_check" CHECK ("unit_cost" >= 0 AND "line_total" >= 0)
);
CREATE INDEX "purchase_order_items_order_id_idx" ON "purchase_order_items"("order_id");
CREATE INDEX "purchase_order_items_product_id_idx" ON "purchase_order_items"("product_id");

CREATE TABLE "goods_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "receipt_number" VARCHAR(48) NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "status" "ReceiptStatus" NOT NULL DEFAULT 'POSTED',
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotency_key" VARCHAR(160),
  "notes" TEXT,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goods_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "goods_receipts_tenant_receipt_number_key" UNIQUE ("tenant_id","receipt_number")
);
CREATE UNIQUE INDEX "goods_receipts_tenant_id_idempotency_key_key" ON "goods_receipts"("tenant_id","idempotency_key");
CREATE INDEX "goods_receipts_tenant_received_at_idx" ON "goods_receipts"("tenant_id","received_at");

CREATE TABLE "goods_receipt_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "receipt_id" UUID NOT NULL,
  "purchase_order_item_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unit_cost" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goods_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "goods_receipt_items_po_item_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "goods_receipt_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "goods_receipt_items_quantity_positive_check" CHECK ("quantity" > 0 AND "unit_cost" >= 0)
);
CREATE INDEX "goods_receipt_items_receipt_id_idx" ON "goods_receipt_items"("receipt_id");
CREATE INDEX "goods_receipt_items_product_id_idx" ON "goods_receipt_items"("product_id");

CREATE TABLE "deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "delivery_number" VARCHAR(48) NOT NULL,
  "order_id" UUID NOT NULL,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "scheduled_at" TIMESTAMPTZ(6),
  "dispatched_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "assigned_user_id" UUID,
  "proof_of_delivery" VARCHAR(2048),
  "failure_reason" TEXT,
  "idempotency_key" VARCHAR(160),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "deliveries_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "deliveries_tenant_delivery_number_key" UNIQUE ("tenant_id","delivery_number")
);
CREATE UNIQUE INDEX "deliveries_tenant_id_idempotency_key_key" ON "deliveries"("tenant_id","idempotency_key");
CREATE INDEX "deliveries_tenant_status_scheduled_idx" ON "deliveries"("tenant_id","status","scheduled_at");
CREATE INDEX "deliveries_tenant_assigned_status_idx" ON "deliveries"("tenant_id","assigned_user_id","status");

CREATE TABLE "delivery_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "delivery_id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_items_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "delivery_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "sales_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "delivery_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "delivery_items_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "delivery_items_delivery_order_item_key" UNIQUE ("delivery_id","order_item_id")
);
CREATE INDEX "delivery_items_product_id_idx" ON "delivery_items"("product_id");

CREATE TABLE "customer_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "receipt_number" VARCHAR(48) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL DEFAULT 'OTHER',
  "reference" VARCHAR(160),
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "ReceiptStatus" NOT NULL DEFAULT 'POSTED',
  "idempotency_key" VARCHAR(160),
  "notes" TEXT,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_receipts_tenant_receipt_number_key" UNIQUE ("tenant_id","receipt_number"),
  CONSTRAINT "customer_receipts_amount_positive_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "customer_receipts_tenant_id_idempotency_key_key" ON "customer_receipts"("tenant_id","idempotency_key");
CREATE INDEX "customer_receipts_tenant_received_at_idx" ON "customer_receipts"("tenant_id","received_at");

CREATE TABLE "customer_receipt_allocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "receipt_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "customer_receipt_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_receipt_allocations_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "customer_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_receipt_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_receipt_allocations_receipt_invoice_key" UNIQUE ("receipt_id","invoice_id"),
  CONSTRAINT "customer_receipt_allocations_amount_positive_check" CHECK ("amount" > 0)
);
CREATE INDEX "customer_receipt_allocations_invoice_id_idx" ON "customer_receipt_allocations"("invoice_id");

ALTER TABLE "invoices"
  ADD COLUMN "sales_order_id" UUID,
  ADD CONSTRAINT "invoices_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "invoices_sales_order_id_idx" ON "invoices"("sales_order_id");

CREATE TABLE "supplier_bills" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "purchase_order_id" UUID,
  "bill_number" VARCHAR(60) NOT NULL,
  "issue_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_date" DATE NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_bills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_bills_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "supplier_bills_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_bills_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "supplier_bills_tenant_bill_number_key" UNIQUE ("tenant_id","bill_number"),
  CONSTRAINT "supplier_bills_total_nonnegative_check" CHECK ("total" >= 0)
);
CREATE INDEX "supplier_bills_tenant_status_due_idx" ON "supplier_bills"("tenant_id","status","due_date");
CREATE INDEX "supplier_bills_tenant_supplier_issue_idx" ON "supplier_bills"("tenant_id","supplier_id","issue_date");

CREATE TABLE "supplier_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL DEFAULT 'OTHER',
  "reference" VARCHAR(160),
  "paid_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "ReceiptStatus" NOT NULL DEFAULT 'POSTED',
  "idempotency_key" VARCHAR(160),
  "notes" TEXT,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_payments_amount_positive_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "supplier_payments_tenant_id_idempotency_key_key" ON "supplier_payments"("tenant_id","idempotency_key");
CREATE INDEX "supplier_payments_tenant_paid_at_idx" ON "supplier_payments"("tenant_id","paid_at");

CREATE TABLE "supplier_payment_allocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payment_id" UUID NOT NULL,
  "bill_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "supplier_payment_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "supplier_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_payment_allocations_payment_bill_key" UNIQUE ("payment_id","bill_id"),
  CONSTRAINT "supplier_payment_allocations_amount_positive_check" CHECK ("amount" > 0)
);
CREATE INDEX "supplier_payment_allocations_bill_id_idx" ON "supplier_payment_allocations"("bill_id");

CREATE TABLE "ledger_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "customer_id" UUID,
  "supplier_id" UUID,
  "entry_type" VARCHAR(48) NOT NULL,
  "reference_type" VARCHAR(64) NOT NULL,
  "reference_id" UUID NOT NULL,
  "description" VARCHAR(240) NOT NULL,
  "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotency_key" VARCHAR(160),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ledger_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ledger_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ledger_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ledger_entries_debit_credit_check" CHECK ("debit" >= 0 AND "credit" >= 0 AND NOT ("debit" > 0 AND "credit" > 0))
);
CREATE UNIQUE INDEX "ledger_entries_tenant_id_idempotency_key_key" ON "ledger_entries"("tenant_id","idempotency_key");
CREATE INDEX "ledger_entries_tenant_customer_posted_idx" ON "ledger_entries"("tenant_id","customer_id","posted_at");
CREATE INDEX "ledger_entries_tenant_supplier_posted_idx" ON "ledger_entries"("tenant_id","supplier_id","posted_at");
CREATE INDEX "ledger_entries_reference_idx" ON "ledger_entries"("tenant_id","reference_type","reference_id");

CREATE TABLE "role_permissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "role" "UserRole" NOT NULL,
  "module_key" VARCHAR(48) NOT NULL,
  "action_key" VARCHAR(48) NOT NULL,
  "granted" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_user_id" UUID,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_permissions_tenant_role_module_action_key" UNIQUE ("tenant_id","role","module_key","action_key")
);
CREATE INDEX "role_permissions_tenant_role_idx" ON "role_permissions"("tenant_id","role");

CREATE TABLE "customer_follow_ups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "due_at" TIMESTAMPTZ(6) NOT NULL,
  "status" "FollowUpStatus" NOT NULL DEFAULT 'OPEN',
  "channel" VARCHAR(40),
  "notes" TEXT,
  "assigned_user_id" UUID,
  "idempotency_key" VARCHAR(160),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_follow_ups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_follow_ups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_follow_ups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_follow_ups_tenant_id_idempotency_key_key" ON "customer_follow_ups"("tenant_id","idempotency_key");
CREATE INDEX "customer_follow_ups_tenant_status_due_idx" ON "customer_follow_ups"("tenant_id","status","due_at");
CREATE INDEX "customer_follow_ups_tenant_customer_due_idx" ON "customer_follow_ups"("tenant_id","customer_id","due_at");
