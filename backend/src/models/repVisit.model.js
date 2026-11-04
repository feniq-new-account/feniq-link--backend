const { Schema, model } = require('mongoose');

// One scan of a pharmacy's visit QR by a rep (repPortal.service.js).
//
// The QR on the pharmacy's glass is not proof on its own - anyone can
// photograph it. What makes a visit count is that the rep's phone was at the
// pharmacy when they scanned: the server compares the phone's location with
// the pharmacy's saved one and records the outcome in `status`:
//   - verified             within range of the pharmacy
//   - out_of_range         too far away (e.g. a photo of the QR scanned elsewhere)
//   - no_pharmacy_location the pharmacy never saved a location, so there was
//                          nothing to check against
//   - mock_location        the phone reported a faked location
// Every scan is kept, so the warehouse sees attempts that did not verify too.
const repVisitSchema = new Schema(
  {
    repId: { type: Schema.Types.ObjectId, ref: 'Rep', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    status: {
      type: String,
      enum: ['verified', 'out_of_range', 'no_pharmacy_location', 'mock_location', 'location_unapproved', 'poor_accuracy', 'stale_location'],
      required: true,
    },
    // Where the phone said it was. [longitude, latitude], like Pharmacy.location.
    coordinates: { type: [Number], default: undefined },
    accuracyMeters: { type: Number, default: null },
    locationCapturedAt: { type: Date, default: null },
    verificationPolicy: { radiusMeters: Number, maxAccuracyMeters: Number, maxAgeSeconds: Number },
    // Phone to pharmacy, when the pharmacy has a location.
    distanceMeters: { type: Number, default: null },
    scannedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

repVisitSchema.index({ warehouseId: 1, scannedAt: -1 });
repVisitSchema.index({ repId: 1, scannedAt: -1 });
repVisitSchema.index({ pharmacyId: 1, warehouseId: 1, scannedAt: -1 });

module.exports = model('RepVisit', repVisitSchema);
