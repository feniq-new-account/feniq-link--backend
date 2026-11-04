# Feature Control Center — implementation/rollout contract

Business authority: [Notion decisions](https://app.notion.com/p/40e6c91cc9c481e4bc0ef8e47a7426e9).
Technical inventory is in [FEATURE_CATALOG](FEATURE_CATALOG.md); pricing and
final package definitions are intentionally absent.

## APIs (all paths below /api)

| Method/path | Caller | Effect |
| --- | --- | --- |
| GET /admin/feature-control | Active admin | Global flags/revision and technical key catalog |
| PUT /admin/feature-control | Active admin | Merge optional flags with expected revision/reason |
| GET/POST /admin/feature-control/bundles | Active admin | Read/create immutable approved definitions; no charge |
| GET /admin/feature-control/audit | Active admin | Latest 100 audited changes, not a complete export |
| GET /admin/warehouses/:id/entitlements | Active admin | Decisions, source grants and warehouse revision |
| POST /admin/warehouses/:id/entitlements/grants | Active admin | Issue finite bundle/add-on/grant rights with reference |
| POST /admin/warehouses/:id/entitlements/grants/:grantId/revoke | Active admin | Revoke with revision/reason; preserve original evidence |
| GET /warehouse/entitlements | Active warehouse member | Own effective decisions and self-configuration, no admin grant metadata |
| PUT /warehouse/entitlements/configuration | Owner/legacy combined account | Only preference booleans, expected revision and reason |

The admin center is on the existing warehouse-access page; select a warehouse,
then open Feature Control Center. Owner preferences are on warehouse settings.
Global flag labels explicitly say they affect ALL warehouses. Dates entered in
the UI use device time and are transmitted as ISO instants. No payment form or
checkout activation is added here.

Writes atomically save the record and audit event in a Mongo transaction.
Concurrent revisions return 409 FEATURE_CONTROL_CHANGED; reload and inspect
before another save. Bundle contents cannot be edited in place: publish a new
code; issued grants retain their snapshots. Advanced bundles always include
ownerMobileAccess. Add-ons with overlapping coverage from an existing explicit
grant are rejected, regardless of bundle/standalone source. No money is charged
by any of these endpoints; a future checkout/billing service must also check
campaign/paid eligibility and prorated coverage before invoicing.

## Additive data and compatibility

- Collections: FeatureBundle (unique code), WarehouseFeatureControl (unique
  warehouseId, revision, configuration, bounded 200-entry grant history), and
  FeatureControlAudit (actor/scope/reason/before/after/time/revision).
- PlatformSetting key featureControl holds optional global flags and revision.
- WarehouseSubscription adds revision and free plan/status. Old labels, stored
  trial dates and paid rights are retained. GET never creates a trial.
- Legacy admin subscription PUT now requires revision to reject stale writes;
  deploy the accompanying web form together. Old pharmacist/auth/order payloads
  retain compatibility. This is not a financial or identity migration.
- No production script, backfill, seed, billing record or account merge is run.
- Basic cash and correction no longer pass through the accounting paywall;
  accountant authorization, tenant scope, amount/FX validation, transactions,
  idempotency and immutable ledger logic are unchanged.

## Boundaries and rollback

Not production-ready merely because tests pass. Preserve existing API, DB,
applicationId and certificate. Publish only after the existing launch gates and
authorization. Owner-mobile channel enforcement and advanced-accounting scope
remain pending; grant metadata does not create a finished product.

Rollback runtime/web as a matched release retaining the pharmacist checkout
guard and core financial access. Keep new collections/fields/audits; do not drop
indexes or restore production as a routine rollback. Old feature evaluators
ignore grants, so a rollback after granting contractual access requires a
compatible forward fix or an explicitly reviewed entitlement export/reconciliation.
Before deployment, verify a rollback artifact with these protections. No source
rollback can undo already-installed Android build numbers; this batch builds no APK.
