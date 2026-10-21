CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TYPE "UserRole" AS ENUM ('PLATFORM_ADMIN', 'TENANT_ADMIN', 'STAFF');

CREATE TABLE "tenants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "slug" VARCHAR(80) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(160) NOT NULL, "email" VARCHAR(320) NOT NULL,
  "password_hash" TEXT NOT NULL, "role" "UserRole" NOT NULL DEFAULT 'STAFF', "tenant_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_tenant_id_role_idx" ON "users"("tenant_id", "role");

CREATE TABLE "platform_settings" (
  "id" VARCHAR(32) NOT NULL DEFAULT 'global', "product_name" VARCHAR(120) NOT NULL DEFAULT 'Business CRM',
  "product_tagline" VARCHAR(240) NOT NULL DEFAULT 'A clearer view of your business', "logo_url" VARCHAR(2048),
  "favicon_url" VARCHAR(2048), "primary_color" VARCHAR(7) NOT NULL DEFAULT '#2563EB',
  "support_email" VARCHAR(320), "support_website" VARCHAR(2048),
  "footer_text" VARCHAR(500) NOT NULL DEFAULT 'Powered by Business CRM',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_settings_singleton_check" CHECK ("id" = 'global'),
  CONSTRAINT "platform_settings_primary_color_check" CHECK ("primary_color" ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE TABLE "business_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "tenant_id" UUID NOT NULL,
  "business_name" VARCHAR(160) NOT NULL, "logo_url" VARCHAR(2048), "contact_email" VARCHAR(320),
  "contact_phone" VARCHAR(40), "address" VARCHAR(1000), "invoice_prefix" VARCHAR(20) NOT NULL DEFAULT 'INV',
  "invoice_identity" JSONB NOT NULL DEFAULT '{}'::jsonb, "preferences" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "business_settings_tenant_id_key" ON "business_settings"("tenant_id");

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "actor_user_id" UUID,
  "action" VARCHAR(120) NOT NULL, "entity_type" VARCHAR(120) NOT NULL, "entity_id" VARCHAR(120),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

INSERT INTO "platform_settings" ("id", "product_name", "product_tagline", "primary_color", "footer_text")
VALUES ('global', 'Business CRM', 'A clearer view of your business', '#2563EB', 'Powered by Business CRM');
