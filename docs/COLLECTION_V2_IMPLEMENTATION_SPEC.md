# Collection v2 implementation contract — approved policy, staged implementation

Authority: [approved Notion decisions](https://app.notion.com/p/40e6c91cc9c481e4bc0ef8e47a7426e9).
This is an implementation specification, not an activated financial engine.
Current calculators remain previews; historical v1 orders/ledger are unchanged.

## Decisions and activation gate

- City: split the original rep commission 50% Feniq / 50% assigned rep.
- Rural and city_ring: original rep commission 100% Feniq. Delivery charges
  remain a separate explicitly contracted amount, never inferred or invented.
- Owner confirmation 2026-11-06: cash is entered manually and allocated
  automatically to the oldest invoices (FIFO). Keep unapplied cash explicit.
  Do not retrospectively allocate historical receipts or skip legacy debt.
- Accrual follows eligible actual collection, proportional to partial collection.
  Both collection paths need persisted authorized receipt approval; a request
  boolean is never evidence. Warehouse commission remittance is weekly, separate
  from collection and from the pharmacy debt reduction.
  The existing approved prerequisite for warehouse-collected money also remains:
  verified evidence AND a persisted confirmed settlement before recognizing
  commission entitlement. Receipt approval alone does not satisfy settlement.
- No automatically funded pharmacy discount, Feniq-funded credit or repricing of
  historical entries. Warehouse-approved credit remains its contractual risk.
- The owner has approved software implementation of the new model. Feniq reps
  record their collections; Ammar/Feniq accountant approves. Warehouse collections
  are manually entered and approved by its accountant. Existing warehouse-employed
  reps must not be inferred to be Feniq employees from their role alone.
- Feniq remits warehouse net funds within 24–48 elapsed hours of actual cash
  receipt, never the later approval time. Early transfer is allowed. Warehouse
  collections settle Feniq commission weekly; no weekday/cutoff is yet specified.
- Pharmacy return requests: within 24h of actual delivery. Approved goods value
  goes to a future invoice/exchange or immediate exchange, without double use.
  The confirmed known return commission reduces future entitlement, or becomes
  a linked offset in the next settlement after prior settlement. Example:
  original commission10000 minus returned commission2000 leaves8000.
- The overlap of partial collection and partial return still requires a reviewed
  allocation treatment. Do not infer returned commission from goods-credit names
  or choose a formula silently. Weekly calendar configuration also remains unset.

## Additive records for NEW v2 orders only

| Record | Required immutable content |
| --- | --- |
| Contract version | warehouse, effective interval, original commission basis/rates, geographic rule, delivery agreement, decision reference, approver/time |
| Order/invoice snapshot | contract version, pharmacy/rep attribution, currency and frozen FX, eligible base and commission, geographic class, schemaVersion=2 |
| Receipt allocation | posted receipt, invoice, allocated original currency and integer SYP equivalent, original FX reference, actor/time, idempotency key |
| Commission event | accrual/reversal kind, original receipt/allocation/contract references, eligible cumulative collection, Feniq/rep integer amounts, actor/time/reason |
| Settlement version | warehouse, linked goods/cash/commission/fee/transfer references, discrepancies, approval and receipt confirmation |

Do not add a second receipt or debt reduction when allocating an existing receipt.
Do not infer allocations for old unallocated receipts. References must belong to
the same warehouse/account; the authenticated actor, not the request body, owns
the authorization scope. Feature entitlements never replace accounting roles.

## Posting and concurrency

1. The existing payment/ledger service posts a receipt once, reducing pharmacy
   debt and increasing the correct cash custody where applicable.
2. Select invoices FIFO and validate allocations against the receipt's unallocated remainder and each
   invoice's current eligible remainder. Reject negative, duplicate, foreign-tenant
   or excessive amounts; show unapplied cash instead of inventing credit terms.
3. Serialize receipt allocation, relevant invoice changes, returns and payment
   reversal on the existing account boundary within one MongoDB transaction.
   Unique idempotency indexes are required before enabling the writer.
4. Persist allocation plus commission event atomically. Keep all ledger/cache
   writes inside ledger.service. Publish notifications only after commit.
5. A lost response/retry returns the original result; the same key with a different
   normalized payload is a conflict. Do not silently generate a new key on retry.
6. Use cumulative integer-SYP rounding as in the preview; derive incremental
   amounts from cumulative entitlement so partial collections reconcile. Never
   recalculate a frozen event using today's FX or a changed contract.
7. Collection evidence enters pending review and cannot earn commission
   until persisted approval by the authorized accountant. No client-supplied
   boolean can substitute for the authorized approval record.
   For warehouse collection, a persisted confirmed settlement is additionally
   required by the approved policy; approval must never bypass that prerequisite.
8. Corrections append linked reversal/correction events with actor, time and
   reason. No edit/delete of approved money. Cash custody transfer settles custody,
   not the pharmacy debt again. A sent transfer and confirmed receipt stay separate.

## Interface additions remaining before live posting

These endpoints are proposed, **not existing callable production APIs**:

- Account-scoped FIFO allocation preview/submit: receipt + server-selected oldest invoices,
  expected account revision and stable idempotency key; returns applied/unapplied
  amounts, immutable allocation IDs, resulting revision and event references.
- Warehouse collection evidence submit/review: attachment/reference and the
  explicit authorized approval action; no automatic approval or external message.
- Settlement draft/approve/confirm-receipt: linked transaction IDs, discrepancies,
  expected revision and mandatory reasons; no rewriting of an approved settlement.

Admin gets cross-warehouse operational review; accountants operate only their
warehouse; owner accounts monitor and keep their current cash-posting denial.
Pharmacies see their own invoices/receipts; reps get no new collection or global
access through this specification. Mobile screens use server figures and show
pending/unapplied/reversed states explicitly. None of these depend on Drive.

## Delivery sequence and mandatory acceptance

1. Preserve the owner-confirmed rules above. Isolate the mixed partial-return
   case and configure a weekly calendar before enforcing weekly due dates.
2. Add records/indexes and preview/read endpoints with no writer activation.
3. Implement account-serialized posting, immutable corrections and warehouse
   evidence review in an isolated environment. Preserve all v1 read/write behavior.
4. Add settlement reconciliation and the matching accountant/admin UI.
5. Run full/partial and multi-invoice receipts, retries after server commit,
   concurrent allocation/reversal/return, expired sessions, currency/rounding,
   rate changes after order, cross-tenant attacks, custody transfers, and returns
   both before and after a prior settlement. Reconcile events to ledger totals.
6. Required independent money-reviewer approval, reversible rollout and separate
   live activation authorization. No historical financial migration.

Rollback disables only the new writer and preserves all records; do not delete
v2 events, replay receipts as new payments, restore a database, or reinstate the
subscription paywall for core account operations.

## Implemented 2026-11-06: deterministic policy core

`collectionAccountingPolicy.js` implements FIFO planning, cumulative collection
entitlement, known return-commission corrections and actual-cash transfer clocks.
`POST /api/admin/commission-policy-preview/accounting` exposes these calculations
with `previewOnly:true,persisted:false`. It is NOT a receipt approval or a writer.
The earlier preview endpoint remains backward-compatible. Manual allocation
drafts are superseded by the approved FIFO policy. Its warehouse proof-plus-
settlement prerequisite remains approved; request booleans are calculation
assumptions and must never be reused as live authorization.

Posting remains incomplete: no v2 order cutover, persisted proof workflow, FIFO
allocation writer, commission journal, new settlement writer or client rollout
is claimed. This staged change does not activate the old engine under a new name.
