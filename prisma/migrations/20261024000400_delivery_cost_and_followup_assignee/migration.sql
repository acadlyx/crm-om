-- Financial traceability: persist actual delivered unit costs and validate follow-up assignees.
ALTER TABLE "delivery_items"
  ADD COLUMN "unit_cost" DECIMAL(12,2),
  ADD CONSTRAINT "delivery_items_unit_cost_nonnegative_check" CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0);

ALTER TABLE "customer_follow_ups"
  ADD CONSTRAINT "customer_follow_ups_assigned_user_id_fkey"
  FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "customer_follow_ups_tenant_assigned_user_idx" ON "customer_follow_ups"("tenant_id", "assigned_user_id");
