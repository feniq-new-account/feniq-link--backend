const { Schema, model } = require('mongoose');

// How many live orders one pharmacy currently holds under one discount code.
// The per-pharmacy half of the usage limit: order.service.js claims a use with
// a conditional $inc (`count < maxUsesPerPharmacy`) inside the order's own
// transaction, so two concurrent orders from the same pharmacy can never both
// take the last allowed use. Cancelling or fully returning the order hands the
// use back (discountCode.service.js's releaseUse).
//
// One document per (code, pharmacy), upserted BEFORE the order transaction
// opens - an upsert inside a transaction can collide with a lazy index build,
// the same reason ledger.service.js resolves accounts up front.
const discountCodePharmacyUsageSchema = new Schema(
  {
    codeId: { type: Schema.Types.ObjectId, ref: 'DiscountCode', required: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    count: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

discountCodePharmacyUsageSchema.index({ codeId: 1, pharmacyId: 1 }, { unique: true });

module.exports = model('DiscountCodePharmacyUsage', discountCodePharmacyUsageSchema);
