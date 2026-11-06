# Warehouse cash receipt evidence — 2026-11-06

Authority: [owner decisions](https://app.notion.com/p/40e6c91cc9c481e4bc0ef8e47a7426e9).
Manual warehouse cash entry is followed by its accountant's proof approval.
This increment adds that evidence/review workflow to an EXISTING posted payment.
It does not activate collection-v2 commission or change how that payment posts.

## Contract and roles

- `GET /api/warehouse/payments/:id/proofs?before=<revision>`: active warehouse
  members, including owner;50 newest records per page, `hasMore/nextBefore/asOf`.
- `POST /api/warehouse/payments/:id/proofs`: existing `paymentRecord` permission;
  body `{proofReference,note?,idempotencyKey}`. New revision only if the previous
  proof was rejected. A pending/approved proof cannot be replaced.
- `POST /api/warehouse/payments/:id/proofs/:proofId/review`: NEW permission
  `paymentProofReview`, requiring an explicit active warehouse accountant;
  body `{decision:'approved'|'rejected',reason?,idempotencyKey}`. Reject needs a
  nonblank reason. Exactly one immutable review per proof.

Owner monitors; legacy combined login can submit evidence under its existing
cash permission but cannot gain the new approval permission implicitly. Admin,
pharmacy and rep cannot review warehouse receipt proof. Tenant is derived from
current authenticated membership; body cannot supply warehouse, amount, FX,
paidAt, collector or an approval boolean. Services recheck role/status/scope in
the transaction even when called without HTTP.200+`Idempotent-Replay:true` is a
replay;201 is a new event; changed payload under a key is409. ObjectIds are
canonicalized before fingerprints. All HTTP results are `Cache-Control:no-store`.

`proofReference` is a manual evidence reference, not an uploaded document or an
automatically verified bank receipt. No URL fetch, attachment integration or
external message is performed. The authorized accountant verifies evidence.

## Financial invariants

- Evidence references the same tenant's posted settlement Payment AND matching
  `payment` LedgerEntry/account/pharmacy/source/amount. No matching ledger
  source or a reversed payment cannot acquire new proof/review.
- Frozen amount/FX/actual `paidAt` are copied from the existing Payment. Review
  time never replaces cash time. No live FX conversion is performed.
- No Payment, LedgerEntry, commission, custody transfer or balance is created
  by proof submission/review. `financialPosting:false` declares this boundary.
  Approval is not another debt reduction.
- `ledger.lockAccountForFinancialChange` writes `financialRevision` on the same
  account document used by all financial posting. It requires a transaction.
  It does not issue an entry sequence, alter balanceCache or lastActivityAt.
  Proof/review/audit and this lock commit or roll back together. Reversal and
  review therefore serialize against the account's existing monetary writer.
- PaymentProof and PaymentProofReview are append-only through their service.
  Rejection followed by corrected evidence appends a revision and preserves all
  old proof/decision rows. No UPDATE/DELETE HTTP interface exists.
- A later payment reversal preserves a historical approval but makes it
  ineffective. The read snapshot returns `paymentStatus` and `effectiveApproval`;
  a replayed approval response is a historical fact, not current effectiveness.
- Unique indexes for warehouse/key, payment/revision and proof/review are built
  before HTTP startup by the existing `ensureFinancialIndexes` boot path.
  A deployment with index conflicts must fail boot; never bypass the indexes.

The warehouse statement payment row opens a translated proof dialog. It displays
server values/cash time/update time; owner, reversed-payment, historical-report
and older-history views are read-only. Failed reads/uncertain write responses
hide old facts until refresh. Durable account-scoped keys prevent retry duplication.

## Explicit remaining scope

This is warehouse-collection evidence only. Existing Rep profiles represent
warehouse-employed reps; their role does not establish employment by Feniq.
Feniq collector identity/grants and the narrow Ammar/Feniq-accountant proof
workflow still need implementation. Do not give Admin general warehouse cash
authority to bridge that gap.

No v2 contract/order snapshots, invoice allocation, accrued commission journal,
return-credit reuse, settlement cutover or production activation is included.
An approved proof on a legacy payment never authorizes retrospective FIFO or v2
commission. No old entries are migrated and the launch checkout gate is unchanged.

Validation uses isolated Mongo replica sets and synthetic receipts: tenant/role
attacks, exact frozen amounts, retry after commit, concurrent same-key and
contradictory reviews, rejection/resubmission, invalid ledger source, audit rollback,
concurrent payment reversal and cache replay. React covers permissions, historical
and reversed states, exact request shape, failed connection and durable retry.
