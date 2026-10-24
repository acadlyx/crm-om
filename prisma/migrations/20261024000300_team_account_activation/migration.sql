-- Additive account activation flag for tenant team administration.
ALTER TABLE "users"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX "users_tenant_id_is_active_role_idx" ON "users"("tenant_id", "is_active", "role");
