-- Keep product-name defaults in the centralized application settings, not duplicated ORM defaults.
ALTER TABLE "platform_settings"
  ALTER COLUMN "product_name" DROP DEFAULT,
  ALTER COLUMN "product_tagline" DROP DEFAULT,
  ALTER COLUMN "primary_color" DROP DEFAULT,
  ALTER COLUMN "footer_text" DROP DEFAULT;

CREATE TABLE "system_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recipient_user_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "href" VARCHAR(2048),
  "source_label" VARCHAR(120) NOT NULL,
  "support_email" VARCHAR(320),
  "idempotency_key" VARCHAR(200),
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "system_notifications_recipient_user_id_fkey"
    FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "system_notifications_recipient_user_id_idempotency_key_key"
  ON "system_notifications"("recipient_user_id", "idempotency_key");
CREATE INDEX "system_notifications_recipient_user_id_read_at_created_at_idx"
  ON "system_notifications"("recipient_user_id", "read_at", "created_at");
