# Subscription transition and release contract

Source: [Notion SUB-01–04](https://app.notion.com/p/40e6c91cc9c481e4bc0ef8e47a7426e9).

Promotion ends exclusively at `2027-01-01T00:00:00+03:00`; grace ends exclusively
at `2027-01-08T00:00:00+03:00` (Asia/Damascus, current approved dates).
Reading an entitlement/subscription never creates or extends a trial.
Legacy trial dates remain stored for history, not a renewable commercial offer.

Existing explicit feature disables are preserved. Existing active paid rights
and their contractual grace remain valid until their stored expiry. Legacy
plan labels are not a new package definition. A paused subscription is a
commercial state, not suspension of the account or its core records.

Bundle definitions require a decision/contract reference and have no automatic
prices. Grants snapshot their feature list so editing future package definitions
cannot change existing grants. Add-ons provide one feature; purchasing a feature
already covered by an effective grant is rejected. Grants can be future-dated,
expire or be revoked with audit evidence. No invoice or debit is generated.

An explicitly marked advanced bundle always includes ownerMobileAccess; other
features come only from its approved definition. No default advanced package is
seeded, and ownerInsights is not inferred from mobile access.

Post-2026 new warehouses do not receive an invented promotional trial; they have
core access and explicit grants only, until the owner approves another policy.
The owner mobile access capability is independent of advanced insights; existing
clients are not silently locked out. Channel enforcement needs the mobile release
and approved treatment of existing users, tracked in implementation status.

Rollout: no production migration is run by these changes. New control documents
are additive and initialized on explicit administrative writes. Keep API, DB,
applicationId and signing identity unchanged. Revert code using an artifact that
retains the launch checkout guard; preserve control/audit data for review. Do not
revert to the old payment paywall after core financial activity has resumed.
