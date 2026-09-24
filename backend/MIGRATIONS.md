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
| 06 | `06-drop-legacy-indexes.js` | Drops the four legacy single-field product indexes (`nameAr_1`, `nameEn_1`, `manufacturerAr_1`, `manufacturerEn_1`), and `warehouseId_1_manufacturerKey_1__id_1` if an earlier build of this branch created it (superseded by the covering `warehouse_manufacturer_page`), then creates every index the catalog models now declare. It only creates, never drops. The unique `identityKey` index is left to 04. |

Existing image URLs are already on Cloudinary. No script moves or rewrites them.

## Deploying

The app is still in testing: there are no real users and no old app versions to
keep working, and the database holds test data only. So the migrations run with
the server stopped, against the new code, with no compatibility window.

1. **Stop the server.**
2. **Deploy the new code.**
3. **Run 00 → 06 in order.** For each script, dry-run it first and read the
   report, then run it with `--apply`, before moving on to the next one:

   ```bash
   cd backend
   node scripts/migrations/00-manufacturers.js           # dry run: read the report
   node scripts/migrations/00-manufacturers.js --apply
   node scripts/migrations/01-manufacturer-discounts.js
   node scripts/migrations/01-manufacturer-discounts.js --apply
   node scripts/migrations/02-search-keys.js
   node scripts/migrations/02-search-keys.js --apply
   node scripts/migrations/03-deactivated-by.js
   node scripts/migrations/03-deactivated-by.js --apply
   node scripts/migrations/04-dedupe-catalog.js
   node scripts/migrations/04-dedupe-catalog.js --apply
   node scripts/migrations/05-remove-barcode.js
   node scripts/migrations/05-remove-barcode.js --apply
   node scripts/migrations/06-drop-legacy-indexes.js
   node scripts/migrations/06-drop-legacy-indexes.js --apply
   ```

   Each dry run reads the data as the scripts before it left it. That is why
   every script is dry-run and applied before the next one starts.
4. **Start the server.** If 04 sent duplicates to review, the unique
   `identityKey` index does not exist yet, and Mongoose logs a failed index build
   at boot. That is expected until step 5.
5. **Resolve the Duplicate review screen, then re-run 04** (dry run, then
   `--apply`). Once no duplicates remain, it builds the unique `identityKey`
   index.

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

## Tests

`test/migrations.catalog.test.js` runs all seven scripts against legacy-shaped
data in an in-memory database: dry run, apply, and a second apply.
