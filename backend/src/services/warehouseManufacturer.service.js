const WarehouseManufacturer = require('../models/warehouseManufacturer.model');
const Manufacturer = require('../models/manufacturer.model');
const Product = require('../models/product.model');
const { normalizeText } = require('../utils/normalizeText');

// Registers every manufacturer discovered in an Excel import (Section 15
// follow-up) - upsert only, so a manufacturer that stops appearing in a
// later import is never removed. Safe to call with duplicates in the list.
//
// Keyed on the central Manufacturer (M3): each raw name from the file is
// resolved through its normalized key, so two spellings of one company are one
// registry row. A name that matches no Manufacturer is not registered - an
// unknown company only comes into existence through the admin (catalog
// requests / the admin import), and a discount could not reach it anyway.
async function registerManufacturers(warehouseId, manufacturerNames) {
  const keys = [...new Set(manufacturerNames.map(normalizeText).filter(Boolean))];
  if (keys.length === 0) return;
  const manufacturers = await Manufacturer.find({ key: { $in: keys } }).select('nameAr').lean();
  await Promise.all(
    manufacturers.map((manufacturer) =>
      WarehouseManufacturer.findOneAndUpdate(
        { warehouseId, manufacturerId: manufacturer._id },
        { $setOnInsert: { warehouseId, manufacturerId: manufacturer._id, manufacturerAr: manufacturer.nameAr } },
        { upsert: true }
      )
    )
  );
}

async function listManufacturersForWarehouse(warehouseId) {
  // Only the manufacturer name is read out of each row.
  const rows = await WarehouseManufacturer.find({ warehouseId })
    .select('manufacturerAr')
    .sort({ manufacturerAr: 1 })
    .lean();
  return rows.map((row) => row.manufacturerAr);
}

// The companies actually represented in this warehouse's catalog, each with
// how many products it has there. Backs the catalog page's company list.
//
// Deliberately NOT listManufacturersForWarehouse above: that reads the import
// registry, which only ever grows from Excel uploads (registerManufacturers)
// - it lists companies whose products have all since been removed, and misses
// every product added through the "Add product" form, whose manufacturer comes
// from the central catalog and is never registered here. Browsing a catalog by
// company needs the companies the catalog actually has, or a warehouse would
// be unable to reach some of its own products. The Discounts tab keeps using
// the registry: picking a company to discount ahead of importing its price
// list is a legitimate thing to do there.
//
// M9: grouped on the product's own denormalized manufacturer fields
// (manufacturerId / manufacturerKey, product.model.js) - one $group over the
// warehouse's active products, then one lookup of the few Manufacturer
// documents involved. It used to $lookup the catalog entry of every single
// product first. Every field it reads is in the warehouse_manufacturer_page
// index (product.model.js), so the $group runs on the index alone - no product
// document is fetched (test/catalog.explain.test.js pins docsExamined 0).
async function listCatalogManufacturersForWarehouse(warehouseId) {
  const groups = await Product.aggregate([
    { $match: { warehouseId, isActive: true, manufacturerKey: { $nin: [null, ''] } } },
    {
      $group: {
        _id: { manufacturerId: '$manufacturerId', manufacturerKey: '$manufacturerKey' },
        productCount: { $sum: 1 },
        // Only read for legacy rows with no Manufacturer - a linked product
        // carries no name of its own.
        legacyAr: { $first: '$manufacturerAr' },
        legacyEn: { $first: '$manufacturerEn' },
      },
    },
  ]);

  const ids = groups.map((group) => group._id.manufacturerId).filter(Boolean);
  const manufacturers = ids.length
    ? await Manufacturer.find({ _id: { $in: ids } }).select('nameAr nameEn logoUrl').lean()
    : [];
  const manufacturerById = new Map(manufacturers.map((m) => [String(m._id), m]));

  // Grouped by the Arabic name because that is the identity the rest of the
  // system has always shown and filtered on; the English name rides along so
  // the panel can label the card in whichever language it is showing.
  const byName = new Map();
  for (const group of groups) {
    const manufacturer = group._id.manufacturerId
      ? manufacturerById.get(String(group._id.manufacturerId))
      : null;
    const manufacturerAr = manufacturer ? manufacturer.nameAr : group.legacyAr;
    if (!manufacturerAr) continue;
    const existing = byName.get(manufacturerAr);
    if (existing) {
      existing.productCount += group.productCount;
      continue;
    }
    byName.set(manufacturerAr, {
      manufacturerAr,
      manufacturerEn: (manufacturer ? manufacturer.nameEn : group.legacyEn) ?? null,
      productCount: group.productCount,
      manufacturerId: manufacturer ? manufacturer._id : null,
      logoUrl: manufacturer ? manufacturer.logoUrl ?? null : null,
    });
  }

  return [...byName.values()].sort((a, b) => a.manufacturerAr.localeCompare(b.manufacturerAr));
}

module.exports = {
  registerManufacturers,
  listManufacturersForWarehouse,
  listCatalogManufacturersForWarehouse,
};
