# Interactive native Android acceptance

The owner's 2026-11-05 request is to inspect and operate native screens directly,
without asking him to open each page. This is separate from signed release
upgrade checks and the final physical-device/target-network acceptance.

## Isolation and execution

`.github/workflows/android-interactive-review.yml` runs only by explicit dispatch
after the initial dated-branch bootstrap. It has an 85-minute job limit and a 45-minute,
160-command interactive session limit. It has no nightly schedule or production
secrets. The throwaway checkout builds an x86_64 debug APK, removes its Firebase
configuration and permits cleartext only to localhost in the debug manifest.
Release configuration, application ID, certificate, production API and public
download are untouched. This APK must never be distributed to users.

The existing guarded acceptance server owns a temporary localhost Mongo replica
set, generated accounts and clearly labelled synthetic records. No test record
is inserted into production. Passwords remain in a private temporary file.
The web panel uses the same localhost backend. `adb reverse` provides transport.

The controller polls `qa/android-control-RUN-ATTEMPT/command.json` and publishes
screens and status to `qa/android-evidence-RUN-ATTEMPT` in the private repository.
Those branches have separate root commits and are never merged into main.
Only synthetic UI evidence belongs there; never upload the fixture file, tokens
or a password in a command. Credential actions refer to a predefined fixture
role instead. Password entry suppresses screenshots and accessibility output
until an app-process restart. Evidence retained during that suppression is the
previous safe image, not the current screen.

Commands are bounded taps, swipes, ASCII text, keys, waits, credential references,
API/network disconnection, app restart, snapshot and stop. Arbitrary shell input
is rejected. Offline mode removes the API tunnel, because disabling Wi-Fi alone
does not interrupt USB reverse transport. An explicit stop ends the session;
the hard limit also stops abandoned sessions.

## Acceptance journeys

Inspect each resulting screen before choosing the next action. Record actual
observations, errors and immutable evidence commits; do not turn this list into
a claim of successful execution.

1. First launch, Arabic/RTL, registration form, required fields, optional location,
   existing-phone rejection, new account and approval state.
2. Pharmacist login, process restart with the same session, warehouse selection,
   catalog/search, offers, cart, orders and profile.
3. API interruption and recovery: honest cached/error state, retry, no forced
   logout caused by a temporary connection failure.
4. Owner app: orders, available operations and feature preferences; no access
   to another warehouse's records.
5. Representative app: assigned pharmacies, visits and displayed dues; no admin
   privilege escalation. Real GPS/QR and field collection need separate evidence.
6. Admin landing and local dashboard navigation where applicable. Existing browser
   acceptance covers web identities separately; native screenshots do not prove
   all dashboard permissions or financial correctness.

## Verification and rollback

Run `python3 -m unittest discover -s .github/scripts -p test_android_interactive_review.py`.
The safety tests cover input limits, shell quoting, credential evidence suppression,
production fixture rejection and actual API-tunnel disconnection.

Remove/revert these tooling files to roll back the QA facility. Stop any active
session first. No database migration, production restore, signing change or
public APK rollback is required. Retain useful synthetic evidence as review
records, subject to the project's retention policy.

## Results

Review source: `8dcd1d3`, based on main `ed7f4a8`.
[First attempt 42027294739](https://github.com/feniq-new-account/feniq-link--backend/actions/runs/42027294739) built the APK successfully, then failed installing the emulator image because the disposable runner ran out of disk. No UI journey ran. The retry reserves space by removing unused preinstalled languages and releases native compilers after the APK is complete.
[Retry 42029093717](https://github.com/feniq-new-account/feniq-link--backend/actions/runs/42029093717).
[PR20 CI 42027366083](https://github.com/feniq-new-account/feniq-link--backend/actions/runs/42027366083)
passed backend, web/build and 21 publication/controller safety tests.

The retry **completed successfully**, including deliberate operator shutdown
after command 59. The engineer inspected each resulting image and chose subsequent
input, rather than claiming success from a preset sequence. Several initial
login taps missed the button after keyboard scrolling; those were corrected
operator input, not authentication failures.

Evidence is frozen at commit
`9c6bcaacc8555b1c8be82ae8234a3f7aec93b8d3` on
`qa/android-evidence-42029093717-1`. The final status has `finished=true`,
`error=null`, `production=false`, `debugBuild=true`. Screens listed below are
available under `screens/NNN.png` in that commit, with command history in
`status.json`. Numbers are command references, not independent test counts.

| Native journey | Observed result | Screens |
| --- | --- | --- |
| Pharmacist login / process restart | Existing account restored to its warehouse list without login | 005–006 |
| Arabic / RTL | Language switch applied Arabic labels and RTL layout | 008–011 |
| Catalog and cart | Warehouse → manufacturers → products → quantity → cart / delivery estimate / confirmation | 010–015 |
| Offline submit | Removed the API tunnel before confirmation; explicit connection error, no success claim | 016 |
| Offline restart | Account retained; cached warehouses and sync timestamp shown; unknown launch mode blocks checkout with retry | 017 |
| Recovery and order | Restored transport, retried, submitted order19; seven pharmacy orders = six seeded plus one new | 018–019, 022 |
| Pharmacy tabs | Offers, orders, account summary and profile opened; explicit logout returned to login | 021–027 |
| Warehouse connection | Owner session restored; same order19 appeared and accepting it changed status | 028–030 |
| Warehouse tabs | Returns, accounts, assigned reps and owner account opened | 031–034 |
| Feature preferences | Nine switches displayed. An unsaved draft was discarded on restart; a saved rep-tracking change with a reason survived restart and became unavailable. Saved restoration followed | 035–039 |
| Representative | Denied Android location permission; assigned pharmacies, synthetic visit history and own profile still opened | 041–046 |
| New registration | Entered all required fields, selected rural, accepted terms, omitted optional map location while permission was denied; new account survived restart | 047–052 |
| Existing phone | Duplicate attempt showed a clear Arabic instruction to log in. Original generated password still logged into the original account with its original name | 054–058 |

The duplicate probe used a known invalid input string, never an actual account
password. Real fixture passwords used private credential references and were
not committed. All identities and financial examples were disposable/synthetic.
The owner's feature preference was restored before the representative journey.
No production checkout, subscription price, contractual rate or financial
history was changed. Existing legacy commission displays are not evidence that
the approved collection-based v2 engine has been implemented.

### Findings and follow-up

Two display issues were observed: the language control selected Arabic while an
unconfigured account actually followed the emulator's English locale; an
international phone number displayed its plus sign at the wrong visual end in
Arabic. The accompanying narrow profile fix uses the resolved locale and an
explicit LTR phone value. The walkthrough above exercised the pre-fix UI;
regression widget tests validate the fix separately. Do not present the images
above as screenshots of the corrected binary.

Both new regression cases failed before the fix, then all ten profile widget
tests passed after it. The public APK is still unchanged; inclusion of the fix
in a future binary requires the usual signed release workflow and gates.

New registration became active under this fixture's approval setting. Native
pending-approval acceptance was **not** exercised. Support/password recovery,
notifications, a genuine GPS/QR visit, low storage, complete device reboot,
an ambiguous server-success/lost-response retry, other Android versions and
the local physical network also remain unverified by this session. Earlier
HTTP/widget/browser and signed mechanical-upgrade evidence stays separate.
In particular, debug session restoration plus signed private-file upgrade does
not prove an authenticated signed-release upgrade on a real phone.

No new public APK or mandatory update was published. Production health/index
access and the final physical-phone/target-network checks remain launch gates.

## Follow-up: prelaunch, pending approval and recovery

The owner asked to continue, so a second isolated scenario completed the
previously unverified pending-approval journey. Source `d73b59b`, based on main
`f432d12`, runs the same disposable fixture, requires new-account approval and
sets `registration_only` **before** starting HTTP. Existing seeded users stay
active for browsing/checkout-guard checks. Unknown scenarios are rejected before
any fixture is created; default `standard` behavior is unchanged.

[Session42079438769](https://github.com/feniq-new-account/feniq-link--backend/actions/runs/42079438769)
was explicitly stopped at command42. Final evidence commit:
`ec1c5157bf91dbaa50699957ffdcf1605115a999`, on
`qa/android-evidence-42079438769-1`. Status has `scenario=prelaunch`,
`finished=true`, `error=null`, `production=false`. These are command references,
not counts of independent tests.

| Journey | Observed result | Screens |
| --- | --- | --- |
| Early launch | Accepted account enters, sees closed-ordering notice and can browse | 001, 003–004 |
| Native checkout guard | Cart available; submit disabled and unresponsive; accessibility confirms enabled=false/clickable=false | 005 |
| Location denial at registration | Expanded optional map, rejected permission, collapsed it and completed manual fields without selecting a point | 008–011 |
| Pending persistence | Registration landed on waiting screen and stayed after restart; refresh did not grant access | 011, 014, 016 |
| Pending profile edits | Address saved and survived restart/reopening while still pending | 012–013 |
| Admin approval on mobile web | Opened local panel from app, signed into admin in Chrome, saw correct pending account/phone, confirmed approval and saw active | 022–025 |
| Approved app account | Login entered catalog, with registration-only notice still present: approval did not open ordering | 026 |
| Profile fixes from PR20 | English indicator matches device; international plus sign at left in Arabic | 002, 027, 041 |
| Administrative recovery | Real web reset form with a reason; app restart invalidated the old session | 034–035 |
| Forced password change | Temporary login reached mandatory change; Back could not bypass; save returned to app | 036–038 |
| Recovery completion | Logout and fresh login with new private password succeeded; account identity survived | 039–041 |

No WhatsApp message, SMS or OTP was sent. Recovery exercised technical controls
on an owned disposable account; real support still verifies the caller outside
the software, as the existing admin dialog requires. Actual password entry and
the one-time valid temporary-password panel were suppressed from screenshots.
Do not include commands032/033 in published examples: they contain an unused,
automatically generated candidate replaced before any reset. Authentication
values used private fixture references. A local browser with non-credential dummy
input supplied sensitive-form layout coordinates; the reset itself was performed
through Android Chrome against its real isolated API.

### Reproducible HTTP and safety evidence

Run `python3 tests/acceptance/prelaunch_api.py`. It creates a private temporary
directory, refuses an existing listener on5087 and starts the guarded localhost
server. Five real HTTP checks passed: public registration-only status, new
registration pending without GPS, pending password login, existing active login,
and a direct order request rejected409/ORDERING_NOT_STARTED. Credentials are
removed and the owned server stopped; failure retains only a private diagnostic
log. No external URL or database argument is accepted.

Five fixture-negative tests passed, including unknown-scenario refusal; five
controller safety tests passed. The two Arabic/English support regressions failed
before the fix and passed afterward. Registration and panel-view tests also
passed. Final full CI is recorded in PR21/Notion. Do not combine these overlapping
groups into an inflated total.

### Display corrections found in this follow-up

- Pending support named Al-Najah and supplied no contact. It now names Feniq,
  shows the existing support number with LTR isolation and provides Copy. No
  support identity, phone or recovery policy changed.
- Registration no longer promises document review when approval is off. Pending
  copy acknowledges registration data, does not claim document upload and
  requires both approval and open intake before ordering.
- Admin landing no longer calls every panel user a warehouse or says native
  warehouse screens are still being prepared. Neutral control-panel wording
  respects the existing role and server permissions.

These support/copy changes followed the second APK build: images capture old
wording and widget tests validate corrections. This second session does visually
validate both profile fixes inherited from PR20.

Pending approval, native closed-checkout behavior and technical manual recovery
are resolved from the first session. Notifications, real GPS/QR, full storage,
complete device reboot, ambiguous server-success/lost-response, authenticated
signed upgrade on real hardware, live deployment/index access and the target
network remain separate checks. The signed1067→1068 private-file evidence is not
an authenticated phone upgrade.

Rollback PR21's scenario, copy and support as code. Preserve PR20 evidence,
production identity, database and certificate. No production migration/restore,
contract or financial engine change is required.
