const { Schema, model } = require('mongoose');

// The outcome of one data row of a warehouse import (see importBatch.model.js
// for why these are their own collection). `bucket` is the results page's tab:
//   added          - a new product was created
//   updated        - an existing product's price/unit/bonus were updated
//   added_disabled - created or updated with price 0, so left disabled by the
//                    warehouse (manuallyDisabled) until it sets a real price
//   blocked        - the product exists but is disabled by the admin or its
//                    catalog item was withdrawn; nothing was changed
//   review         - needs the warehouse: not matched, duplicate in the file,
//                    an unparseable bonus, an unknown unit or currency
//   resolved       - was in review, and the warehouse has since resolved it
//   error          - unreadable (no name, no price)
const IMPORT_ROW_BUCKETS = ['added', 'updated', 'added_disabled', 'blocked', 'review', 'resolved', 'error'];

const REVIEW_REASONS = [
  'not_matched',
  'unknown_manufacturer',
  'duplicate_in_file',
  'bad_bonus',
  'unknown_unit',
  'unknown_currency',
  'missing_currency',
];

const suggestionSchema = new Schema(
  {
    masterProductId: { type: Schema.Types.ObjectId, ref: 'ProductCatalog', required: true },
    nameAr: { type: String, default: null },
    manufacturerAr: { type: String, default: null },
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const importBatchRowSchema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    rowNumber: { type: Number, required: true },
    bucket: { type: String, enum: IMPORT_ROW_BUCKETS, required: true },
    // Exactly what the file said, for display on the results page.
    raw: {
      name: { type: String, default: null },
      manufacturer: { type: String, default: null },
      price: { type: String, default: null },
      currency: { type: String, default: null },
      unit: { type: String, default: null },
      bonus: { type: String, default: null },
    },
    // What could be parsed out of it. Null fields could not be parsed.
    parsed: {
      priceUsd: { type: Number, default: null },
      currency: { type: String, default: null },
      unit: { type: String, default: null },
      bonuses: { type: [{ _id: false, buy: Number, free: Number }], default: undefined },
      // True when the bonus cell was present (an empty cell clears the bonus,
      // a missing column leaves it untouched).
      bonusGiven: { type: Boolean, default: false },
    },
    reasons: { type: [{ type: String, enum: REVIEW_REASONS }], default: [] },
    // For 'blocked': CATALOG_ITEM_WITHDRAWN or PRODUCT_DISABLED_BY_ADMIN.
    blockedCode: { type: String, default: null },
    // For 'review': the top-5 catalog matches at import time.
    suggestions: { type: [suggestionSchema], default: [] },
    // Rows of one duplicate-in-file group share this (the catalog item id they
    // both matched) - the warehouse picks which row's price to keep.
    duplicateOf: { type: Schema.Types.ObjectId, ref: 'ProductCatalog', default: null },
    masterProductId: { type: Schema.Types.ObjectId, ref: 'ProductCatalog', default: null },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    catalogRequestId: { type: Schema.Types.ObjectId, ref: 'CatalogRequest', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The results page lists one tab of one batch, in file order.
importBatchRowSchema.index({ batchId: 1, bucket: 1, rowNumber: 1 });

module.exports = model('ImportBatchRow', importBatchRowSchema);
module.exports.IMPORT_ROW_BUCKETS = IMPORT_ROW_BUCKETS;
module.exports.REVIEW_REASONS = REVIEW_REASONS;
