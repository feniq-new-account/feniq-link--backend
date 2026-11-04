# Approved business rules — 2026-11-04

Authority: [Notion decisions](https://app.notion.com/p/40e6c91cc9c481e4bc0ef8e47a7426e9).
GitHub records implementation, not approval. IDs below are local traceability IDs.
See [implementation status](IMPLEMENTATION_STATUS.md) for evidence and open gates.

| ID | Approved decision | Implementation boundary |
| --- | --- | --- |
| SUB-01 | Free promotion through 2026-12-31; grace 2027-01-01–07; permanent freemium from 2027-01-08 | Damascus civil dates; no rolling trial on reads |
| SUB-02 | Preserve login, visibility, catalog/prices, basic orders, invoices and basic financial records | Subscription expiry must not block essential payment recording/correction, returns or reconciliation |
| SUB-03 | Hybrid bundles and standalone add-ons | No invented bundle contents or prices; grant union, never duplicate billing |
| SUB-04 | Owner mobile access included in advanced tier or bought separately | Separate access capability from ownerInsights content; advanced-tier contents await approval |
| COMM-01 | In-city original rep commission: 50% Feniq / 50% rep | Explicit contractual city classification, not inferred from city_ring |
| COMM-02 | Outside-city original rep commission: 100% Feniq | Delivery charges separately agreed; no default fee |
| COMM-03 | Accrue only on actual collection, proportionally for partial payments | Warehouse collection requires evidence and settlement confirmation |
| COMM-04 | No pharmacy discount funded from the rep commission | Preserve already-earned legacy credit; warehouse-funded promotions separate |
| OPS-01 | Warehouse controls prices, credit approval/limits and default risk | No Feniq-funded credit or implicit guarantee |
| OPS-02 | Warehouse approves returns; pharmacy approves stock substitutions | Return commission adjustment and post-settlement exceptions await decision |

Unapproved: final package names/content/prices, owner-app price, post-2026 new-warehouse
promotion, delivery fees, credit/return-dispute details and loyalty funding. The
200,000 SYP discussion figure is not a price. No seed data or billing is created.

Financial transition is additive and versioned: no historical entry, payment,
frozen rate, FX snapshot or legacy credit is recalculated. Delivery and collection
are separate events. See `backend/docs/MONEY_FLOW.md` for the existing legacy flow;
it is not authority for the new commercial decision.
