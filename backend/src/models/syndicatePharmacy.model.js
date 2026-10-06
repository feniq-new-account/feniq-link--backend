const { Schema, model } = require('mongoose');

// One pharmacist from the pharmacists' syndicate list, which new pharmacy
// registrations are checked against (services/syndicateRegistry.service.js).
// The whole list is replaced on every upload - it is reference data, never
// edited row by row - so nothing else in the database points at these _ids;
// a matched registration keeps its own copy of what it matched (see
// pharmacy.model.js syndicateMatch).
const syndicatePharmacySchema = new Schema(
  {
    pharmacistName: { type: String, required: true, trim: true },
    fatherName: { type: String, default: '', trim: true },
    pharmacyName: { type: String, default: '', trim: true },
    // 09XXXXXXXX, as the cleaned list writes them.
    phones: { type: [String], default: [] },
    region: { type: String, default: '', trim: true },
    place: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    notes: { type: String, default: '' },
    sourceRow: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = model('SyndicatePharmacy', syndicatePharmacySchema);
