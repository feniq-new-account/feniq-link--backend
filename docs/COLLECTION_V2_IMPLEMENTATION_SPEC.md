# Collection v2 implementation contract — pending business gates

Authority: [approved Notion decisions](https://app.notion.com/p/40e6c91cc9c481e4bc0ef8e47a7426e9).
This is an implementation specification, not an activated financial engine.
Current calculators remain previews; historical v1 orders/ledger are unchanged.

## Decisions and activation gate

- City: split the original rep commission 50% Feniq / 50% assigned rep.
- Rural and city_ring: original rep commission 100% Feniq. Delivery charges
  remain a separate explicitly contracted amount, never inferred or invented.
- Manual receipt entry is approved. **Manual invoice selection/allocation is a
  proposed design, not part of that approval.** Ratify it before live posting;
  the proposal shows unapplied cash and never infers an invoice commission.
- Accrual follows eligible actual collection, proportional to partial collection.
  Warehouse-collected money additionally needs verified evidence and settlement.
- No automatically funded pharmacy discount, Feniq-funded credit or repricing of
  historical entries. Warehouse-approved credit remains its contractual risk.
- **Unresolved business rules:** return commission before/after settlement,
  evidence approval roles/disputes and invoice allocation policy. Keep activation
  disabled while these are unset. Owner approval of development is not approval
  of them. Existing integer/cumulative rounding is subject to technical money
  review and reconciliation, not an invented fee or commercial rate.

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
2. Validate allocations against the receipt's unallocated remainder and each
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
7. Warehouse-collected evidence enters pending review and cannot earn commission
   until the approved evidence/settlement prerequisites are met. No client-supplied
   boolean can substitute for the authorized approval record.
8. Corrections append linked reversal/correction events with actor, time and
   reason. No edit/delete of approved money. Cash custody transfer settles custody,
   not the pharmacy debt again. A sent transfer and confirmed receipt stay separate.

## Interface additions to implement after approval

These endpoints are proposed, **not existing callable production APIs**:

- Account-scoped allocation preview/submit: receipt + selected invoice amounts,
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

1. Ratify the unresolved Notion decisions and the exact posting/rounding examples.
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
