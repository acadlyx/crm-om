# CRM-OM

Multi-tenant CRM foundation with centralized, database-backed product branding.

## Local setup
1. Use Node.js 20+ and PostgreSQL.
2. Copy .env.example to .env and set DATABASE_URL, NEXTAUTH_URL and a random NEXTAUTH_SECRET.
3. For first-time local setup, set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD (at least 12 characters).
4. Install dependencies with npm install.
5. Apply schema with npm run db:migrate, generate Prisma Client with npm run db:generate, then run npm run db:seed.
6. Start with npm run dev.

## Product branding
The temporary product name is configured centrally in lib/branding/defaults.ts and the initial DB migration. The Platform Settings -> Branding page can change product name, tagline, logo, favicon, primary color, support details and footer. The next request/navigation reads current database settings; no deployment is needed for a branding change. Logo and favicon upload requires S3-compatible storage values from .env.example.

Global platform branding and tenant business identity are separate records and APIs. Tenant settings are scoped from the authenticated tenant-administrator session.

System email/notification template helpers live in lib/branding/messages.ts. This empty starter repository does not include a configured delivery provider; wire the helpers into a chosen provider when delivery is implemented.

## Validation
Run npm run db:generate, npm run typecheck, npm run lint, npm test and npm run build. For the optional PostgreSQL integration test, set TEST_DATABASE_URL to a dedicated test database with this migration applied. Do not report persistence, object-storage uploads or browser no-redeployment behavior as verified until tested in the configured environment.
