# CRM-wide UX, Responsive Layout & Data Clarity Audit

## Repository state and safety

- Repository: `acadlyx/crm-om`
- Base at recovery: `main` at `d907d61381d09d60f4c87bcc08b5cbe4cb224dc3`
- Follow-up branch: `feat/crm-wide-ux-data-clarity`
- Production: unchanged; no deployment or production migration was run by this work.
- Existing PR #4 was already merged and closed when inspected. Its old feature branch was no longer present. The work is on a new feature branch rather than rewriting or reopening history.
- No code was committed directly to `main`.

## Route and component inventory

The current repository contains 13 application page routes and 21 API route handlers. The central authenticated shell is `components/workspace-shell.tsx`; most CRM CRUD pages use `components/crm-module.tsx`, and the purchasing/inventory/receipt modules use `components/operations-module.tsx`. The role-aware structured detail dialog is `components/record-details-action.tsx`, with detail responses formatted by `lib/record-details/types.ts` and guarded by the existing resource-scoped API handlers.

### CRM modules — `/crm/[section]`

| Module | List view after this change | Full details |
|---|---|---|
| Customers | Customer, company, contact and status columns | Contact details, credit/terms, invoices, opportunities, tasks and follow-ups |
| Leads | Contact, company, source, potential value and status | Contact, qualification and related opportunities |
| Sales pipeline | Opportunity, related contact/company, value, close date and stage | Opportunity terms and related customer/lead |
| Invoices | Invoice, customer, dates, total, paid, balance and status | Customer, sales order, line items, recorded payments and receipt allocations; invoice detail page and PDF link retained |
| Payments received | Invoice, customer, amount, method, reference, date and status | Payment, invoice and customer details |
| Expenses | Expense, category, payee, amount, date and status | Amount/vendor/payment details, notes and timestamps |
| Tasks | Task, customer, deadline, priority and status | Task, related customer, description and timestamps |

The CRM invoice list no longer exposes its sales-order UUID. Full detail and business reference remain available through the invoice detail page.

### Operations modules — `/operations/[section]`

| Module | Main list summary | Details/action policy |
|---|---|---|
| Products | SKU, product, category, stock, reorder threshold, selling price, status | Product/pricing details and recent stock movements |
| Suppliers | Supplier, company, email, phone, status | Contact, tax and terms plus recent orders, bills and payments |
| Sales orders | Order, customer, dates, line count, total, status | Order items, deliveries and linked invoices |
| Purchase orders | PO, supplier, dates, line count, total, status | Supplier, purchase items, receipts and bills |
| Goods receipts | Receipt, PO, supplier, received date, line count, status | Receipt and received quantities |
| Deliveries | Delivery, order, customer, scheduled date, assignee, status | Dispatch/completion, proof/failure reason and delivered items |
| Customer receipts | Receipt, customer, amount, method, reference, date, allocation count and status | Receipt and invoice allocations; PDF action retained |
| Supplier bills | Bill, supplier, PO, issue/due dates, total, paid, balance, status | Supplier, purchase reference and payment allocations; PDF action retained |
| Supplier payments | Supplier, amount, method, reference, paid date, bill allocation count and status | Supplier/payment details and allocations; reversal stays separate and audited; PDF action retained |
| Stock movement ledger | Date, product, SKU, movement, quantity, unit cost, source type | Detailed stock movement without technical idempotency/source UUIDs in ordinary list/export |
| Customer follow-ups | Follow-up, customer, assignee, due date, channel, status | Follow-up and customer/assignee detail |
| Ledgers & accounts | Posted date, entry type, source type, description, customer/supplier, debit/credit | Accounting entry and related party |
| Team & permissions | Role, module, action, granted status and update date | Permission rule; raw updater UUID omitted |

Nested child-record arrays are shown in structured detail sections rather than squashed into table cells or exported as `[object Object]`. Human-readable references are retained; technical actor/foreign keys and idempotency keys are not ordinary list columns.

## Guidance and action inventory

- Repetitive CRM module descriptions are hidden where they only restate the page title/action.
- Operations descriptions are retained for consequential stock/receipt/payment/permission rules and shortened to one useful sentence. These messages explain when stock moves, how receipt allocations affect invoice balances, or how reversals/permissions behave.
- Empty-state, validation, loading, failure and access-denied messages remain visible.
- “View” stays in the predictable per-row action group and opens a read-only, entity-specific detail dialog. It does not replace authorized edit, workflow, PDF, reversal or delete actions.
- Delete is rendered only where the user has delete permission. Server-side permission checks and tenant filters remain authoritative.
- Invoice “View invoice” and “Download PDF” are distinct tasks and both remain available.

## Shared design and responsive changes

- Added `components/workspace-ux-overhaul.css`, scoped to the authenticated workspace, with consistent body/label/table typography, heading hierarchy, field sizing, focus-visible states, readable status badges, long-value wrapping, responsive gutters and reduced-motion support.
- Updated `components/workspace-shell.tsx` to load the shared layer after the existing shell styles.
- Fixed subtitle cleanup to avoid globally hiding operational guidance that prevents stock/financial mistakes.
- Tables use concise summary columns and remain in a contained horizontal-scroll region on narrow displays; the document/page itself is not widened to fit every optional column.
- Existing `tests/e2e/responsive-layout.spec.ts` exercises 320, 375, 390, 768, 1024, 1280 and 1440px viewports for the dashboard, customer list and product list, and additional representative invoice/order/settings routes. The separate mobile navigation smoke covers the collapsible sidebar and active route.

## Verification and limits

Baseline checks against the current source before these edits: TypeScript passed; tests passed (65 passed, 1 skipped); lint passed with pre-existing warnings; production build passed. The repository has no tracked lockfile, so `npm ci` cannot run until a lockfile is intentionally added. Baseline package installation was performed in an isolated sandbox with `npm install --package-lock=false`.

Final verification for this branch is being rerun after the UX changes. Do not consider the work release-ready until the final typecheck, test, lint, build and GitHub Actions results are green. Responsive CSS itself is not a substitute for the automated browser checks.

## Remaining scope

The global shell changes apply across the dashboard, notifications, team and settings pages, but this PR focuses record-list clarity on the main CRM and operations modules. Any individual page-specific redesign beyond the shared shell and listed tables/detail flows must be called out separately rather than assumed complete.
