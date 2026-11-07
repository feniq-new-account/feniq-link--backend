# Feniq financial readiness audit — 2026-11-08

**Status: NOT approved for full production collection_v2 activation.**

Scope: read-only inspection of GitHub main, the actual Render API/Web deploy commits, MongoDB Atlas `feniq` database, Flutter manager widget branch, and exchange-rate provider contract. No production financial writes, contract activation, or deployment were performed.

## Live baseline

- Render API `feniq-connect-api`: live commit `218278e0512735dc7e117a0bc5ce76c72a951197` (financial operator UI #102 backend). Render Web: `bf00e40fb9049e456a578d5d7094db9be6ae944a`. Both services `autoDeploy: no`.
- **Three warehouses** have no explicit active `collection_v2` engine; **zero** `collectioncontracts` and **zero** `collectioninvoices`, `collectionallocationruns`, `collectionrecognitions`, `collectionsettlements`, `feniqcollectionreceipts`, `feniqcashcustodies`, or `feniqremittances`. Any display claiming earned collection_v2 cash or a live verified remittance would be false.
- **22/22 ledger accounts** reconciled (aggregate sum of signed `ledgerentries.amountSyp` equals `balanceCache.syp`; account `seqCounter`, `lastEntrySeq`, max entry sequence and count agree). **115 ledger entries** checked; mismatches **0**.
- **28/28 Payment** rows linked to canonical `LedgerEntry` of kind `payment` with exact matching amount and `source.paymentId`; mismatches **0**.
- **63/63 delivered Order** rows linked to exactly one `charge` `LedgerEntry` of exact matching `finalPrice`; missing/amount mismatches **0**.
- These verifications are read-only consistency checks, not an opinion on the legitimacy of real-world receipts, recipient identities or the economic correctness of the input transaction. Existing orders are predominantly `legacy_delivery` or pre-versioned; they must **never** be silently migrated.

## Exchange rate: live stored state and source contract

- MongoDB `exchangerates/singleton`: `usdToSyp: 144.625`, `source: api`, `manualOverride: false`, `lastUpdated: 2026-11-07T09:00:00.109Z`.
- Append-only rate history shows successive API-sourced changes including `143.875 → 144.625` at `2026-11-07T09:00:00Z`. Thus the scheduled provider update has historically worked; **a live network fetch of LiraScope was not confirmed** from the audit runtime.
- `backend/src/services/exchangeRate.service.js` fetches `/api/v1/rates/latest?currencies=USD`, extracts `marketRates[currency='USD'].mid`, validates source timestamp (max 7-day age), skips writes on manual pin, and retries temporarily on network failure.
- `GET /api/exchange-rate` requires authentication and reads the Mongo singleton; its response reveals `usdToSyp` only. It does **not** call LiraScope on each request.
- **Denomination gate:** the source and existing platform represent **new SYP** (2026 redenomination). The official 100:1 conversion means `144.625 new SYP/USD` is equivalent to `14,462.5 old SYP/USD`. The original ledger and all invoices must remain immutable in the unit frozen when created. Never multiply existing values by 100 to “fix” display without verified currency unit history and owner approval. Rates differing 100-fold should be rejected by an informed operator, not silently guessed.
- No live FX provider authentication, public endpoint latency, or rate freshness under an actual provider outage was proven in this audit; those remain acceptance checks.

## Accounting implementation readiness

- New money engine, FIFO, returns, commission splits and corrections, warehouse weekly settlements, Feniq collection receipts, custody, remittance, independent reversal/confirmation and web operator flows have merged code and isolated automated tests (#65, #66, #77, #78, #80, #89, #100, #102). **Merged does not equal production-activated.**
- Draft #93 remains open and superseded in functionality by merged #100; do not merge overlapping money writers without checking branch ancestry.
- Feniq receipt writes default OFF through `FENIQ_COLLECTION_RECEIPTS_ENABLED`; production value not independently read. Explicit scoped grants, different record/approve actors and an independent warehouse accountant are required.
- `/warehouse/balances` and `/warehouse/balances/summary` are **canonical existing ledger** account/balance APIs, not invalid legacy raw balances. These remain correct even while collection_v2 is enabled; commission journal `GET /warehouse/collection-accounting` is separate and only returns v2 data when that warehouse has an active contract.
- Flutter manager `WarehouseAccountsTab` previously rendered only canonical ledger summary; draft [PR #107](https://github.com/feniq-new-account/feniq-link--backend/pull/107) adds a **read-only**, server-source v2 journal section with explicit inactive state, separate selected-period accrual vs all-time return-credit/invoice states, and stale read clearing. It preserves ledger debts and existing role-gated payment path. Draft until Flutter CI success and independent review; do **not** distribute a new pharmacy APK.

## Required go/no-go gates before real-money activation

1. Resolve UI PR #107 Flutter tests and independent financial UX review; retain pharmacy version 1.1.0 build1147 unchanged.
2. Stage against **isolated persistent data**, create exact contracts with signed commercial terms, selected warehouse only, and verify staged indexes / backup-restore. Test new orders while old orders stay `legacy_delivery`.
3. With **named scoped users**, verify both collection paths: warehouse recorder + independent accountant approval and Feniq recorder + different approver; partial cash, reversal and duplicate idempotency keys, no double Payment/LedgerEntry; FIFO and applied return credits (non-cash), signed commission correction, treasury 24-hour target and 48-hour deadline anchored to **actual cash receipt time**.
4. Demonstrate source-backed net remittance, independent warehouse accountant confirmation, held Feniq commission vs payable warehouse net, exact protected reversals; blocking unknown net is correct, **not** a value of zero.
5. Independently verify public provider availability, currency unit/new-vs-old display and stored quote freshness. Verify how to handle last-known rate after >48h outage without repricing historical invoices.
6. Explicit owner go/no-go for **manual** production API/Web deploy and financial contract/feature activation; never change production money, authorization, percentages or historical balances merely because this document exists.

## Evidence

- Live MongoDB read-only aggregation performed 2026-11-08, counts and differences above.
- Render deployment metadata and GitHub merged PRs, inspected same date.
- `docs/FENIQ_CUSTODY_ACCEPTANCE.md` for source blockers and recovery/activation gates.
- `docs/COLLECTION_V2_ENGINE_DELIVERY.md` for staged invoicing/recognition semantics.
- Official Syrian redenomination notice: https://sana.sy/en/presidency/2286703/
- LiraScope API contract: https://lirascope.syria-cloud.sy/ar/api-docs
