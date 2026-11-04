# Pharmacist launch package — 2026-11-04

Owner decisions: first release is registration and browsing only; no pharmacy
APK has been distributed yet. Drive, new commissions, credit, fees, route
tracking and profitability are later releases. The estimate of 425 pharmacies
is an owner-provided market estimate, not an installed user count.

## Source and evidence

Implementation starts from main `86ebd6d` (PR11), not the older local `5332cdc`.
The working branch is `codex/pharmacist-launch`. This file distinguishes source
inspection, automated validation and live acceptance; a successful build alone
is not production readiness.

| Capability | Source audit | Required operational evidence |
| --- | --- | --- |
| Password registration, pending/active status, admin recovery | Existing, reused; atomic registration and phone-alias reservations added | Phone registration visible in admin and support-reset drill |
| Session persistence and refresh | Existing; temporary network failures retain credentials | Real phone restart and network outage |
| Address and area | Manual address/area added; map optional, geocoding bounded and stale responses ignored | Permission denial and unavailable geocoder on a real phone |
| Profile editing | Added for active/pending pharmacies; identity/status remain protected | Admin sees updated profile |
| Roles/warehouse isolation | Existing; no Drive privilege expansion | Regression API checks |
| Catalog/offers/cart/orders | Existing; closed-launch checkout gate added | Genuine catalog data only; no seeded production demos |
| Offline reading | Persistent catalog snapshots, confirmed writes; reused | Saved-data date/readiness UI |
| Financial offline operations | Not included; no claim that catalog storage supports cash | Deferred to Drive's durable queue |
| Updates | Build-based signed policy and native verifier reused; Android Firebase fallback removed | Two signed candidate installs without uninstall |
| Distribution | Stable `/feniq.apk` plus immutable version file and verified manifest | Public download without GitHub login and a Syria/no-VPN check |
| Hosting/media | Render configuration; Cloudinary unless local media configured | Actual deployment plan/DB/media bindings are not inferred from YAML |
| Backups | Existing encrypted snapshot/restore and financial verification reused | Recent successful encrypted backup + isolated restore |
| Commissions/payments/returns | Existing legacy rules preserved | New commercial agreements required before opening sales |

At audit time `site-dist/version.json` advertised build 22, dated 2026-10-19,
without the new signed-file metadata. That is branch evidence, not proof of the
live website response. Render is blocked by the current executor's HTTP policy;
production credentials and an attached Android phone are not present.

## Small reviewable changes

1. Registration/profile: optional map and manual address, named area separate
   from `areaType`, alias uniqueness, transactional user/profile/session creation,
   pending-account edits, uncertain-registration guidance.
2. Launch controls: public status, administrator editing with revision checks
   and change history, clear pharmacy banner, disabled checkout until a fresh
   open status, and a server-side guard before any financial writes.
3. Release integrity: version name extracted from the APK, immutable files,
   retained prior downloads, one Android policy authority, signed candidate CI.

## Interfaces and additive data changes

- `GET /api/app/status`: `{success, status: {mode, orderingEnabled, message, revision}}`.
  Modes are `registration_only` and `ordering_open`. Missing configuration is
  **closed**. Responses are not cached. No launch date is hardcoded.
- `GET/PUT /api/admin/launch`: admin-only configuration; PUT accepts exactly
  `mode`, `message` (nonempty, at most 500 chars), and the current `revision`.
  Concurrent/stale edits get `409 LAUNCH_CHANGED`; bounded history records
  actor/time/previous state. Approval policy is independent and is not changed.
- New `POST /api/orders` attempts get `409 ORDERING_NOT_STARTED` while closed.
  An already committed request still replays by the same idempotency key;
  read/cancel paths remain available. Client hiding is not the enforcement.
- `PATCH /api/auth/profile`: authenticated pharmacy only, including pending.
  Accepts name, pharmacyName, address, areaName, areaType and an optional complete
  latitude/longitude pair (two nulls remove the point). No account ID, phone,
  role, approval or credentials may be changed here. Changed coordinates
  invalidate location approval; account approval is unchanged.
- `areaName` is additive, empty on legacy records. Legacy missing areaType
  remains compatible. Updated self responses include location/locationApproval.
- New registrations alone have `users.registrationPhoneKey` (international
  normalized phone), protected by a sparse unique index. Both legacy spellings
  are checked before signup. Existing identities, passwords and exact-match
  login behavior are preserved; there is no automatic legacy account merge.
- Publication metadata includes versionName/applicationId/file in addition to
  build, size, SHA-256 and certificate. The immutable file is
  `releases/<build>-<first12sha>.apk`; `/feniq.apk` remains the public entry link.
  Previous release files are retained. One build cannot identify different bytes.
- The server's Android release policy inspects that exact immutable file and
  requires the configured version name to match its verified manifest. The
  admin UI fills the version name from inspection. Android never falls through
  to an unrelated Firebase policy; other legacy clients retain their old path.

## Deployment sequence and rollback

1. Verify clean source/checks and back up the unchanged production database.
   Restore only to a separate DB and run the existing financial verifier.
2. Before registration traffic on the new server, run
   `node backend/scripts/check-pharmacist-launch-index.js` with the configured
   runtime credentials. It creates only the sparse unique index, prints no
   account/credential data and does not rewrite legacy phone numbers.
3. Deploy the backward-compatible server to the existing API/DB. Verify health,
   replica-set support, HTTPS/CORS and approval settings. Confirm launch status
   is registration-only. Do not open ordering to satisfy a test.
4. Use an isolated acceptance API and disposable accounts for account/upgrade
   tests. The task-specific candidate branch runs the existing Android workflow,
   requires the permanent key and matching certificate, and cannot publish the
   production website. Its signed build counter is shared with main releases.
5. On a real Android device install the first candidate, register, verify admin
   visibility, close/reboot and interrupt the network. Install a higher signed
   candidate over it, retaining account/data/API. Test pending/approved accounts,
   GPS denial, duplicate phone, support recovery and empty catalog states.
   Emulator storage-probe success is separate evidence, not this phone test.
6. After acceptance and authorized production publication, build from main with
   the unchanged production API. Verify the downloaded APK identity, signature,
   ABI coverage, SHA and size. Publish file+manifest together; verify the public
   stable link and immutable link. Enable only an optional release recommendation.
   Keep Firebase settings frozen for older builds during the transition.
7. Do not enable mandatory updates, Drive, commissions, fees or ordering here.
   Any paid service requires the owner's explicit cost decision first.

If a build/download fails, site publication retains the previous APK. If there
is no usable APK, publication fails rather than advertising an empty download.
Revert server code to the previous compatible commit if needed; leave additive
fields and index intact. Disable an incorrect release policy from admin. Android
cannot downgrade installed builds: ship a corrected higher build with the same
certificate. Never restore production as a routine rollback or erase accounts.

## Acceptance evidence still required

Production hosting/read-only health and actual plan, current encrypted backup
and isolated restore, public-download behavior from Syria, and the physical
Android two-install account-preservation test must be attached before calling
this release production-ready. No production seed or customer financial write
is part of this package's test procedure.

Each delivery records changes, exact tested commit, tests/results, limitations,
required settings/indexes, rollback and merge/publication readiness. Preserve
these decisions and the later Drive roadmap in My-mind without any secrets.
