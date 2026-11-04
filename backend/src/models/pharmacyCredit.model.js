const { Schema, model } = require('mongoose');

// A pharmacy's credit at one warehouse: its quarter of the rep commission on
// earlier delivered orders (utils/repCommission.js), taken off its next order
// from that warehouse automatically. Money, in SYP - not points.
// pharmacyCredit.service.js is the only writer; every change also leaves a
// creditEntry for the record.
const pharmacyCreditSchema = new Schema(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    balanceSyp: { type: Number, default: 0, min: 0 },
    // Separate from commission credit. A return may make the loyalty wallet
    // negative after its reward was spent; only future loyalty/released
    // loyalty offsets that shortfall. It never takes commission or adds a
    // cash receivable to the pharmacy ledger.
    loyaltyBalanceSyp: { type: Number, default: 0 },
  },
  { timestamps: true }
);

pharmacyCreditSchema.index({ pharmacyId: 1, warehouseId: 1 }, { unique: true });

module.exports = model('PharmacyCredit', pharmacyCreditSchema);
