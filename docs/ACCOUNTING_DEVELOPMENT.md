# Accounting development — 2026-11-06

Base: main `4d7d7db`. Read Notion commercial decisions and handoff before work.
This is development evidence, not production deployment or a new commission engine.

## Source audit

- Implemented: immutable SYP ledger, frozen FX, transactional audited payments
  and reversals, warehouse-scoped accounts/statements, summaries and settlements.
- Missing: accountant dashboard, phone search, account-state filters, statement
  date controls and print/export.
- Overlap: summary cards and entitled insights report ledger movements. Reuse
  existing definitions rather than summing orders in React.
- Risks: statements accept reversed ranges and read opening/entries without a
  shared snapshot. Payment API accepts absent idempotency keys; assess client
  compatibility before enforcing them.
- Safe work: read-only dashboard, search, filters, snapshot statements and CSV.

AccountsPage manages user identities; WarehouseDebtsPage is the financial screen.
Account-level payments do not establish invoice paid/partial states. Existing
FIFO aging is monitoring only, not allocation. Historical entries stay unchanged.

## C1 — Dashboard contract

GET /api/warehouse/balances/dashboard: active warehouse members only (owner,
accountant, existing combined login). Admin does not become a warehouse member.
Tenant comes from authenticated membership. Unknown query keys are rejected.

Query: period=today|week|month|custom, custom from/to use Damascus business days.
kind and pharmacyId filter activity only; KPI scope is the whole warehouse.
Response: existing summary, asOf, timezone, activity (latest 20), activityHasMore.
All activity links to the full pharmacy statement. Summary and activity read
sequentially inside one MongoDB snapshot transaction. Current debts use the
existing ledger-maintained cache; period totals use frozen ledger entries,
net of reversals. No live FX conversion, posting or cache rebuild.

/warehouse/accounting is a new route and accountant fallback landing. Other
roles keep their default. Existing financial URLs are preserved. Current debt
and period metrics are labelled separately. Refresh/failure hides old amounts;
out-of-order replies cannot overwrite the latest request.

Overdue preview uses the existing server-entitled follow-up endpoint, only when
enabled, with its independent read time. No subscription or payment permissions
change. No invoice allocations or collection-based commission engine enabled.

Validation: isolated replica-set HTTP tests for warehouse isolation, role/status
boundaries, read-only behavior, reversals, filters and concurrent snapshot read;
React tests for exact server figures, references, empty/error/retry, stale replies
and entitlement routing. Require full CI and independent financial review before
merge. No manual Render deploy or production financial tests.

## C2/C3 — Accounts and statements

Phone/name search and debt/credit/zero filters compose server-side with the
existing warehouse scope and compound balance cursor; balances retain their
ledger-cache definition. No per-invoice payment status is fabricated.

Statement opening, movement rows, account identity and optional payment rows
now share an explicit snapshot transaction. Read helpers accept an optional
session without changing old call signatures. Reversed periods are rejected.
Response adds asOf, postedAt and reconciliation (opening + signed movements =
closing). This is a statement arithmetic check, not a separate cache audit.

Warehouse detail accepts optional from/to. Explicit ranges also filter payment
receipts by paidAt; paymentsScope declares period vs legacy all-history mode.
Historical views are read-only in the UI, with a return-to-current action before
recording/reversing cash. Errors clear old amounts/export actions; request IDs
prevent late replies from replacing the latest selection. Existing summary
cards likewise clear old period figures on refresh/failure.

Print view includes warehouse/pharmacy identity, dates, opening/closing and all
ledger movement rows; native browser print can save PDF. No independent PDF
engine was added. CSS is scoped to the mounted statement. CSV uses existing
formula-safe quoting, exports server amounts/references/timestamps and preserves
phone text. Physical printer/PDF layout acceptance remains unverified: local
Chromium startup failed, so no generated-PDF acceptance is claimed.

Validation: existing statement15 and account-search5 tests, reporting3 tests
including a backdated commit injected between opening and rows; React statement,
CSV, inline-pay and stale-summary tests; full web545 passed before the additional
summary freshness test (which passed separately), build and lint passed (existing
warnings). Independent financial review found no blocker. CI required on the
final PR head. No writes, financial migration, allocation or commission change.
