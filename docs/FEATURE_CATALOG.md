# Feature catalog and control boundaries

Authority: [approved decisions](https://app.notion.com/p/40e6c91cc9c481e4bc0ef8e47a7426e9)
and [draft inventory](https://app.notion.com/p/40e6c91cc9c48179849de3fa3a7f7394).
The draft's paid-tier assignments are NOT approved package contents.

Core capabilities: catalog, basicOrders, financialRecords, paymentRecording,
returns and settlements. These cannot be sold, revoked by a bundle, disabled by a
subscription pause/expiry, or switched off through the advanced feature API.
Account security, roles, warehouse isolation and the independent checkout launch
guard still apply.

Existing optional keys: repTracking, loyalty, accounting (advanced scope only),
salesReports, ownerInsights, overdueReceivables, inactivePharmacies, ownerAlerts,
deliverySchedule. Owner mobile channel access uses ownerMobileAccess separately.
This technical inventory does not assign features to paid tiers.

Order of evaluation: authentication/role/tenant → platform switch → effective
entitlement (promotion, existing paid right, bundle, add-on or administrative
grant) → warehouse self-configuration. A warehouse cannot grant itself a right.
Every decision exposes its reason and revision; client visibility is advisory,
backend guards are authoritative. Existing feature-specific settings remain in
their services; self-configuration here only enables/disables eligible features.

Contracts are separate from feature switches. Operational records are separate
from contracts. Plan changes must not rewrite grants already issued or money.
No automatic Notion-to-admin synchronization and no subscription charging API.
