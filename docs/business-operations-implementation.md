# Business Operations & Owner Dashboard

This change set extends the existing CRM without replacing its authentication, PostgreSQL database, Prisma client, tenant boundary, or branding service.

## Current implementation

### Owner overview
- Date windows: today, yesterday, last 7 days, last 30 days, month-to-date, financial year, and a custom range (capped at three years).
- Live database queries for booked sales, posted customer collections, receivables/overdue balances, supplier payables, estimated gross profit and margin, order count/average order value, stock valuation, pending/delayed deliveries, and low/out-of-stock products.
- Collection and receivable/payable values are calculated independently. Period sales and cash collected are not treated as the same metric.
- Receivables use invoice-level legacy payments plus posted receipt allocations. Reversed payments and receipts are excluded.
- The dashboard displays a migration/data-unavailable warning instead of substituting sample values.
- Action lists initially show three items; each list provides Show More.
- Gross profit is an estimate based on delivery line quantity, selling price/discount, and the recorded unit-cost snapshot (or current product cost for older deliveries lacking snapshots). It is not a bank-reconciled or tax statement.

### Business operations
- Products and suppliers; SKUs, prices, stock-on-hand, reorder levels, opening stock movement, and stock movement ledger.
- Draft/confirmed sales orders, server-recalculated prices/discounts/tax, edit-before-posting, cancellation guards, and idempotent invoice issuance from a sales order.
- Purchase orders and partial goods receipts; purchase orders alone do not increase stock.
- Deliveries with assignment, dispatch, completion, proof-of-delivery reference, failed/cancelled states, delivery quantity checks, stock deductions, and recorded cost snapshots.
- Customer receipts and allocations across invoices; supplier bills and supplier payments allocated across bills; partial balances; authorized reversals with reasons; tenant ledger/audit entries.
- Customer follow-ups and owner-controlled role/action permission overrides.
- Owner team area: staff accounts, role changes, deactivation/reactivation, and audit events. Inactive users are blocked at sign-in and server workspace access.
- Existing CRM customer/lead/deal/invoice/payment/expense/task lists receive server-side action authorization. CRM tables provide CSV export and Show More.
- No invitation email, WhatsApp provider, online payment gateway, notification delivery provider, or external bank reconciliation is presumed configured. The UI does not fabricate successful sends or provider events.

## API surface

The new tenant-scoped operations routes are:

- `GET/POST /api/v1/operations/[resource]`
- `PATCH /api/v1/operations/[resource]/[id]`
- `GET/POST /api/v1/operations/team`
- `PATCH /api/v1/operations/team/[id]`

Supported operation resources include `products`, `suppliers`, `sales-orders`, `purchase-orders`, `goods-receipts`, `deliveries`, `customer-receipts`, `supplier-bills`, `supplier-payments`, `inventory`, `customer-follow-ups`, `ledger`, and `permissions`.

Existing routes under `/api/v1/crm/[resource]` remain in place and now enforce the same server-side permission layer. Writes validate workspace-owned foreign records on the server, recalculate order totals from current product prices, and use transactions for related stock/ledger/audit changes. Payment, invoice, order, receipt, delivery, goods-receipt, and inventory retry paths use tenant-scoped idempotency keys where supported.

## Database migrations

All migrations are additive; they do not drop existing tables or reset existing data.

- `20261024000100_business_crm_core` — existing CRM foundation migration on the target branch.
- `20261024000200_owner_business_operations` — products, suppliers, orders, receipts, deliveries, customer/supplier subledgers, follow-ups, role permissions and business-settings fields.
- `20261024000300_team_account_activation` — user activation state.
- `20261024000400_delivery_cost_and_followup_assignee` — unit-cost snapshot and follow-up assignee relation.
- `20261024000500_invoice_order_integrity` — invoice discounts and one-invoice-per-sales-order integrity.
- `20261024000600_legacy_payment_reversal` — status for reversals of legacy payments.
- `20261024000700_legacy_payment_idempotency` — tenant-scoped retry key for legacy payments.
- `20261024000800_invoice_idempotency` — tenant-scoped retry key for direct invoice creation.

## Deployment procedure

1. Run typecheck, lint, unit/integration tests, and the production build on this branch.
2. Apply all migrations to a disposable/local test database and run the workflow's transaction and authorization tests.
3. Deploy the branch to a non-production Vercel environment connected to a staging PostgreSQL database. Apply migrations to staging and test sales-order creation/edit/confirmation, invoice issuance, partial receipts/deliveries/payments, reversals, role denial, and tenant isolation.
4. Back up production and review the additive SQL before applying it. Only after approval, run `npm run db:migrate` against the intended production environment. Do not use `prisma migrate reset`, destructive push operations, or production seed/reset commands as deployment shortcuts.
5. Verify `prisma migrate status`, the owner dashboard, workspace pages, invoice print page, API authorization, and audit history after deployment.

No new external-provider environment variables are required by the implemented database-backed workflows. Future email/WhatsApp/payment provider integrations must use server-side secrets and their own delivery/reconciliation state.

## Known scope limits

This is a reviewable, staged implementation rather than proof that every item in the broader product brief is complete. The following still need dedicated implementation/verification before a full production approval:
- Purchase/expense, monthly/yearly, slow-moving-product, and collection-efficiency analytics are not all represented as owner-dashboard charts yet.
- A complete configurable business settings UI for currency/timezone/financial year/tax/invoice policies/costing policy is not finished; schema fields are present for part of this configuration.
- Customer-specific price lists and enforcement of credit limits in order confirmation are not yet complete.
- Sales returns/credit notes, purchase returns with full supplier-credit lifecycle, supplier bill matching, invoice PDF generation beyond the existing print view, XLSX/PDF report exports, and stock reservation policies require further work.
- Team invitation email, finer record ownership, session management UI, rate limiting, upload hardening, provider-backed notifications/WhatsApp, and automatic bank reconciliation require dedicated implementation.
- CI can verify unit tests/build/migrations in the test environment; it does not prove production data correctness or backup-restore readiness. Run the staging verification plan before production rollout.
