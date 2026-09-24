const { Schema, model } = require('mongoose');
const Manufacturer = require('./manufacturer.model');
const { UNIT_CODES } = require('../config/units');
const { normalizeText } = require('../utils/normalizeText');

const priceHistoryEntrySchema = new Schema(
  {
    oldPrice: { type: Number, required: true },
    newPrice: { type: Number, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
    // The USD/SYP rate a price entered or imported in SYP was converted at -
    // null for a price that was entered in USD (nothing was converted).
    exchangeRateUsed: { type: Number, default: null },
  },
  { _id: false }
);

// One bonus tier: buy `buy` units, get `free` more at no charge (see
// utils/bonus.js for parsing and the free-quantity maths). A bonus is not an
// Offer - no admin approval, no link to the offer rules.
const bonusTierSchema = new Schema(
  {
    buy: { type: Number, required: true, min: 1, validate: Number.isInteger },
    free: { type: Number, required: true, min: 1, validate: Number.isInteger },
  },
  { _id: false }
);

// Why `isActive` is false. `isActive` is the platform-level switch (admin or
// catalog recall) and `manuallyDisabled` the warehouse's own - this records
// which platform action turned a product off, because the two are undone
// differently: reactivating a catalog item brings back only its
// 'catalog_recall' products (productCatalog.service.js), never the ones an
// admin disabled one by one.
const DEACTIVATED_BY = ['catalog_recall', 'admin'];

const productSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    // Nullable at the schema level only for legacy rows created before
    // Section 14 Part 2 - warehouseProduct.service.js's createProduct
    // enforces this as required for every new product (business rule, not a
    // DB constraint), so a Mongoose-level `required: true` here would break
    // `.save()` on the legacy rows below the moment anything else about them
    // changes. Categorization for an imported product may also not be set
    // yet (the catalog's own categoryId is optional too, see
    // productCatalog.model.js), hence also nullable here.
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    // Section 14 Part 2: the source of truth for name/manufacturer once set
    // - resolved live from the populated catalog entry wherever a product is
    // read (see productCatalog.service.js's applyResolvedIdentity). Only the
    // normalized search keys below are copied onto the product, and only so
    // the searches can run as one Mongo query; OrderItem snapshots the
    // display names at order time (Section 6.8).
    masterProductId: { type: Schema.Types.ObjectId, ref: 'ProductCatalog', default: null },
    // legacy — needs catalog linking: only ever read directly (as a
    // fallback) for a product created before Part 2, i.e. masterProductId is
    // null. New products leave these unset; nothing writes to them anymore.
    nameAr: { type: String, default: null, trim: true },
    nameEn: { type: String, default: null, trim: true },
    manufacturerAr: { type: String, default: null, trim: true },
    manufacturerEn: { type: String, default: null, trim: true },
    // Denormalized, normalized (utils/normalizeText) search keys: copied from
    // the linked catalog item (or computed from the legacy fields above) by
    // the pre-validate hook below, and rewritten with updateMany whenever a
    // catalog item or manufacturer is renamed (productCatalog.service.js,
    // manufacturer.service.js). They are what lets the pharmacist, warehouse
    // and admin searches filter a warehouse's products in a single indexed
    // Mongo query instead of resolving each product in Node.
    nameKey: { type: String, default: null },
    nameEnKey: { type: String, default: null },
    manufacturerKey: { type: String, default: null },
    manufacturerEnKey: { type: String, default: null },
    // Copied from the catalog item (manufacturer.model.js). What manufacturer
    // discounts are matched against (manufacturerDiscount.service.js).
    manufacturerId: { type: Schema.Types.ObjectId, ref: 'Manufacturer', default: null },
    description: { type: String, default: null },
    // The warehouse's own OVERRIDE image. What every response shows is the
    // effective image - this, or else the catalog item's central imageUrl
    // (productCatalog.service.js's applyResolvedIdentity). Cloudinary only.
    image: { type: String, default: null },
    // USD, not SYP - warehouses enter and edit prices in USD (Section: USD-
    // first catalog pricing); SYP is derived live from the current exchange
    // rate wherever it's shown or charged (see order.service.js). Field name
    // kept as `price` to avoid a schema rename - always serialized as
    // `priceUsd` at the API boundary, see the viewmodels. priceHistory
    // entries below are USD too, same reasoning. Pre-existing SYP data was
    // converted once via scripts/migrate-prices-to-usd.js.
    price: { type: Number, required: true, min: 0 },
    // TODO(re-enable-stock): quantity tracking is on hold (project owner's
    // decision) - availability is manuallyDisabled-only for now. Field kept
    // commented rather than dropped so the column isn't lost on existing
    // documents and the tracking can come back without a migration.
    // stockQuantity: { type: Number, required: true, min: 0, default: 0 },
    // Computed by warehouseProduct.service.js as (!manuallyDisabled) whenever
    // manuallyDisabled changes - not written to directly by controllers.
    isAvailable: { type: Boolean, default: true },
    manuallyDisabled: { type: Boolean, default: false },
    // Legacy free-text units. New code writes `unit` (a fixed code, see
    // config/units.js); these stay for the products written before it, and
    // are still sent so installed app builds keep showing a unit.
    unitAr: { type: String, default: null },
    unitEn: { type: String, default: null },
    // A code from config/units.js. Null on products created before the fixed
    // unit list existed.
    unit: { type: String, enum: [...UNIT_CODES, null], default: null },
    // Bonus tiers (e.g. [{buy:10, free:1}, {buy:20, free:3}]) - see bonusTierSchema.
    bonuses: { type: [bonusTierSchema], default: [] },
    isActive: { type: Boolean, default: true },
    // Why isActive is false - see DEACTIVATED_BY above. Null while active.
    deactivatedBy: { type: String, enum: [...DEACTIVATED_BY, null], default: null },
    lastPriceUpdate: { type: Date, default: Date.now },
    // Written inside every offer create/approve transaction for this product
    // (offer.service.js's assertNoRunningOffer): two concurrent attempts to
    // put an offer on the same product then conflict, and the retry sees the
    // first one - so "one offer per product" holds under concurrency.
    lastOfferCheckAt: { type: Date, default: null },
    priceHistory: { type: [priceHistoryEntrySchema], default: [] },
  },
  // optimisticConcurrency: every .save() carries a `__v` precondition, so an
  // admin edit and a warehouse edit landing on the same product at once
  // cannot silently overwrite each other (warehouseProduct.service.js turns
  // the resulting VersionError into 409 PRODUCT_CHANGED).
  { timestamps: true, optimisticConcurrency: true }
);

// Keeps the search keys and manufacturerId in step with whatever identifies
// this product - its catalog item when linked, its own legacy fields when not.
// Runs on every save/create; bulk writes (the Excel import) set the same
// fields explicitly, and the rename syncs use updateMany.
//
// The catalog read only happens when something that feeds the keys changed
// (a new product, a re-link) or the keys are missing (a row written before
// they existed), so an ordinary price edit costs no extra query.
productSchema.pre('validate', async function syncSearchKeys() {
  const session = this.$session();

  if (this.masterProductId) {
    const needsSync = this.isNew || this.isModified('masterProductId') || this.nameKey == null;
    if (!needsSync) return;
    const catalogId = this.populated('masterProductId') || this.masterProductId;
    const ProductCatalog = this.model('ProductCatalog');
    const catalogItem = await ProductCatalog.findById(catalogId)
      .select('nameKey nameEnKey manufacturerKey manufacturerEnKey manufacturerId')
      .session(session)
      .lean();
    if (!catalogItem) return;
    this.nameKey = catalogItem.nameKey;
    this.nameEnKey = catalogItem.nameEnKey;
    this.manufacturerKey = catalogItem.manufacturerKey;
    this.manufacturerEnKey = catalogItem.manufacturerEnKey ?? null;
    this.manufacturerId = catalogItem.manufacturerId;
    return;
  }

  const legacyChanged =
    this.isNew ||
    this.nameKey == null ||
    ['nameAr', 'nameEn', 'manufacturerAr', 'manufacturerEn'].some((field) => this.isModified(field));
  if (!legacyChanged) return;
  this.nameKey = normalizeText(this.nameAr) || null;
  this.nameEnKey = normalizeText(this.nameEn) || null;
  this.manufacturerKey = normalizeText(this.manufacturerAr) || null;
  this.manufacturerEnKey = normalizeText(this.manufacturerEn) || null;
  // A legacy row's manufacturer is only linked if the Manufacturer already
  // exists - never created from a legacy product's free text.
  if (this.manufacturerKey) {
    const manufacturer = await Manufacturer.findOne({ key: this.manufacturerKey })
      .select('_id')
      .session(session)
      .lean();
    this.manufacturerId = manufacturer ? manufacturer._id : null;
  }
});

// Level 2 (see docs/PERFORMANCE_OPTIMIZATION.md). The catalog browses cursor
// on `_id` ascending:
//   with a category filter -> {warehouseId,categoryId,_id}
//   without one            -> {warehouseId,_id}
productSchema.index({ warehouseId: 1, categoryId: 1, _id: 1 });
productSchema.index({ warehouseId: 1, _id: 1 });

// The pharmacist's warehouse -> manufacturer -> products drill-down: one
// warehouse, one manufacturer (by normalized key), paged by `_id`. Replaces
// the old fetch-and-filter-in-Node loop (H1).
productSchema.index({ warehouseId: 1, manufacturerKey: 1, _id: 1 });

// Manufacturer rename/merge rewrite every product of one manufacturer, and the
// warehouse's company list groups on it.
productSchema.index({ manufacturerId: 1, warehouseId: 1 });

// M6: a catalog rename's confirmation count and a recall's updateMany both
// select by masterProductId alone, which the partial unique index below
// cannot serve (its prefix is warehouseId).
productSchema.index({ masterProductId: 1 });

// The four former single-field indexes on nameAr/nameEn/manufacturerAr/
// manufacturerEn are gone: they only ever served the unanchored-regex search
// on the legacy fields, which every search now runs against the normalized
// keys above instead. Dropped from existing databases by
// scripts/migrations/06-drop-legacy-indexes.js.

// A warehouse can't link the same catalog entry to two of its own products
// (Section 14 Part 2) - partial so it only applies once masterProductId is
// actually set, leaving legacy (null-masterProductId) rows unconstrained.
productSchema.index(
  { warehouseId: 1, masterProductId: 1 },
  { unique: true, partialFilterExpression: { masterProductId: { $type: 'objectId' } } }
);

module.exports = model('Product', productSchema);
module.exports.DEACTIVATED_BY = DEACTIVATED_BY;
