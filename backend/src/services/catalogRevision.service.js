const { createHash } = require('node:crypto');
const Product = require('../models/product.model');
const ProductCatalog = require('../models/productCatalog.model');
const Manufacturer = require('../models/manufacturer.model');
const ManufacturerDiscount = require('../models/manufacturerDiscount.model');
const Offer = require('../models/offer.model');
const { isWarehouseAvailable } = require('./warehouse.service');
const { getRate } = require('./exchangeRate.service');
const { activeOfferFilter } = require('./offer.service');
const { CATALOG_PRODUCT_SELECT } = require('./product.service');
const { PRODUCT_IDENTITY_POPULATE } = require('./productCatalog.service');
const { ApiError } = require('../utils/ApiError');

// Hash only the public catalog's source fields, never private stock, history,
// or accounting. A content digest catches deletes and same-millisecond edits;
// a timestamp/MAX alone cannot. Stream product rows to bound server memory.
// No cache: clients compare immediately before/after a multi-page download.
async function getCatalogRevision(warehouseId, now = new Date()) {
  if (!(await isWarehouseAvailable(warehouseId))) throw ApiError.notFound('Warehouse not found.');
  const hash = createHash('sha256');
  const add = (kind, row) => hash.update(`${kind}:${JSON.stringify(row)}\n`);
  add('schema', 1);
  const masterIds = new Set();
  const manufacturerIds = new Set();
  let productCount = 0;
  for await (const row of Product.find({ warehouseId, ...Product.VISIBLE_TO_PHARMACIES })
    .select(CATALOG_PRODUCT_SELECT).sort({ _id: 1 }).lean().cursor()) {
    productCount++;
    if (row.masterProductId) masterIds.add(String(row.masterProductId));
    if (row.manufacturerId) manufacturerIds.add(String(row.manufacturerId));
    add('product', row);
  }
  for (const [kind, query] of [
    ['identity', ProductCatalog.find({ _id: { $in: [...masterIds] } }).select(PRODUCT_IDENTITY_POPULATE.select)],
    ['manufacturer', Manufacturer.find({ _id: { $in: [...manufacturerIds] } }).select('nameAr nameEn logoUrl')],
    ['discount', ManufacturerDiscount.find({ warehouseId }).select('manufacturerId manufacturerAr discountPercentage')],
    // Active membership changes the digest exactly when a scheduled offer
    // starts/expires, even when no database row was changed at that instant.
    ['offer', Offer.find({ warehouseId, ...activeOfferFilter(now) })
      .select('productId offerType discountPercentage bonuses titleAr titleEn approvedAt')],
  ]) {
    for await (const row of query.sort({ _id: 1 }).lean().cursor()) add(kind, row);
  }
  const rate = await getRate();
  add('exchangeRate', rate?.usdToSyp ?? null);
  return { revision: hash.digest('hex'), productCount, checkedAt: now.toISOString() };
}
module.exports = { getCatalogRevision };
