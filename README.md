# CRM-OM

Multi-tenant CRM foundation with database-backed, request-time product branding.

## Setup
1. Copy .env.example to .env.local and configure PostgreSQL, session secrets and S3-compatible storage.
2. Run npm install.
3. Run npm run db:generate and npm run db:migrate.
4. Set PLATFORM_ADMIN_EMAIL and a PLATFORM_ADMIN_PASSWORD of at least 12 characters, then run npm run db:seed.
5. Run npm run dev.

The final product name is intentionally undecided. A neutral temporary fallback, Business CRM, is configured centrally. Update it at Platform Settings -> Branding after signing in as a platform administrator.

## Design notes
- platform_settings is a global singleton, separate from tenant business_settings.
- Platform branding is loaded server-side on dynamic requests; GET responses are no-store, and updates invalidate relevant routes.
- Only PLATFORM_ADMIN may update global brand settings or upload global brand assets.
- Tenant business settings use the authenticated user's tenant ID. API input cannot select an arbitrary tenant.
- Logo and favicon assets require configured S3-compatible storage; image bytes, type and size are validated.

## Verification
Run npm run typecheck, npm test, npm run lint, and npm run build. Database persistence and browser propagation need a configured PostgreSQL environment and must not be reported as verified until actually tested.
