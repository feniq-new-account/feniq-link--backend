# Payment HTTP safety — 2026-11-06

POST /warehouse/payments and POST /warehouse/payments/:id/reverse now require a
nonblank idempotencyKey (existing maximum100 characters). Missing/null/blank keys
return400/IDEMPOTENCY_KEY_REQUIRED before posting. Invalid type/overlength keys
return400/INVALID_IDEMPOTENCY_KEY. Reversal needs its own key. The existing
fingerprint/scoping, transaction, audit, balance posting and replay behavior are
unchanged. Internal service compatibility is retained; this hardens the HTTP
boundary used by clients, not the monetary processing policy.

Current React payment forms retain a key across retries; current Flutter passes
a required key through its durable payment request queue. No client change is
necessary. An outdated client that omits the key will fail closed rather than
risk a duplicate receipt; verify supported clients before production deployment.
No new API can grant Admin or Owner warehouse cash rights.

Validation: payment idempotency, financial endpoints, warehouse access and launch
journey suites49/49. New HTTP tests prove no Payment/Ledger/Audit/cache mutation
on invalid/missing keys, one receipt for five concurrent retries, and rejection
of owner/admin/pharmacy/rep/driver recording and reversal. Existing replay,
conflict and cross-warehouse isolation tests retained. Synthetic data only.

Permission enforcement is attached explicitly to create/reverse actions. Case
variants accepted by Express cannot bypass Owner restrictions via the existing
case-sensitive URL heuristic. Role permission definitions are unchanged.

Independent isolated reproduction confirmed the original router returned403 on
the canonical Owner request but201 on uppercase /api/WAREHOUSE/PAYMENTS. The
action permission guard now returns403 on both; mixed case and query suffixes
are regression-tested without financial mutation. No production data was used.
