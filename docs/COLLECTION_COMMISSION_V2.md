# Collection commission v2 — calculation implemented, posting not enabled

Authority: [Notion decisions](https://app.notion.com/p/40e6c91cc9c481e4bc0ef8e47a7426e9).
Owner confirmation in this session: city_ring is rural/outside; cash is manually
entered. Subsequent owner confirmation2026-11-06 approves automatic FIFO for
new receipts, the receipt approval roles, return offsets and remittance timing.
No bank integration is introduced.

## Implemented boundary

`backend/src/utils/collectionCommissionPolicy.js` is a calculator, not a ledger.
`POST /api/admin/commission-policy-preview` is admin-only and no-store; it returns
`previewOnly: true, persisted: false`. Supplied inputs are calculation assumptions,
not verified receipts or approved live contracts. No order, payment, allocation,
pharmacy credit or settlement is changed. The financial engine remains legacy.

Terms snapshot: version, SYP invoice due, original commission amount, explicit
area classification, contract reference and a separately specified delivery fee
or null. No assumed rates/fees and no conversion using a current FX rate. Live
terms must come from agreed contracts and frozen invoice-line valuations.

City: 50% Feniq / 50% rep. Rural/city_ring: 100% Feniq / 0% original rep share.
No pharmacy reward. Entitlement is proportional to collection; zero earns zero.
Warehouse collection needs a proof reference AND settlement confirmation before
the preview shows eligibility. Live posting needs persisted, verified evidence.

`previousEligibleCollectedSyp` means already-confirmed eligible collection, not
previously typed/unverified money. Cumulative rounding uses integer SYP and BigInt
intermediates, half-up, with rep as the residual after Feniq's share. Deltas
telescope across partial amounts. This tested technical convention still needs
acceptance with the final financial posting specification.

Manual allocation drafts preserve chosen invoice IDs/amounts, reject negative,
duplicate or oversized allocations, and expose unapplied cash. They do not check
a live invoice's remaining debt or persist allocations. Old unallocated receipts
are not retrospectively assigned to invoices.

## Confirmed rules implemented as calculations — 2026-11-06

The additional admin-only, no-store endpoint
`POST /api/admin/commission-policy-preview/accounting` accepts any subset of:

- `fifo:{accountId,paymentSyp,invoices:[{invoiceId,accountId,deliveredAt,outstandingSyp,engine}]}`.
  Oldest delivery first, stable ID tie-break; legacy debt is not skipped.
  `engine` is `legacy` or `collection-2026-11-06`. Unknown historical allocation
  cannot be supplied as a guessed outstanding balance to a future live writer.
- `collection:{terms,previousCollectedSyp,collectedSyp}`. Integer cumulative
  original/Feniq/rep increments; delivery fees remain separate.
- `return:{terms,collectedSyp,previousReturnedCommissionSyp,returnedCommissionSyp,settlementId?}`.
  Known frozen return commission reduces potential before collection, corrects
  unsettled entitlement after full collection, or offsets the next settlement
  referencing the original. Mixed partial collection/return returns409
  `PARTIAL_RETURN_REVIEW_REQUIRED`; no guessed goods-to-commission allocation.
- `remittance:{collector,paidAt}`. Feniq gets target24h/deadline48h from actual
  cash time with early transfer allowed. Warehouse gets weekly cadence with
  no invented weekday or rolling seven-day due date. Timestamps require an
  explicit timezone. Approval dates cannot reset the clock.

Every result remains `previewOnly:true,persisted:false`. This is executable
policy arithmetic, not activation of accounting writes. Existing preview
contracts remain compatible; their manual drafts and eligibility booleans are
legacy assumptions and must never authorize a live financial operation.

## Remaining before live v2

1. Persist the approved evidence-review workflow: Feniq rep records and Ammar/
   Feniq accountant approves; warehouse manual collections need its accountant.
   Recording and approval are one receipt, not two debt reductions. The old
   preview still rejects `returnPending`; the new calculator supports the known
   return cases while refusing unapproved mixed partial-return formulas.
2. Persist versioned contracts and per-line/invoice snapshots on NEW v2 orders.
   Never reinterpret legacy orders or recalculate their earned credit.
3. Persist immutable FIFO allocations referencing same-tenant posted receipts,
   invoices and frozen FX. Serialize at account level so allocation, invoice edits,
   returns and payment reversal cannot race into an inconsistent result.
4. Add immutable accrual/reversal events with original references and stable
   idempotency keys. Receipt settles pharmacy debt once; custody transfer never
   settles it a second time.
5. Build v2 reconciliation separating principal, commission and delivery fee;
   preserve legacy reports and do not mix delivery-based v1 with collection v2.
6. Test lost responses, retries/concurrency, partial multi-invoice payments,
   sessions, returns before/after settlement, FX and rounding, with independent
   money review before merge and explicit activation approval.

No financial migration, live allocation writer or accrual activation is included.
Reverting this calculator/API has no effect on persisted money.
