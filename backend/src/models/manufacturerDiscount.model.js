const { Schema, model } = require('mongoose');
const Manufacturer = require('./manufacturer.model');
const { normalizeText } = require('../utils/normalizeText');

// Section 15: a warehouse-set, always-on discount applied to every one of
// its own products from a given manufacturer - distinct from Offer
// (admin-approved, time-bounded, per-product). Stacks with an active Offer
// on the same product rather than replacing it (project owner's decision),
// see manufacturerDiscount.service.js's computeFinalPrice.
//
// Keyed on the central Manufacturer (M3): the rule used to be keyed on the raw
// name typed into an import file, so a spelling that differed from the
// catalog's by one space or one hamza silently matched no product at all.
// `manufacturerAr` stays as the display copy the Discounts page shows, kept
// in sync by manufacturer.service.js on rename/merge.
const manufacturerDiscountSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    manufacturerId: { type: Schema.Types.ObjectId, ref: 'Manufacturer', default: null },
    manufacturerAr: { type: String, required: true, trim: true },
    // Any value > 0 and <= 100, decimals allowed (e.g. 2.5) - the service
    // validates the same bound, so the two can no longer disagree (L2).
    discountPercentage: {
      type: Number,
      required: true,
      validate: { validator: (value) => value > 0 && value <= 100 },
    },
  },
  { timestamps: true }
);

// A row written by a caller that only knows the name (the pre-Manufacturer
// code, older fixtures) is linked to the existing Manufacturer that name
// normalizes to. Never creates one - a discount is not how a company comes to
// exist.
manufacturerDiscountSchema.pre('validate', async function linkManufacturer() {
  if (this.manufacturerId || !this.manufacturerAr) return;
  const manufacturer = await Manufacturer.findOne({ key: normalizeText(this.manufacturerAr) })
    .select('_id')
    .session(this.$session())
    .lean();
  if (manufacturer) this.manufacturerId = manufacturer._id;
});

// One discount rule per (warehouse, manufacturer) - editing an existing rule
// is a PATCH, not a second row. Partial: rows the migration could not match to
// a manufacturer (reported, never dropped) keep a null id and must not collide.
manufacturerDiscountSchema.index(
  { warehouseId: 1, manufacturerId: 1 },
  { unique: true, partialFilterExpression: { manufacturerId: { $type: 'objectId' } } }
);

module.exports = model('ManufacturerDiscount', manufacturerDiscountSchema);
