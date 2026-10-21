# Dynamic Product Branding — Implementation Status

## Source pushed

Branch: feature/dynamic-product-branding

- Prisma/PostgreSQL schema and initial migration for global platform_settings plus separate tenant business_settings.
- Neutral fallback brand is centrally configured as Business CRM.
- Server-side request-time branding reads with fallback; dynamic metadata, title and favicon; logo/tagline in login and sidebar; footer attribution and theme color.
- Platform Settings -> Branding UI and an admin-only write API gated by PLATFORM_ADMIN.
- Platform branding updates are audited and invalidate relevant Next.js routes; API replies use Cache-Control: no-store.
- S3-compatible logo/favicon upload endpoint validates MIME type, image signature and a 2 MB size limit; SVG is rejected.
- Tenant settings API uses the authenticated session's tenant ID rather than a caller-supplied tenant ID; platform identity and tenant business identity remain separate.
- Central helper for system-message branding, plus tests for defaults/validation, branding API persistence path/permission checks, tenant isolation, and message branding.

## Verification — not production complete

- The GitHub branch and source files were verified through the GitHub API.
- TypeScript type-check, lint, unit/API suite, Next.js production build and Prisma Client generation have **not** been run against this branch.
- PostgreSQL migration and persistent write/read behavior have **not** been exercised in a real database.
- Browser propagation without redeployment has **not** been verified.
- S3-compatible uploads have not been exercised with real storage credentials.
- The repository started empty. A centralized message helper exists, but no existing email sender or notification-delivery pipeline was present to integrate into.
- No deployment was performed.

## Verification commands

Run from the repository root:

\`\`\`bash
npm install
cp .env.example .env
# Configure DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET and platform administrator credentials.
npm run db:generate
npm run db:migrate
npm run db:seed
npm run typecheck
npm run lint
npm test
npm run build
\`\`\`

Before release, verify against PostgreSQL that an update survives a fresh server request, and confirm in a browser that title, favicon, login, sidebar and footer update without deploying a new build. Configure S3-compatible storage before verifying uploads.
