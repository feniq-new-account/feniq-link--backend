const { Schema, model } = require('mongoose');

// A group of catalog items that normalize to the same identity (same medicine,
// same manufacturer, spelled differently) but that
// scripts/migrations/04-dedupe-catalog.js could NOT merge automatically - a
// warehouse has products linked to more than one of them, or they disagree on
// being active. The admin resolves each group on the Duplicate review screen
// by picking the survivor (and, per affected warehouse, which of its two
// products to keep), through the same merge routine the migration uses
// (catalogMerge.service.js).
const catalogDuplicateReviewSchema = new Schema(
  {
    identityKey: { type: String, required: true },
    catalogItemIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'ProductCatalog' }],
      required: true,
    },
    // Why the migration did not merge on its own.
    reasons: {
      type: [{ type: String, enum: ['warehouse_linked_to_several', 'mixed_active_state'] }],
      default: [],
    },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    survivorId: { type: Schema.Types.ObjectId, ref: 'ProductCatalog', default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Re-running the migration refreshes a group rather than filing it twice.
catalogDuplicateReviewSchema.index(
  { identityKey: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);
catalogDuplicateReviewSchema.index({ status: 1, _id: 1 });

module.exports = model('CatalogDuplicateReview', catalogDuplicateReviewSchema);
