# Implementation and release evidence — 2026-11-04

This file distinguishes approved, implemented, tested and deployed. Update the
checkpoint at the end of each implementation batch; never infer deployment from
a green build. Business authority is [Notion](https://app.notion.com/p/40e6c91cc9c481e4bc0ef8e47a7426e9).

Baseline: main `86ebd6d1`; PR12 `65e45cf42dc3df12ade0ce7fe6a54282ac240a59`.
Work branch: `codex/feature-control-foundation`, based on PR12 (stacked, not merged).

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

Unresolved business inputs: contractual city_ring classification, allocation
selection policy, evidence/approval for warehouse collection, return commission
adjustment after settlement, existing-user owner-mobile rights, post-2026
promotion eligibility and final package definitions. These do not block signup.

## Checkpoints

1. Documentation alignment: these four documents; no runtime or data changes.
   Validation: source links and implementation distinctions reviewed. Rollback:
   revert this documentation commit only. Not production deployment evidence.
