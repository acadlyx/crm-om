# Owner Dashboard & Business Operations

## Scope added on this feature branch

This feature branch extends the existing Next.js / Prisma CRM without resetting or rewriting existing records. The core business records are tenant-scoped in the application APIs, and finance/stock writes use transaction boundaries and audit events.

### New schema and migrations

The branch adds migrations after the existing CRM core migration:

- `20261024000200_owner_business_operations`: products, inventory movements, suppliers, sales orders/items, purchase orders/items, goods receipts/items, deliveries/items, receipt allocations, supplier bills/payments/allocations, ledger entries, follow-ups, and role permission overrides.
- `20261024000300_team_account_activation`: `users.is_active` and active-team lookup index.
- `20261024000400_delivery_cost_and_followup_assignee`: delivered unit-cost snapshots and tenant-scoped follow-up assignment FK.
- `20261024000500_invoice_order_integrity`: invoice and invoice-line discount snapshots and unique order-to-invoice constraint.
- `20261024000600_legacy_payment_reversal`: explicit posted/reversed status on existing `payments` rows. Historical rows default to `POSTED`; they are not deleted.

Apply these migrations to a **non-production/staging** database first. Do not run `prisma migrate reset` against any database containing business records. Production rollout requires a verified backup, migration review, staging smoke tests and a recorded recovery plan.

## Main routes

- `/dashboard`: Owner Dashboard for tenant owners and platform administrators linked to a business. Other roles retain their role dashboard.
- `/operations/products`, `/operations/inventory`, `/operations/suppliers`, `/operations/sales-orders`, `/operations/purchase-orders`, `/operations/goods-receipts`, `/operations/deliveries`, `/operations/customer-receipts`, `/operations/supplier-bills`, `/operations/supplier-payments`, `/operations/ledger`, `/operations/customer-follow-ups`, `/operations/permissions`, `/operations/team`.
- `/operations/invoices/:id`: tenant-scoped printable invoice. Use the browser print dialog and select “Save as PDF”.
- `/crm/*`: existing customer, lead/deal, invoice, payment, expenses and tasks areas. Existing list views retain their current APIs and now have CSV export and Show More behavior.

Operations APIs are under `/api/v1/operations`. Existing CRM APIs remain under `/api/v1/crm`.

## Financial and stock rules

- Sales orders calculate totals on the server from the current saved product selling price, quantity, discount and tax percentages. A draft can be edited only before it has deliveries or invoices.
- A confirmed order is invoiced once. Issuing an invoice copies line-level values and creates a customer receivable ledger debit in one transaction.
- A posted legacy payment or customer receipt reduces the invoice balance only while it remains posted. Receipt allocations cannot exceed the invoice balance or actual receipt. A receipt allocated across invoices is recorded once as cash received; allocations separately reduce the relevant invoice balances.
- Supplier bills create payable ledger credits. Supplier payments are recorded once and bill allocations reduce individual bill balances.
- Posted financial records are reversed with a reason and audit event; the records themselves remain. Old payments now have an explicit `REVERSED` state.
- Creating a purchase order does not change inventory. Posting a goods receipt increments stock and creates inventory movement rows in a single transaction. Delivery posting decrements stock once, checks quantities against the order and writes delivery-time cost snapshots. Failed or retried transactions roll back as a unit.
- Replenishment thresholds are per product. Current inventory valuation is an estimate at saved purchase cost.
- Gross profit is an estimate from completed delivery lines and their unit-cost snapshots. Where a legacy delivery has no cost snapshot, the dashboard falls back to the current product purchase cost and labels profit/valuation as estimates. It is not a tax filing, bank-reconciled statement or full financial accounting report.
- Receivables/payables are cumulative balances; period sales and collections use the selected date window. Date filters do not silently constrain cumulative open balances.

## Access control

Roles on this branch: Owner (`TENANT_ADMIN`), Sales, Delivery, Collections, Inventory Manager, Accountant and Staff. The account creation API refuses owner-role escalation; the current owner cannot deactivate or demote their own account. Inactive accounts cannot authenticate, and server-side tenant authorization rejects their existing sessions.

Module/action permissions are enforced inside API handlers in addition to hiding navigation. All business queries take the tenant identifier from the authenticated server session, not from a client-supplied tenant ID.

## Verification and remaining production gates

The branch must pass Prisma validation/generation, typecheck, lint, test suite and production build before merge. After that, run integration checks against a disposable/staging database for duplicate requests, concurrent receipt/delivery posting, cross-tenant access, partial allocations, reversals and dashboard totals.

The following require additional configuration or implementation before calling this a complete production accounting system:

- WhatsApp/email notifications, provider webhooks, delivery tracking, retries and failed-notification alerts are not simulated. Connect a provider and test it before enabling those actions.
- Browser print-to-PDF is provided for invoices; general Excel/XLSX and generated PDF exports are not yet a common reporting service.
- Tax rules are entered as order-line rates; jurisdiction-specific tax validation, e-invoicing and tax reports are not configured here.
- The default inventory costing behavior is weighted-average purchase cost. FIFO/LIFO layers are not implemented; do not switch the setting to another method and assume those methods are honored.
- Full bank/cash reconciliation and a complete double-entry chart-of-accounts/cashflow model are not present. The ledger captures customer/supplier transaction movements and reversals, not a substitute for a reconciled general ledger.
- Sales returns, credit notes, warranty claims and supplier returns need dedicated approval/quantity/financial workflows. Damage/loss/return stock movement types and reversal-safe posted receipts cover stock adjustments, not every return lifecycle.
- Customer-specific product price lists, automated credit-control policy, delivery proof upload/storage and invitation emails need business-policy and provider work before activation.
- Production backup/restore and recovery have not been verified by this change.

No production migration has been run as part of this branch.


## Additional finance integrity coverage

- Existing `/api/v1/crm` invoice/payment paths now include receipt allocations and ignore reversed legacy payments when calculating outstanding balances.
- Legacy invoice creation records the receivable and audit event transactionally; legacy payments post an associated customer-ledger credit.
- Posted legacy payments can be reversed by the owner with a mandatory reason. The reversal changes status, recomputes invoice state, adds an opposite ledger entry and retains audit history.
- The invoice print view shows the saved invoice lines, payments and allocated receipts; its print action uses the browser print dialog for PDF saving.
- Pure finance calculation tests cover posted/reversed payment filtering, allocation totals, no-negative balances, invoice-state recalculation and due-ageing buckets.
