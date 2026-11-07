# Feniq custody: integrated acceptance candidate (2026-11-07)

This completes the cash/remittance cycle begun in draft PR #93 on top of #89
and #97. Source code is reused on an independent branch; #93's moving branch
is not modified. This delivery is for isolated acceptance, not production GA.
`FENIQ_COLLECTION_RECEIPTS_ENABLED` remains OFF by default. Render auto-deploy
must remain OFF. No historical payment, ledger entry, FX or contract is migrated.

## Operational sequence

1. An active admin issues scoped persisted grants in the selected warehouse:
   `record_feniq`, `approve_feniq`, `record_remittance`, `reverse_remittance`;
   `confirm_remittance` is issued only to that warehouse's active accountant.
   Grant eligibility does not treat a warehouse rep as a Feniq employee. Current
   Feniq recording/treasury actors are explicitly authorized platform admins.
2. The collector records integer SYP, actual cash time and an evidence reference.
   Pending evidence creates no pharmacy payment, debt reduction or commission.
3. A different Feniq approver verifies the evidence. The same transaction checks
   BOTH collector and approver grants with `forMoneyPost:true`, posts exactly one
   canonical Payment/LedgerEntry, recognizes cash, rebuilds FIFO and opens custody.
4. Net calculation is automatic. An explicitly granted treasury operator can
   also request a new immutable reconciliation from current sources.
5. The operator records actual transferred amount/time and bank/document reference
   against an immutable reconciliation. It must equal the complete verified
   remaining warehouse liability; one pending cash movement reserves the warehouse.
6. An independently granted warehouse accountant confirms receipt of funds, or
   rejects the evidence with a reason. Sources are rechecked under warehouse and
   canonical account locks. Changed sources require rejecting the pending evidence,
   reconciling again, and recording new evidence. Only confirmation changes custody.
7. Wrong transfers: a granted treasury operator records the full original amount,
   actual return-of-funds time, reference and reason. Independent confirmation
   appends the reversal and reopens custody. Reversal is not a second payment.

Owner accounts can read their own warehouse. Admins read only the selected
warehouse; pharmacists and other warehouses cannot access the custody API.
Admin status alone never grants collection posting or accountant confirmation.
Every mutation checks persisted authorization in the posting transaction.
Read-only checks do not write `authorizationRevision`. Revocation and posting
serialize on the same grant document as required by PR #97.

## Calculation and immutable sources

- Approved physical SYP comes only from linked Receipt → Payment → LedgerEntry.
- The latest complete, chunk-validated AllocationRun is reconciled against the
  account checkpoint, ledger sequence and cached balance. No manual invoice choice.
- Frozen Invoice → Contract version/rate/area/FX is verified. City splits50/50;
  rural/city_ring assigns100% to Feniq. Only eligible actual cash earns commission.
- The existing cumulative integer engine is reused. Differences between successive
  recognized-payment prefixes attribute its exact target to each receipt. This
  includes return adjustments and source-backed credit lineage without new cash.
- Net receipt due = actual cash minus original commission attributable to that cash.
  Both Feniq and representative shares remain separately visible. Warehouse total
  due minus confirmed transfers plus confirmed returned funds is the next payable.
- Immutable reconciliation snapshots retain allocation versions, invoice/charge,
  contract/reference/FX, recognition, commission event and return/credit references.
  Later corrections change the next payable, never an old transfer or snapshot.
- Signed Withholding facts record Feniq commission already physically held; they
  are not a fabricated CommissionCollection or another pharmacy payment. Verified
  commission can be held while a separate net-remittance prerequisite is blocked.
  Returns and qualifying older warehouse receipts append signed corrections.
- Cash commission reports separate signed period movement from current all-time
  cash obligation. Collection/payout is capped by both under the same locks, so a
  historical period cannot collect already-held commission again. Unknown source
  state hides the payable and blocks cash posting; negative credits remain visible.
- Actual cash time controls the24h target and48h maximum. Approval, reconciliation,
  retry and reversal do not restart that clock. Retained commission is separately
  labelled; custody is this earmarked cash stream, not a consolidated treasury GL.

## Fail-closed source prerequisites

A blocked reconciliation is persisted and audited with its source account and
reason. It has `netWarehouseDueSyp:null`, displayed as `—`, and cannot authorize a
transfer. No rate/fee is guessed to make a blocked case look complete.

| Reason | Required evidence |
| --- | --- |
| Legacy opening / legacy allocation | Verified historical settlement terms; no inferred migration |
| Unallocated cash | A real invoice/authorized source for the remainder |
| Nonzero delivery amount | A frozen source and beneficiary; current amount-only contracts do not establish ownership |
| Platform-funded code compensation | Linked reimbursement/settlement evidence preventing duplicate compensation across the separate cash book |
| Missing/mismatched contract, FX, receipt or commission journal | Source reconciliation; no fabricated custody commission |
| Source limits | Bounded batch reconciliation rather than a partial calculation presented as complete |

Ordinary warehouse-funded discounts/offers are already frozen in the invoice
principal. Admin-funded return clawbacks stay frozen in the existing return-credit
record. A source blocker is an expected rejection, not permission to bypass a test
or reinterpret a historical amount.

## HTTP surface

Admin prefix: `/api/admin/collection-accounting/warehouses/:warehouseId`.

- `GET/POST /feniq-receipts`, `POST /feniq-receipts/:id/review`
- `GET /feniq-custody` (existing bounded read)
- `GET/POST /cash-reconciliation`; POST requires `{idempotencyKey}`
- `GET /cash-reconciliation/:snapshotId` (immutable source inspector)
- `POST /remittances`: `{reconciliationId,amountSyp,transferredAt,reference,idempotencyKey}`
- `POST /remittances/:id/reversals`: `{amountSyp,transferredAt,reference,reason,idempotencyKey}`
- Existing `/actor-grants` issue/revoke endpoints provision the scoped actions.

Warehouse prefix: `/api/warehouse/collection-accounting` (own tenant only).

- `GET /cash-reconciliation[/:snapshotId]`
- `POST /remittances/:id/review`: `{decision:'confirmed'|'rejected',reason,idempotencyKey}`

Reads return current source-backed totals, permissions and independent server
cursors `before`, `receiptBefore`, `custodyBefore`. Successful mutation replay
returns200 and `Idempotent-Replay:true`; a different body/key collision returns409.
Cash receipt/transfer/reversal timestamps require a real explicit timezone and
valid calendar date. All amounts are safe whole-lira integers.

## Acceptance and recovery evidence

`backend/test/feniqRemittance.integration.test.js` and the reused #93 receipt
suite run the real HTTP app and services against a disposable MongoDB replica set.
They cover partial/multiple receipts, FIFO/legacy opening, city/rural/ring,
rounding, return-before/after-remittance offsets, credit reuse, discounts/source
blockers, exact FX/retries, concurrent approvals/transfers, both actor/grant races,
independent confirmation/reversal, tenant isolation and no duplicate pharmacy entry.

The recovery test pauses the test-process writer, exports a consistent synthetic
snapshot to a0600 EJSON file, restores to a **new disposable database**, restores
unique indexes, checks all documents/ledger balances/source references and rejects
a duplicate remittance key. Both databases and the temporary backup are removed.
This is an isolated recovery drill; it does not claim to back up production.

Web tests exercise real panel controls, blocked/null amounts, permissions, refresh
failure, storage failure and lost POST responses followed by changed/empty GETs
and reopening. Exact body/resource/key is isolated by account, warehouse and
operation. Unknown replies cannot silently generate a replacement payment.

The existing Flutter financial presentation is preserved: non-cash returned credit
remains non-cash. The Flutter CI test job now also triggers for these backend cash
API changes; its APK build/publication remains disabled for this PR branch.

Independent money review found and fixed delayed withholding across a period
boundary and a null-as-zero trace display. It approved the corrected backend and
money interfaces. Final commit/CI evidence is recorded in the PRs.

## Activation and rollback gate (still required)

- Review the integrated backend+web SHAs and green Backend/Web/Flutter CI.
- Run named-user bank-proof acceptance on isolated persistent staging with only
  synthetic data and the exact intended scoped grants. Qualify every actual
  contract's source prerequisites above; a blocked reconciliation cannot be waived.
- Verify forward additive indexes and backup/restore on that staging snapshot.
- Keep production flag and auto-deploy OFF. Manual production deployment and
  real-money enablement require a separate verified go/no-go; none is performed here.
- Before any financial posting, rollback can revert code with the writer OFF.
  After receipts exist, never roll back to a binary lacking Feniq-payment reversal
  protection; disable new writes and roll forward with the immutable evidence intact.
  No destructive down migration, deleting evidence, or rewriting financial history.
