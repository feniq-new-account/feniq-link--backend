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
