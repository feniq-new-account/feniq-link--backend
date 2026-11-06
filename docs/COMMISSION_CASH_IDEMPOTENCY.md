# Platform commission cash safety (2026-11-06)

This hardens the existing warehouse↔platform cash record and reversal. It does not activate a rate, migrate historical balances, post a pharmacy ledger entry, or prove a transfer to the warehouse occurred automatically.

- `POST /api/admin/commission/collections` and `POST /api/admin/commission/collections/:id/reverse` now require `idempotencyKey` (nonempty, at most100 characters). Service callers use the same requirement.
- New cash/payout request: normalized actor, warehouse, actual positive safe-integer SYP magnitude, direction, method, covered period and trimmed reference/note are bound to the key. The warehouse/key unique index prevents concurrent duplicate insertion.
- Reversal request: normalized actor, target and required reason are bound to a globally unique reversal key; status changes once by CAS. Historic original cash magnitude remains intact.
- Replay returns200 and `Idempotent-Replay:true`; different content under the same key409. Missing key400. Inactive/non-admin callers403, including direct service calls.
- The record/reversal and financial audit commit in the same Mongo transaction. Audit failure rolls back the financial operation.
- Browser forms reuse account-scoped persisted keys after lost responses, closing/reopening and failed post-write refresh. Confirmed success releases only that request's key. A new explicit payment may legitimately have identical cash details and uses a new key.
- Legacy documents without keys remain readable/reversible, without adding keys or changing amounts retrospectively. Partial unique indexes ignore absent/null keys and are created by the financial boot check.

Validation: synthetic concurrent recording/reversal, fingerprint collisions, canonical ObjectId casing, actual HTTP replay, denied warehouse user, safe-integer validation, audit-failure rollback, business-day periods, discount-code payouts, pharmacy ledger isolation, and browser retry/reopening tests. Final test/CI counts are recorded in the PR; directed tests overlap full suites.
