const { Schema, model } = require('mongoose');
const { normalizeText } = require('../utils/normalizeText');

// `key` is the identity: normalizeText(nameAr). Two categories whose Arabic
// names normalize the same ("صادات حيوية" / "صادات حيويه") are the same
// category, which is what the unique index enforces - so two catalog imports
// racing to create one new category cannot make two (category.service.js
// re-reads the winner on the duplicate-key error). Migration 07 backfills it
// on older categories and merges the duplicates it finds.
const categorySchema = new Schema(
  {
    nameAr: { type: String, required: true, trim: true },
    nameEn: { type: String, required: true, trim: true },
    key: { type: String, required: true },
    icon: { type: String, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// A hook, not a setter, so `key` also follows `nameAr` on a rename made
// through .save() - the only way anything edits a category.
categorySchema.pre('validate', function setKey(next) {
  this.key = normalizeText(this.nameAr);
  next();
});

categorySchema.index({ key: 1 }, { unique: true });

module.exports = model('Category', categorySchema);
