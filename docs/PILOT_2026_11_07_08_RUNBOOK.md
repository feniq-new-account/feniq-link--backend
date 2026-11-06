# Feniq Nov 7–8 pilot: deployment and reset safety gates

Owner authorization: temporary ordering for warehouse pilot, reuse legacy demo catalog and offers, admin order toggle, safe reset/restore. **This document does not authorize deleting data without a fresh confirmation at execution time.**

## Verified observations (2026-11-06)
- Render API: `feniq-connect-api`, auto-deploy off; latest observed live deploy SHA `2955c1e1c86c8fb618673de155e8af445a2f9339`. Main has moved beyond it. Never assume a main-only change is live.
- Existing `backend/src/services/demoSeed.service.js` has three Latakia warehouses: النجاح, الشفاء, الأمل, products and introductory offers. Its catalog initializer returns immediately when *any* warehouse exists; rerunning startup will **not** restore missing warehouses.
- `demoFeatures.service.js` creates orders, returns, payments, banners and advertised packages. **Do not invoke it as a catalog-only restoration.** It may produce ledger entries.
- `demoQuarantine.service.js` blocks known public-password demo accounts on production. Never re-enable or distribute shared demo credentials.
- `backend/scripts/seed-launch-preview.js` explicitly refuses production; do not bypass its guard.

## Actual database findings (2026-11-06)
- Connected Atlas project `Project 0`, `Cluster0` (Free/M0), database `feniq`: 3 existing warehouses, 352 products, 61 offers, 7 banners, 3 advertised packages, 92 old orders and 109 ledger entries. All 3 warehouse accounts were blocked; their warehouse documents were inactive and subsequently reactivated by the owner-authorized operator. Account credentials remain blocked; password resets must run through the authenticated admin panel with audit and password change on next sign-in.
- **Do not run a catalog seed or fabricate new financial history**: the historical demo stock is already present. Admin identity exists; do not reactivate old public-password demo admin.
- Free/M0 Atlas backups: optional daily snapshot service is in gradual private preview and does not support on-demand snapshots. Do not assume this project has the option. Source: https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/
- **An encrypted backup system already exists in this repo**: `.github/workflows/db-backup.yml`, `backend/scripts/backup/backup.sh`, `snapshot.js`, `restore.sh` and `verify-restore.js`. Its scheduled job claims daily 00:23 UTC snapshot → GPG encryption → isolated restore drill → private GitHub Actions artifact. **Source code alone does not prove a successful recent run, configured secrets or a downloadable validated backup**. Check the latest actual job, the restore drill result, integrity checksum and availability of the decryption key.
- If the GitHub job is not verified, run the repo's existing `backup.sh` under an approved host with secrets and validate via `restore.sh` into an isolated database. Standard `mongodump` / `mongorestore` is an alternative: https://www.mongodb.com/docs/database-tools/mongodump/
- Never run Monday cleanup unless an independently verified restorable backup exists. Backup archives belong in controlled encrypted private storage or restricted Actions artifacts, never in repository source or a public website.

## Pilot release gates
1. Read-only audit of deployed database: warehouse count/IDs, product/offer/banner/package counts, pharmacy/warehouse users, role permissions, admin flags, order counts, and financial dependencies. Record counts without PII.
2. Take a **verified** MongoDB backup/snapshot; record timestamp, restore procedure, and private storage location. Restore to an isolated database to prove it is usable.
3. Implement explicit, idempotent catalog-only restore, keyed by stable demo identities, preserving existing user passwords and IDs. Use unique credentials provisioned privately for test accounts. No real prices or stock guarantees; visible DEMO labeling.
4. Implement server-side order gating, not only Flutter UI gating: pilot allowlist for authorized pharmacies/warehouses, time-box through Nov 8 local time (Asia/Damascus), and manual admin stop. Public launch remains admin-controlled. Test unauthorized account rejection.
5. Implement maintenance controls behind admin authorization + audit + two-step confirmation. Preview exact counts/dependencies, require a recent verified backup, execute only explicit scoped cleanup, preserve admin/system settings, and provide a **tested** restore workflow. Never expose a one-click global delete endpoint.
6. End-to-end test: real APK pharmacist account -> products/offers/cart -> order -> warehouse dashboard -> accountant dashboard -> status updates; verify tenant isolation. No external fulfillment or financial collection.
7. CI green, review code differences and migration/backup compatibility, manually deploy API/web only after validation. Auto-Deploy stays off. Verify phone APK points to the deployed API.

## Monday Nov 9 cleanup (NOT authorized to run now)
- Stop new orders and lock pilot test accounts.
- Capture final audit and verified backup.
- Show dry-run cleanup manifest (warehouse/product/offer/package/banner/order/return/payment/ledger and dependent records) for owner approval.
- After explicit approval, execute scoped transactional cleanup, verify no orphan references and empty customer-facing catalog, retain admin/config and backup.
- Re-test sign-in, browsing empty state, and admin ability to add a real warehouse.

## Coordination
Do not edit accounting, payment, commission, ledger, or Codex-owned PR #64/#66 without coordinating ownership. If dependent cleanup cannot be safely completed without those modules, **block deletion** and escalate rather than leaving inconsistent records.

Tracks #70.
