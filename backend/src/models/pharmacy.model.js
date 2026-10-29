const { Schema, model } = require('mongoose');

const pharmacySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    nameAr: { type: String, required: true, trim: true },
    nameEn: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    // Collected on the registration screen's own dropdown (distinct from
    // `city`, which is a free-text city name defaulted server-side, not
    // user-chosen) - classifies where within its city the pharmacy sits.
    // Required at the schema level since
    // scripts/backfill-pharmacy-area-type.js backfilled every pre-existing
    // row to 'city' - see that script for why 'city' specifically, and
    // warehouseReview.service.js's createPharmacyReview for the `.save()`
    // this backfill had to land before (it would otherwise throw on any
    // legacy pharmacy the moment a warehouse rated it).
    areaType: { type: String, enum: ['city', 'city_ring', 'rural'], required: true },
    phone: { type: String, required: true },
    // Photo of the pharmacy's storefront/sign, meant to help the admin verify
    // the pharmacy physically exists before approving it. Not collected at
    // registration (Section 6.2 update) - reserved for a future verification
    // step, so it stays null unless/until that step is built. Entirely
    // separate from licenseImage below (an official syndicate document,
    // still unused/reserved).
    verificationPhoto: { type: String, default: null },
    // Reserved for a later stage - not used in the UI yet.
    licenseNumber: { type: String, default: null },
    licenseImage: { type: String, default: null },
    addedBy: { type: String, enum: ['admin', 'self'], required: true },
    averageRating: { type: Number, default: 0 },
    reviewsCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    // Optional - captured via the registration screen's map picker
    // (OpenStreetMap/Nominatim). `address` above stays the human-readable
    // text shown everywhere; this is only for future map/distance features.
    // GeoJSON order is [longitude, latitude], not [lat, lng].
    //
    // No default anywhere in here (not even 'Point' on the inner `type`) -
    // a default there makes Mongoose materialize a `{ type: 'Point' }`
    // subdocument with no `coordinates` on every save(), even for pharmacies
    // that never set a location, and the 2dsphere index then rejects that as
    // an invalid GeoJSON point on every single save. auth.service.js only
    // ever sets this whole field together with real coordinates, or not at
    // all - the schema needs to actually allow "not at all".
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    // The token in the pharmacy's visit QR (the sticker on its glass a rep
    // scans to log a visit - repPortal.service.js). Minted on first request
    // (pharmacyVisitCode.service.js), so older pharmacies simply have none
    // until someone asks. Not a secret on its own: a rep's scan only counts
    // when their phone is also at this pharmacy's `location`.
    visitCode: { type: String, default: undefined },
    // Coordinates submitted by a pharmacy are a proposal until the admin
    // confirms its real premises; reps cannot approve or move this point.
    locationApproval: { type: String, enum: ['pending', 'approved'], default: 'pending' },
    locationVersion: { type: Number, default: 0 },
    locationApprovedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    locationApprovedAt: { type: Date, default: null },
    // What the registration was checked against the syndicate list and what
    // came of it (services/syndicateRegistry.service.js). A copy, not a
    // reference: the list is replaced wholesale on every upload. Absent on
    // pharmacies registered before the check existed or added by an admin.
    //   decision 'approved' - found on the list, activated without waiting
    //            'review'   - not found (or doubtful); waits for an admin
    // `entryKey` identifies the listed pharmacist across uploads, so a second
    // account claiming the same listed name goes to review instead of in.
    syndicateMatch: {
      type: new Schema(
        {
          decision: { type: String, enum: ['approved', 'review'], required: true },
          score: { type: Number, default: 0 },
          reasons: { type: [String], default: [] },
          entryKey: { type: String, default: null },
          pharmacistName: { type: String, default: null },
          fatherName: { type: String, default: null },
          pharmacyName: { type: String, default: null },
          region: { type: String, default: null },
          place: { type: String, default: null },
          phones: { type: [String], default: [] },
          checkedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { timestamps: true }
);

pharmacySchema.index({ userId: 1 });
pharmacySchema.index({ city: 1 });
pharmacySchema.index({ location: '2dsphere' });
pharmacySchema.index({ visitCode: 1 }, { unique: true, sparse: true });

// Perf/pagination follow-up: plain single-field indexes backing the
// unanchored regex `$or` name searches (admin.service.js's
// buildAccountSearchOr, accountStatement.service.js's
// resolveMatchingPharmacyIds). Deliberately NOT a text index - see
// product.model.js's note for why, and for the measured limit: an unanchored
// `/x/i` still examines every index entry (no seek), but avoids fetching
// every full document the way a COLLSCAN does. `city` already has its own
// index above, so it is not repeated here.
pharmacySchema.index({ nameAr: 1 });
pharmacySchema.index({ nameEn: 1 });
pharmacySchema.index({ ownerName: 1 });
pharmacySchema.index({ phone: 1 });
// The duplicate-claim check in syndicateRegistry.service.js.
pharmacySchema.index({ 'syndicateMatch.entryKey': 1 }, { sparse: true });

module.exports = model('Pharmacy', pharmacySchema);
