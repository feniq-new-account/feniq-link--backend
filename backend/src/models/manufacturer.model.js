const { Schema, model } = require('mongoose');
const { normalizeText } = require('../utils/normalizeText');

// The central manufacturer (company) entity. Before this, a manufacturer was
// only a text field repeated on every ProductCatalog row, so two spellings of
// the same company were two companies - and a warehouse's discount on one
// never reached products filed under the other.
//
// ProductCatalog.manufacturerId (and, denormalized, Product.manufacturerId) is
// now the source of truth. ProductCatalog.manufacturerAr stays as a copy of
// `nameAr` so every existing response - and every installed app build - keeps
// reading the name exactly where it always has; manufacturer.service.js keeps
// that copy in sync on rename and merge.
//
// `key` is the identity: two names that normalize to the same key are the same
// manufacturer, which is what the unique index enforces.
const manufacturerSchema = new Schema(
  {
    nameAr: { type: String, required: true, trim: true },
    nameEn: { type: String, default: null, trim: true },
    key: { type: String, required: true },
    // normalizeText(nameEn): the English name as an import or a search writes
    // it ("GSK", "Glaxo Smith Kline"). Not unique - two companies may share an
    // English name, and then an English name alone resolves to neither.
    enKey: { type: String, default: null },
    // Cloudinary only, set by an admin (never a warehouse). null means the
    // app draws the first letter of the name in a coloured circle instead.
    logoUrl: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// A hook, not a setter, so `key` also follows `nameAr` on a rename made
// through .save() - the only way anything edits a manufacturer.
manufacturerSchema.pre('validate', function setKey(next) {
  this.key = normalizeText(this.nameAr);
  this.enKey = normalizeText(this.nameEn) || null;
  next();
});

manufacturerSchema.index({ key: 1 }, { unique: true });
manufacturerSchema.index({ enKey: 1 });

module.exports = model('Manufacturer', manufacturerSchema);
