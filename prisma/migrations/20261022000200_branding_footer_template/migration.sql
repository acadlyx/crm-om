ALTER TABLE "platform_settings"
  ALTER COLUMN "product_tagline" SET DEFAULT 'A clearer way to run your business.',
  ALTER COLUMN "footer_text" SET DEFAULT '© {year} {product_name}. All rights reserved.';

UPDATE "platform_settings"
SET "product_tagline" = 'A clearer way to run your business.'
WHERE "product_tagline" = 'A clearer view of your business';

UPDATE "platform_settings"
SET "footer_text" = '© {year} {product_name}. All rights reserved.'
WHERE "footer_text" = 'Powered by Business CRM';
