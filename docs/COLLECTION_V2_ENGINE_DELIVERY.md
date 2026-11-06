# Collection v2 — incremental engine delivery (2026-11-06)

Business rules are approved. Remaining work is implementation and operational acceptance, not new policy decisions. This delivery depends on receipt-proof PR66 and navigation PR64; it does not deploy or activate production contracts.

## Implemented

- Explicit versioned warehouse contracts capture existing rep rates and agreement reference for **new orders only**. Old orders stay on their original engine. No legacy balance or settlement is migrated.
- Actual ledger payments allocate FIFO over the account's original invoice principals. Warehouse commission recognizes only after accountant-approved proof **and** a persisted settlement covering the actual receipt period. Reversal appends signed corrections and a new allocation version.
- Separate immutable invoices, allocation snapshots (bounded chunks), recognition evidence and commission events; rebuildable invoice positions never write pharmacy balances. Canonical ledger reconciliation precedes display.
- City shares50/50; rural/city_ring Feniq100%. Original-denominator proportional accrual and cumulative whole-lira rounding; returned-credit lineage carries source-backed funding and original/per-beneficiary rounding budgets without creating another cash receipt.
- Approved returned goods issue credit for a subsequent invoice/exchange. Pending orders reserve it under the account lock; cancellation/resize releases it; delivery posts a distinct non-cash application. Original invoice debt does not change on approval. Admin-funded discount compensation clawback is frozen with the grant and reported once at issue time.
- Shared reports: warehouse/admin commission, rep totals, statements and warehouse order detail use posted sources. Collection journal supports server cursors, pharmacy search, invoice states and posting-period filters. Current positions and period movements are labelled separately.
- Read-only accountant dashboard panel renders server cash, applied credit, outstanding amounts, eligible cash, beneficiary shares, signed corrections and source timestamps. Refresh/error clears stale amounts.

## HTTP contracts

All endpoints require active authenticated users, DB-checked roles and no-store responses.

- `GET /api/warehouse/collection-accounting`: own warehouse financial readers only.
- `GET /api/admin/collection-accounting/warehouses/:warehouseId`: explicit warehouse scope, admin only.
- Query: `period=today|week|month|custom`, custom `from/to`, `search`, `pharmacyId`, `state=open|partial|paid|void`, independent `invoiceAfter/after` cursors; page size20. Event amounts are signed and period-specific; invoice positions/credit liability are current across all dates.
- `POST /api/admin/collection-accounting/warehouses/:warehouseId/contracts`: `{agreementReference,basis:'net_pharmacy_invoice',deliveryFeeSyp:null|integer,expectedRevision,idempotencyKey}`. No client rates. A nonzero standalone legacy warehouse fee is rejected rather than silently erased. Rep-rate changes require a new explicit contract revision for future orders; existing snapshots remain immutable.
- `POST /api/admin/collection-accounting/warehouses/:warehouseId/settlements`: `{periodFrom,periodTo,proofReviewIds,reference,idempotencyKey}`. Approved warehouse proof reviews are validated against real posted receipts, tenant and epoch. Same request replay returns200 and `Idempotent-Replay:true`; collision409. This records evidence/recognition, **not a commission cash transfer** and not another pharmacy payment.

## Deliberately remaining implementation

This is **not full financial activation**. Do not enable a production contract before completing the required workflow and acceptance:

1. Narrow explicit grants for Feniq collectors and approvers; actual Feniq receipt approval and custody/remittance records, clocked24–48h from actual receipt. No implicit generic admin cashier permission.
2. Operational admin contract/weekly-settlement controls and eligible-proof selection; current backend writers are tested but not yet exposed as a complete operator flow.
3. Transaction/idempotency hardening of the existing platform commission cash record/reversal endpoint (separate from the new recognition writer).
4. Flutter presentation for non-cash credit application and approved future-credit treatment; web supplied in this delivery.
5. Isolated end-to-end acceptance of both collector paths, then controlled deployment. No real production financial tests, history edits or manual Render deployment.

Allocation history still persists complete versions (chunked to avoid document-size failure); this preserves audit evidence but can grow with long accounts. Follow-up performance work must preserve immutable events and reconciliation.

## Validation

- Full backend before review fixes:1642/1642. Review fixes have directed regression coverage; final counts are recorded in the PR.
- Directed settlement/discount-code/v2 integration:37/37, including partial/full admin-funded returns without changing original receivable, and matching invoice report net.
- Pure lineage property cases exceed5000 combinations of rounding/funding/scope; count is not added to suite totals.
- Full web before final labels:580/580; build and lint pass (existing warnings). Final head evidence is recorded in the PR.
- Independent money review found and fixed missing discount-compensation clawback and inconsistent invoice net presentation. Merge remains conditional on final CI and required GitHub reviewer approval.
