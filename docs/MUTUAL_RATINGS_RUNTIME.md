# Mutual ratings runtime control

`mutualRatings` pauses both directions of reviews without removing their code,
records, visibility flags or saved counters. Its default is **ON**, preserving
current main behavior until an active administrator explicitly changes it.

An active admin uses **Admin → Feature management → Mutual ratings** and saves
with a reason. The existing `/api/admin/feature-control` revision check,
transaction and audit record apply. The boolean is persisted in
`PlatformSetting.featureControl.value.features.mutualRatings`. It is a platform
switch, not a warehouse subscription entitlement, self-service preference or
bundle feature. Other roles and inactive admins cannot change it.

`GET /api/app/features` returns only public runtime booleans with `no-store`.
The web and Flutter clients refresh at startup, every 30 seconds and on focus /
resume, hiding review navigation, forms and displays while OFF. A failed refresh
hides these elements until a successful refresh. The backend reads the stored
flag for each review operation, rejects creation in both directions with
`RATINGS_DISABLED` while OFF and masks user-facing review lists/statistics.
Reviews remain immutable; there is no review edit endpoint. Re-enabling restores
existing reads and new submissions. After this client integration is installed,
further switch changes require neither an APK rebuild nor a server restart.

The demo feature seed skips reviews while OFF. The isolated launch preview seed
also checks the runtime flag; its optional boolean `mutualRatings` test/setup
option is persisted only after its empty-database and non-production guards.
The preview acceptance test runs both states, retaining financial, login and
repeat-run safeguards. No production fixtures or migrations are included.

This independent main-based change replaces the fixed-release approach in
PR #87 and includes the runtime equivalent of PR #91's demo-seed guard. Those
branches are not modified or merged into this branch. Do not apply their static
ratings switches on top of this runtime control.
