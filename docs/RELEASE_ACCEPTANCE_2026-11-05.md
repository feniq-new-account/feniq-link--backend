# Release acceptance — 2026-11-05

Baseline: main b0a0b7a (PR15); backup repair merged as 871b1f4 (PR16).
The owner explicitly requested execution of the release plan, including signed
acceptance APKs, isolated restore and comprehensive interface checks.

## Reproducible real API / browser acceptance

backend/scripts/acceptance/server.js starts a temporary MongoDB replica set,
seeds the existing labelled preview, binds only localhost and starts real HTTP
and Socket.IO services. It rejects production or configured external database/
notification credentials and never accepts a database URI. Generated credentials
must be outside the repository and mode 0600; an existing file is refused.
Shutdown drops only the owned temporary local database and removes its own file.

tests/acceptance/five_interface_web.py uses actual server responses, without API
response fixtures. Non-local images/maps are blocked. It deliberately interrupts
a session-check request and verifies recovery without reauthentication. The
report/screenshots exclude credentials and tokens.

The release-acceptance workflow runs on the single owner-authorized dated branch
or manual dispatch. It has no nightly schedule, production secrets or production
connections. Python Playwright 1.62.0 provides Chromium in CI; local runs default
to /usr/bin/chromium. An empty FENIQ_CHROMIUM selects Playwright's installed browser.

Use the project's with_server.py helper with --help first, then:
- Backend server: exec node backend/scripts/acceptance/server.js (port 5085).
- Web server: cd web && exec env VITE_API_BASE_URL=http://127.0.0.1:5085/api node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5176.
- Set FENIQ_ACCEPTANCE_OUTPUT to a NEW private JSON path outside the repository.
- Run python3 tests/acceptance/five_interface_web.py --credentials PATH --output REPORT_DIRECTORY.

Use exec in server commands so helper shutdown reaches the server process.
No credential file may be uploaded with the report.

## Evidence at this checkpoint

| Gate | Evidence |
| --- | --- |
| Main baseline | Main CI 41937994675 success; backend1519/web515/Flutter1461/publication16 on the merged release code |
| Real API/browser | Seven local journeys passed: five identities login/restore, role guards, admin persistence/audit, owner preferences, accountant basic access and network recovery; no page exceptions or horizontal overflow |
| Launch HTTP | 45 passed: pharmacistLaunch/auth.register/auth.security/launchJourney/launchPreviewSeed against temporary replica sets |
| Mobile targeted acceptance | 103 passed: auth views, session scope/reset, update service/gate, launch banner, rep views, owner preferences and owner/accountant cash controls |
| Fixture safety | 4 passed: production rejection, configured database rejection, dotenv notification injection and existing Mongoose connection rejection |
| Money review | Independent reviewer approved final guards/owned cleanup and proposed-policy labelling; no financial writer or historical data changes |
| Signed candidate | Task branch codex/release-acceptance-2026-11-05; first run41988191129 still building at this checkpoint; mandatory permanent certificate, no public publication |
| Encrypted backup / restore | Run41988946679 success: dump+encryption, restore/verifier on separate temporary target, artifact retained; PR16 merged after full CI |
| Production API/web/index | Unverified: executor network excludes Render and has no production credentials |
| Phone / Syria download | Not performed: requires a real device and network acceptance |

The successful browser run preceded the final safety-guard hardening. Its positive
rerun was attempted but could not launch because the managed execution environment
became unavailable. The four negative safety tests and independent final review
completed before that failure. These files were preserved through GitHub after
the disconnection; the CI browser job will verify the final submitted source.
Do not call that CI run successful until it finishes.

The first runner-only backup fix failed, since GitHub kernels advance independently
of Ubuntu userspace. The official Mongo image maintainer workaround reserves rseq
for glibc only in the disposable restore target; no production DB setting changed.
Failed runs41984166307/41988382390 remain failed evidence.

## Remaining gates and rollback

Android emulator probes verify signature, version, private storage and startup.
They are not physical-phone or logged-in account upgrade acceptance.
No new public APK, mandatory update or checkout activation is claimed here.
Financial follow-up is specified in COLLECTION_V2_IMPLEMENTATION_SPEC.md and stays
inactive pending approved return/evidence/allocation policies.

Rollback these acceptance tools with code only. Preserve encrypted backup artifacts,
source identities and audit records. Never restore production as routine rollback
or erase a real account to make an upgrade test pass.
