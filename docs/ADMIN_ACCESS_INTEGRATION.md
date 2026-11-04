# Admin and five-interface access integration

Owner request: finish links between admin controls and user permissions, combine
the implementation branches, then record implemented/tested/remaining work in
Notion. Business decisions remain in [Notion](https://app.notion.com/p/40e6c91cc9c481e4bc0ef8e47a7426e9).

## Roles, entitlements and operating status

These are three separate checks, never interchangeable:

1. User identity/status/role and tenant scope.
2. Optional feature availability: platform → warehouse entitlement → preferences.
3. Operating status, including the server checkout launch guard.

| Role | Existing tenant scope | Cash | Feature preferences | Platform grants |
| --- | --- | --- | --- | --- |
| Admin, active | Platform administrative scope | Does not become a warehouse cashier | Manages platform grants/flags | Yes |
| Warehouse owner, active | Own warehouse | Reads accounts; cannot post/reverse payments | Yes | No |
| Accountant, active | Own warehouse | Record/reverse under existing rules | No | No |
| Legacy combined warehouse login | Own warehouse | Existing operator access preserved | Yes | No |
| Rep, active | Own assigned pharmacies/warehouse | No new Drive cash privileges | No | No |
| Pharmacist | Own pharmacy | Reads own account once approved | No | No |

Pending/blocked/deleted accounts get no operational permissions. Pending pharmacy
self-profile editing remains available through its existing controlled path.
Core account records and payment correction are not subscription products.

## Implemented connections

- Backend `rolePermissions` computes the shared role contract; login/refresh/me
  responses include permissions. Old response fields and identity are unchanged.
- Admin warehouse-member rows show effective permissions, status and access
  revision. Role edits require reason/revision, reject stale writes and preserve
  at least one active owner. Audit and role/token-version change are transactional;
  live sockets disconnect only after commit. Failed audit changes nothing.
  A shared warehouse revision serializes changes to different members, preventing
  two simultaneous owner downgrades from bypassing the last-owner check.
- Warehouse payment and feature-preference route guards use the same role policy.
  Existing tenant queries, financial transactions, FX and idempotency stay intact.
- Web payment controls consume the role contract; feature preference saves apply
  server-effective flags immediately and refresh the shared subscription context.
- Flutter parses optional server permissions with a compatible older-server
  fallback. Owner cash/voice buttons and delivery collection prompts follow the
  same permission, including accounts, order list/detail and statement screens.
- Owner feature preferences have a mobile screen using the existing entitlement
  API. A preference cannot self-grant access; stale saves show an error and keep
  the draft. An unavailable feature remains labelled unavailable after saving.
- Global admin controls have their own `/admin/features` entry; no warehouse is
  required. Warehouse-specific controls stay on warehouse access. Audit names
  actors/targets and can filter one warehouse plus platform/bundle events.
- Feature status labels expose limited visit tracking, in-screen alerts, pending
  advanced accounting and owner-mobile rights-only status. No paid product is
  claimed complete just because it has a switch. Manual grants are in the UI.

## Data/compatibility and rollback

Additive `User.accessRevision`, `Warehouse.memberAccessRevision` and
`WarehouseAudit.reason`; no backfill, financial
migration, account merge, contracted-rate change or database replacement. New
admin member writes require revision/reason; ship matching admin UI/backend.
Old mobile auth payloads remain readable. The new Flutter screen needs a normal
future signed app release; no APK publication is authorized by code integration.

Rollback matched clients/server while preserving audit/revision data. Do not
restore production as routine rollback, erase pending payments or remove the
checkout guard. Existing role changes have revoked prior tokens; a code rollback
does not revalidate revoked sessions.

## Integration and release boundaries

`codex/admin-permissions-integration` includes the PR12 launch package, PR13
feature foundation and merged PR14 backup-retention commit, plus this access
connection work. A combined development branch is not production publication.
The owner's current instruction authorizes branch merging; prior absence of merge
authorization is superseded. Checkout, paid prices and historical money changes
remain outside that authorization.

Main has a website-publication workflow triggered by changed publication files;
Render's actual auto-deploy state is not readable in this executor. Do not claim
that updating render.yaml can pause already-configured services before a push.
Verify/authorize deployment effects before moving production-bound refs. Money
review remains required by CLAUDE.md for the financial parts of PR12/13/this diff.

The comprehensive five-interface acceptance is a next step requested by the
owner after integration. Automated pre-merge regression does not replace real
phone upgrades, live isolated backup restore or production health acceptance.

Remaining commercial work: actual collection-policy ledger/allocations/settlement,
return-commission rules, approved subscription prices/packages and owner-mobile
channel enforcement. Drive/live tracking and reliable field financial offline
operations remain separate later work; none is silently enabled here.

## Feature and interface completion

| Optional feature | Actual implemented scope | Remaining scope |
| --- | --- | --- |
| repTracking | Warehouse rep visits and visit checks | Live GPS/Drive is separate |
| loyalty | Warehouse-funded existing discount tiers | Not a new points wallet |
| accounting | Basic financial access protected and separated from subscriptions | Advanced paid product not defined |
| salesReports | Existing sales report with entitlement guard | Commercial tier/price approval |
| ownerInsights | Owner access to the existing shared report | Not an independent new analytics engine |
| overdueReceivables | Existing overdue account follow-up | Live acceptance |
| inactivePharmacies | Existing inactive-pharmacy follow-up | Live acceptance |
| ownerAlerts | Existing in-screen follow-up alerts | No new automatic push alert service |
| deliverySchedule | Existing warehouse delivery schedule | Not route optimization or Drive |

The tenth technical key, `ownerMobileAccess`, represents a channel entitlement.
It is included by advanced bundle definitions and can be granted independently;
shared legacy endpoints are not silently channel-paywalled. Existing-user treatment
and coordinated app rollout remain open. No approved numerical pricing exists.

Five interfaces: pharmacist mobile keeps free core and the independent checkout
guard; rep mobile keeps assigned warehouse/pharmacy visit scope; warehouse-owner
mobile gets feature preferences and cash denial; admin web controls platform,
grants and members; warehouse web consumes effective entitlements and separates
owner monitoring from accountant cash. Feature grants never change a user's role,
warehouse membership, contract commission or historic financial records.

Not complete: paid package prices/content, paid channel enforcement, collection-v2
posting and return commission adjustments, multi-warehouse Drive, durable field
financial offline writes and live GPS. These are not launch-ready because their
feature keys or preview calculations exist.
