# Catalog overhaul — data migrations

The scripts in `scripts/migrations/` bring a database written before the catalog
overhaul up to the new model: the central Manufacturer entity, normalized search
keys, the recall/disable reason on products, and a deduplicated catalog.

Every script:

- is a **dry run by default**. It prints what it would change and writes nothing.
- writes only when you pass **`--apply`**.
- is **idempotent**. Running it again after it applied finds nothing left to do.
- connects through `MONGODB_URI` (via `src/config/env.js`), like every other
  backend script.

## Run order

Run them in this order. Each depends on the ones before it.

| # | Script | What it does |
|---|---|---|
| 00 | `00-manufacturers.js` | Drops the old unique index on the raw catalog pair `(nameAr, manufacturerAr)`. Creates one `Manufacturer` per distinct **normalized** manufacturer name found in the catalog and in legacy products. Spelling variants become one company, named after the most frequent spelling. Sets `manufacturerId` on catalog items and products, and rewrites each catalog item's `manufacturerAr` to the canonical spelling. |
| 01 | `01-manufacturer-discounts.js` | Keys `ManufacturerDiscount` and `WarehouseManufacturer` (the import registry) on `manufacturerId`. Merges one warehouse's rows that resolve to the same manufacturer; for discounts the **higher** percentage is kept and every clash is reported. Rows matching no manufacturer are **kept** and listed in the report. Drops the old `(warehouseId, manufacturerAr)` unique indexes. |
| 02 | `02-search-keys.js` | Recomputes `nameKey`, `nameEnKey`, `manufacturerKey` and `identityKey` on catalog items with the shared normalizer, and copies the keys onto products (legacy products compute them from their own names). If the unique `identityKey` index exists and the new keys collide, it drops that index; 04 rebuilds it. |
| 03 | `03-deactivated-by.js` | For each inactive product with no reason recorded: `catalog_recall` if its catalog item is inactive, otherwise `admin`. |
| 04 | `04-dedupe-catalog.js` | Groups catalog items that share an `identityKey`. **Safe** groups are merged automatically into the oldest item, one transaction per group, keeping any image. A group is safe when no warehouse is linked to more than one item and all items share the same active state. **Unsafe** groups go to `CatalogDuplicateReview` for the admin's Duplicate review screen. Builds the unique `identityKey` index only once no duplicates remain; otherwise it prints what blocks it. |
| 05 | `05-remove-barcode.js` | Unsets the removed `Product.barcode` field. |
| 06 | `06-drop-legacy-indexes.js` | Drops the four legacy single-field product indexes (`nameAr_1`, `nameEn_1`, `manufacturerAr_1`, `manufacturerEn_1`), and `warehouseId_1_manufacturerKey_1__id_1` if an earlier build of this branch created it (superseded by the covering `warehouse_manufacturer_page`), then creates every index the catalog models now declare. It only creates, never drops. The unique `identityKey` index is left to 04. Run this **after** the new search code is deployed. |

Existing image URLs are already on Cloudinary. No script moves or rewrites them.

## How to run

```bash
cd backend

# 1. Dry run each one and read the report
node scripts/migrations/00-manufacturers.js
node scripts/migrations/01-manufacturer-discounts.js
# ...

# 2. Apply, in order
node scripts/migrations/00-manufacturers.js --apply
node scripts/migrations/01-manufacturer-discounts.js --apply
node scripts/migrations/02-search-keys.js --apply
node scripts/migrations/03-deactivated-by.js --apply
node scripts/migrations/04-dedupe-catalog.js --apply
node scripts/migrations/05-remove-barcode.js --apply
node scripts/migrations/06-drop-legacy-indexes.js --apply
```

The dry run is exact up to 01. From 02 onwards it reads data that the earlier
scripts would have rewritten, so a dry run of 02–06 **before** 00/01 are applied
shows what those scripts would do on the current data, not on the final data.
The safe path is: dry-run 00, apply 00, dry-run 01, apply 01, and so on.

## Read the reports

- **00** `spellingVariantsMerged` lists every company that had several spellings
  and the name it now carries.
- **01** `discounts.clashes` lists warehouses that had different discounts on
  two spellings of one company, with the value kept and the value dropped.
  `unmatched` lists discount/registry rows whose name matches no manufacturer.
  They are kept, but they reach no catalog-linked product until an admin sorts
  them out.
- **04** `sentToReview` lists the duplicate groups waiting on the admin, and
  `identityIndex` says whether the unique index could be built.

## Deploying

The application keeps working before the migrations run, but some behaviour is
degraded until they do. The pharmacist search, the manufacturer filter and
discount matching all rely on the new keys, so run 00–05 right after
deploying, then 06. Until 04 has built the unique `identityKey` index, Mongoose
logs a failed index build at boot. That is harmless and expected.

The tests (`test/migrations.catalog.test.js`) run all seven scripts against
legacy-shaped data in an in-memory database: dry run, apply, and a second apply.
