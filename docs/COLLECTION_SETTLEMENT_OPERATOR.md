# Collection contract and weekly settlement operator controls

Incremental delivery after PR77/PR78. Decisions are approved; this provides the actual admin workflow for the warehouse-collector path, without authorizing generic pharmacy payments to Admin.

In the existing admin commission warehouse detail:

1. Open contract revision, enter an approved agreement reference and explicitly confirm new-orders-only. The backend captures existing agreed rep rates. Delivery fee is explicitly null when unspecified; no invented fee/rate. Old invoices/FX are unchanged. Subsequent rate updates need a new revision for future orders.
2. Choose the actual weekly receipt period and refresh. Current source timestamp and applied server period are shown.
3. Select approved warehouse receipt proofs not already recognized. The paginated backend projection joins real posted Payment, its LedgerEntry, proof/account and post-cutover epoch. Old receipts, reversed receipts and already-settled proofs are excluded. Warehouse readers do not receive this platform evidence list.
4. Enter the actual settlement document reference and confirm. Server validation and account locks recheck every source. This records commission eligibility/journal entries, not another pharmacy cash receipt or proof of an actual bank transfer.

Request keys persist after uncertain writes, reopen or failed post-write reads. Figures disappear on read/write failure; stale evidence is not presented as fresh. Date changes do not alter a pending selected settlement until the range is applied, and POST uses the server-applied period.

Read contract extension: admin-only `settlementCandidates` on the existing collection journal response, `{rows,hasMore,nextCursor}`,20 per page. `candidateAfter` is its independent cursor. Each row contains approved review ID, original proof/payment references, actual paidAt/amount, pharmacy and approval reference. Warehouse API rejects this cursor and does not expose these candidates. Confirmation remains the existing idempotent, transactional writer with independent permission and source validation.

Still not full financial activation: explicit Feniq-collector grants/approval/custody and24–48h remittance path, Flutter presentation and isolated end-to-end operational acceptance remain. No production mutation or deployment was performed by these tests/development tools.
