const { Schema, model } = require('mongoose');
const Manufacturer = require('./manufacturer.model');
const { normalizeText } = require('../utils/normalizeText');

// The one place the identity key's shape is spelled out - the hook below, the
// rename/merge syncs and the migrations all build it through this.
//
// An item is identified by its Arabic name, or - when it has only an English
// one - by that, prefixed "en:". A normalized Arabic key can never start with
// "en:" (normalizeText turns ":" into a space), so an Arabic identity and an
// English identity never collide.
function identityKeyOf(nameKey, manufacturerKey, nameEnKey = null) {
  if (!nameKey && nameEnKey) return `en:${nameEnKey}|${manufacturerKey ?? ''}`;
  return `${nameKey ?? ''}|${manufacturerKey ?? ''}`;
}

// Mirrors product.model.js's priceHistoryEntrySchema, for the same reason: a
// catalog entry's name is resolved live onto every linked product wherever
// one is read (productCatalog.service.js's applyResolvedIdentity) rather than
// copied at write time, so a rename silently restates what a medicine is
// called everywhere it appears. Without this there is no record of what it
// used to be. `changedBy` is nullable only because a rename can come from a
// script rather than a logged-in admin.
const nameHistoryEntrySchema = new Schema(
  {
    // Either name can change - and either can be missing (one-language items).
    oldNameAr: { type: String, default: null },
    newNameAr: { type: String, default: null },
    oldNameEn: { type: String, default: null },
    newNameEn: { type: String, default: null },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Section 14: the admin-curated master medicine list. Rows come from the
// admin's Excel import and from approved warehouse catalog requests
// (catalogRequest.service.js); every warehouse product links to one through
// Product.masterProductId.
//
// categoryId/unitAr are nullable: the Excel template only carries name +
// price (Section 14 Part 1), so a freshly imported row has neither until an
// admin fills them in via PATCH.
const productCatalogSchema = new Schema(
  {
    // At least one of the two names (validated below): a medicine may be
    // known by its Arabic name only, its English name only, or both.
    nameAr: { type: String, default: null, trim: true },
    nameEn: { type: String, default: null, trim: true },
    manufacturerAr: { type: String, required: true, trim: true },
    manufacturerEn: { type: String, default: null, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    unitAr: { type: String, default: null, trim: true },
    unitEn: { type: String, default: null, trim: true },
    // USD, matching every other price in the app (Section: USD-first catalog
    // pricing) - fed by the Excel template's price column. Nullable: a
    // medicine can be imported into the central list with no price yet
    // (project owner's call) - a warehouse fills it in manually later, on its
    // own product, not here.
    priceUsd: { type: Number, default: null, min: 0 },
    // Normalized copies of nameAr/manufacturerAr/nameEn (utils/normalizeText),
    // kept in sync by the pre-validate hook below and never set by hand. They
    // make a lookup by name an indexed equality match, and they are what every
    // search compares against, so two spellings of one word always meet.
    nameKey: { type: String, default: null },
    manufacturerKey: { type: String, default: null },
    nameEnKey: { type: String, default: null },
    manufacturerEnKey: { type: String, default: null },
    // `${nameKey}|${manufacturerKey}` - what makes a catalog item unique. Two
    // entries that only differ by spelling (hamza, ta marbuta, spacing, case)
    // are the same medicine; the unique index below enforces it once
    // scripts/migrations/04-dedupe-catalog.js has merged the historical ones.
    identityKey: { type: String, default: null },
    // The central manufacturer (manufacturer.model.js) - the source of truth
    // for who makes this medicine. `manufacturerAr` above stays as a copy of
    // its nameAr for every existing reader; manufacturer.service.js keeps the
    // copy in sync. Null only on rows written before the Manufacturer
    // collection existed, until scripts/migrations/00-manufacturers.js runs -
    // and the pre-validate hook below fills it on the next save anyway.
    manufacturerId: { type: Schema.Types.ObjectId, ref: 'Manufacturer', default: null },
    // The central image every warehouse product linked to this item shows,
    // unless the product carries its own override (Product.image). Cloudinary
    // only, set by an admin.
    imageUrl: { type: String, default: null },
    nameHistory: { type: [nameHistoryEntrySchema], default: [] },
    isActive: { type: Boolean, default: true },
    // Written by every warehouse product create/link, inside its transaction
    // (warehouseProduct.service.js). Its real job is concurrency: that write
    // makes a create and a concurrent recall of the same item conflict, so one
    // of them retries and sees the other - a product can never be linked to an
    // item in the instant it is being withdrawn.
    lastLinkedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Kept as a named export (the import and older scripts call it) but now just
// the shared normalizer: hamza/ta-marbuta/alef-maksura unification, tashkeel,
// Arabic digits and punctuation on top of the old case + whitespace folding.
// Returns null (not '') for a missing value, as it always has.
function searchKey(value) {
  return typeof value === 'string' ? normalizeText(value) : null;
}

// A hook rather than a setter on each path: the keys must also be correct for
// documents created through `Model.create` with only the display fields set,
// and must follow a later edit to either name (updateCatalogItem changes
// nameAr). Runs on every save, so the keys can never drift from the fields
// they mirror.
//
// A row saved without a manufacturerId (the pre-Manufacturer code paths, and
// every test fixture written before it) is linked to the Manufacturer its
// manufacturerAr normalizes to, creating it if none exists yet - so no catalog
// item is ever saved without one. Services that must not create a
// manufacturer silently (the admin import asks first) resolve it themselves
// before saving and pass manufacturerId.
//
// updateMany-style writes (the rename/merge syncs in manufacturer.service.js
// and productCatalog.service.js) bypass this hook and set the same keys
// explicitly.
productCatalogSchema.pre('validate', async function setSearchKeys() {
  // An empty name is no name.
  if (typeof this.nameAr === 'string' && !this.nameAr.trim()) this.nameAr = null;
  if (typeof this.nameEn === 'string' && !this.nameEn.trim()) this.nameEn = null;
  if (!this.nameAr && !this.nameEn) {
    this.invalidate('nameAr', 'A catalog item needs an Arabic or an English name.');
  }
  if (!this.manufacturerId && typeof this.manufacturerAr === 'string' && this.manufacturerAr.trim()) {
    const key = normalizeText(this.manufacturerAr);
    const manufacturer = await Manufacturer.findOneAndUpdate(
      { key },
      {
        $setOnInsert: {
          nameAr: this.manufacturerAr.trim(),
          nameEn: this.manufacturerEn ?? null,
          key,
          enKey: searchKey(this.manufacturerEn),
        },
      },
      { upsert: true, new: true, session: this.$session() }
    );
    this.manufacturerId = manufacturer._id;
    // The copy follows the Manufacturer's canonical spelling, so every item of
    // one company displays (and filters) under one name.
    this.manufacturerAr = manufacturer.nameAr;
    if (manufacturer.nameEn && !this.manufacturerEn) this.manufacturerEn = manufacturer.nameEn;
  }
  this.nameKey = searchKey(this.nameAr);
  this.nameEnKey = searchKey(this.nameEn);
  this.manufacturerKey = searchKey(this.manufacturerAr);
  this.manufacturerEnKey = searchKey(this.manufacturerEn);
  this.identityKey = identityKeyOf(this.nameKey, this.manufacturerKey, this.nameEnKey);
});

// What makes a catalog item unique (see identityKey above). It replaces the
// old unique index on the raw display pair (nameAr, manufacturerAr), which let
// "Panadol" and "panadol" - or two hamza spellings - coexist as two medicines.
// On a database that still holds such duplicates this index cannot be built;
// scripts/migrations/04-dedupe-catalog.js merges them first, then builds it.
productCatalogSchema.index({ identityKey: 1 }, { unique: true });

// Name lookups and the import's suggestion prefilter (an anchored regex on
// nameKey can seek on this index's prefix). Not unique - identityKey is.
productCatalogSchema.index({ nameKey: 1, manufacturerKey: 1 });

// M6: the manufacturer filter/type-ahead and the category filter used to scan
// the whole collection - neither field was the prefix of any index.
productCatalogSchema.index({ manufacturerKey: 1 });
productCatalogSchema.index({ categoryId: 1 });

// Rename and merge in manufacturer.service.js rewrite every item of one
// manufacturer at once.
productCatalogSchema.index({ manufacturerId: 1 });

// Perf/pagination follow-up: plain single-field indexes backing the free-text
// search on the English names - NOT a text index, see product.model.js.
productCatalogSchema.index({ nameEn: 1 });
productCatalogSchema.index({ manufacturerEn: 1 });

module.exports = model('ProductCatalog', productCatalogSchema);
// Exported so the import path and the migrations derive their lookup keys
// with the exact same functions the documents were written with.
module.exports.searchKey = searchKey;
module.exports.identityKeyOf = identityKeyOf;
