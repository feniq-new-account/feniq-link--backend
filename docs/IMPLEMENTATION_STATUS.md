# Implementation and release evidence — 2026-11-04

This file distinguishes approved, implemented, tested and deployed. Update the
checkpoint at the end of each implementation batch; never infer deployment from
a green build. Business authority is [Notion](https://app.notion.com/p/40e6c91cc9c481e4bc0ef8e47a7426e9).

Baseline: main `86ebd6d1`; PR12 `65e45cf42dc3df12ade0ce7fe6a54282ac240a59`.
Current integration branch: `codex/admin-permissions-integration`, combining
PR12, PR13 (`cd6d8c5`) and PR14 (`051fd0d7`); main has not moved.
The older foundation checkpoint below describes PR13, not the final integration.

| Area | Baseline evidence | Open acceptance |
| --- | --- | --- |
| Registration/profile/phone alias | PR12 unit/integration CI passed | Physical phone, pending/active, recovery, admin visibility |
| Signed Android update | CI 41830472675; build 1064 over 1049 in Android 15 emulator | Logged-in account over two installs on a real phone |
| Backend/web | CI 41830472752 success at PR12 head | This new branch needs its own checks |
| Checkout | Server default closed; launch setting and idempotent replay | Production setting not inspected; no authorization to open |
| Backup | Disposable replica restore verified in PR12 tests | Current encrypted production backup and isolated restore |
| Hosting/download | Existing API/applicationId/certificate retained | Production access, public permanent link, Syria/no-VPN test |
| Subscription/calendar | Baseline rolling trial, expiry paywall | Implement approved calendar/core/rights without pricing |
| Commissions | Baseline four quarters, delivery accrual | Versioned collection rules; no change to historic records |

Current development delta: [Feature Control API](FEATURE_CONTROL_API.md) and
[collection calculator boundary](COLLECTION_COMMISSION_V2.md). These changes
are development work on the stacked branch, not deployed production behavior.

## Release gates and owners

- P0 merge: money-reviewer review required by CLAUDE.md for order/payment changes.
- P0 publication: authorized production operator validates unchanged API/DB,
  replica/HTTPS/CORS, approval setting, and sparse unique registrationPhoneKey
  using `backend/scripts/check-pharmacist-launch-index.js` before new traffic.
- P0 distribution: physical phone acceptance plus permanent public signed APK.
- P0 backup: production backup restored and verified only on a separate target.
- P0 sales: collection allocation, partial accrual, reversal/return settlement
  policy, concurrency/idempotency and explicit checkout authorization.
- P1 subscriptions: approved calendar, core access, tenant isolation, entitlement
  expiry/revocation and audit; no invented package prices.

Confirmed inputs: city_ring is rural; collection entry is manual. Unresolved:
evidence/approval for warehouse collection, return commission
adjustment after settlement, existing-user owner-mobile rights, post-2026
promotion eligibility and final package definitions. These do not block signup.

## Checkpoints

1. Documentation alignment: these four documents; no runtime or data changes.
   Validation: source links and implementation distinctions reviewed. Rollback:
   revert this documentation commit only. Not production deployment evidence.

2. Pure calendar policy: exact Damascus boundaries, paid-right preservation and
   free core. No DB writes; pure policy plus collection calculation tests: 11 pass.
3. Collection calculation: city 50/50, rural/city_ring 100% Feniq, partial collection,
   warehouse proof/settlement conditions, separate delivery fee and manual
   allocation drafts. Preview only; posting/returns/settlements remain legacy.
4. Feature controls: global flags, immutable bundles, advanced owner-mobile
   inclusion, explicit grants/revocation, owner preferences, backend authorization,
   transactional audit and revision conflicts. Subscription reads no longer create
   trials; basic payment recording/reversal stays available to accounting roles.
   The legacy subscription admin form now sends an expected revision.

## Validation checkpoint for this batch

- Backend foundation/regression run: 51 passed (loyalty, reports, scheduling,
  analytics, subscriptions, controls and calendar). Final affected-file run:
  30 passed, including audit rollback, stale admin writes and preview no-writes.
- Web full suite: 60 files / 513 passed. Final changed-form checks: 5 passed.
  Production build passed; lint has warnings, no errors (existing project warnings).
- Integrated HTTP journey initially retained old trial/cash-paywall expectations;
  revised to the approved promotion/core behavior and passed end-to-end. It
  records/replays/reverses cash, rejects owner posting and cross-tenant reads,
  preserves legacy earned credit and reconciles the immutable ledger after return.
- Browser: Arabic RTL at 390 and 1440 pixels using explicit local API fixtures;
  global-save revision/reason checked, no page exceptions or horizontal overflow.
  This is not live-account, production or physical-phone acceptance.
- Full backend regression and exact-head GitHub CI must be checked on the review
  PR; the initial local full run included the old journey assertion before its
  correction. Do not call that initial full run green.
- No Flutter code/signing/API identity changed; no new APK was built. PR12's
  signed-emulator evidence remains distinct from this branch's backend/web tests.

## Remaining and stop reasons

- Live collection v2 is NOT implemented by the preview: contract snapshots,
  persisted allocation/accrual/reversals and v2 settlement still need the approved
  return/collection-evidence details and money review. No historic financial rewrite.
- OwnerMobileAccess rights exist and are included in advanced definitions; shared
  legacy mobile endpoints are not newly channel-paywalled. Existing-user treatment
  and a coordinated mobile release remain open. Advanced accounting scope and
  final packages/prices are still unapproved in Notion.
- Actual production access/backup restore, Syria public download and physical
  Android account-preserving upgrade remain external acceptance gates. Current
  executor has no production credentials or attached phone; Render is blocked.
- PR12 and this stacked work are not merged or deployed; ordering was not opened.
  New schema/control data is additive; rollback details are in FEATURE_CONTROL_API.

## Admin integration checkpoint — 2026-11-04

The preceding validation is the historical PR13 checkpoint. Current work and
role matrix: [ADMIN_ACCESS_INTEGRATION](ADMIN_ACCESS_INTEGRATION.md).

- Global admin `/admin/features` works without a warehouse. Per-warehouse grants,
  preferences and named audit trails remain linked to warehouse access.
- Shared backend role permissions are returned by login/refresh/me; web and
  Flutter cash controls follow them. Owner accounts read but cannot post/reverse
  cash; accountants and legacy combined accounts retain their existing scope.
- Admin role changes require revision/reason, invalidate old sessions and close
  live sockets only after audited commit. A shared warehouse transaction write
  prevents concurrent downgrades of different owners from removing every owner.
- Owner mobile feature preferences use server-effective rights; preferences never
  grant a subscription. Advanced-accounting and rights-only/limited products are
  labelled so a toggle cannot be mistaken for a complete commercial feature.
- Backup-retention changes from PR14 are integrated: failed restore verification
  retains the encrypted backup/checksum while the run remains failed. No live
  backup job was run here.

Validation of this new delta:

- Backend affected files: **30/30 passed**, including distinct-owner concurrency,
  stale changes, audit rollback, tenant filtering and inactive-admin denial.
- Independent money-reviewer: **24/24** payment/idempotency/calendar/calculator
  tests and **6/6** targeted owner/concurrency/rollback tests passed; no remaining
  code blocker after the discovered owner race was fixed. No money/FX migration.
- Web final full suite: **61 files / 515 passed**. Production build passed;
  lint has existing warnings and no errors.
- Flutter warehouse/auth/rep-owner regression: **271 passed**; after two extra
  permission-model cases, final focused run **21 passed**. Analyze: no issues.
- Python Playwright: Arabic global control and explicit member-role saves at
  390/1440 px; expected revision/reason, no automatic save on role selection,
  no page exception or horizontal overflow. Local API fixtures only.
- Exact integration-head GitHub CI is pending submission. No new APK built;
  real-device upgrade and five-interface live acceptance remain outstanding.

Merge/deployment status: merge explicitly authorized by owner; development
integration done. Main remains `86ebd6d1`. Moving main triggers the site workflow;
Render API/web auto-deploy cannot be inspected with this executor's access.
Resolve that deployment effect before moving main; do not equate merge approval
with production publication approval. Preserve checkout closure and all existing
production identities. No production data touched. Rollback is matched code
reversion preserving the additive revision/audit data, not database restoration.
