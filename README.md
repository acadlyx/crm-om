# CRM-OM

Multi-tenant CRM foundation with centralized database-backed product branding, tenant-specific business identity, durable in-app notifications and an optional Resend email delivery adapter.

## Local setup
1. Use Node.js 22 and PostgreSQL 16+.
2. Copy .env.example to .env and set DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET and PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD.
3. Run npm install.
4. Apply migrations and generate the client with: npm run db:migrate && npm run db:generate.
5. Seed the local platform administrator with npm run db:seed.
6. Run npm run dev.

## Product branding
The temporary product name and other fallbacks are defined in lib/branding/defaults.ts. The Platform Settings -> Branding screen updates the singleton platform_settings row. Requests read that row dynamically, API responses are no-store, and settings writes invalidate the root layout. There is no build-time branding cache; fresh requests/navigation reflect updates without deploying a new build. Logo and favicon URLs are versioned to reduce stale browser/CDN assets.

Tenant-owned business identity lives in business_settings and is managed through a separate session-scoped API. Tenant administrators cannot update global platform branding or select another tenant by sending an ID.

## Delivery integration
- System email: lib/messaging/resend.ts calls the Resend email API and renders the configured database branding at send time. Set RESEND_API_KEY and RESEND_FROM_EMAIL to a sender address verified by your Resend account.
- Use lib/messaging/delivery.ts from server-side business events to create a durable branded in-app notification and optionally send email in the same workflow.
- In-app notifications are persisted in system_notifications and displayed in /notifications. The page fetches the current product name at request time; notifications and mark-as-read actions are scoped to the authenticated recipient.
- Provider acceptance is not proof of inbox delivery. Delivery requires valid Resend credentials and a verified sender/domain.
- This repository began empty and contains no pre-existing business email or notification dispatch workflows. The delivery service is the integration point for future workflows; it does not fake external delivery.

## Verification
Run npm run db:migrate, npm run db:generate, npm run db:seed, npm run typecheck, npm run lint, npm run audit:branding, npm test, npm run build, and npm run test:e2e. Branding CI provisions PostgreSQL and includes a browser test that updates the brand and verifies the fresh title and database state while the same server remains running.
