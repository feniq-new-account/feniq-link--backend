const { asyncHandler } = require('../utils/asyncHandler');
const Pharmacy = require('../models/pharmacy.model');
const { ApiError } = require('../utils/ApiError');
const pharmacyVisitCodes = require('../services/pharmacyVisitCode.service');

// The pharmacy's own visit QR, for its app to show (and print) - the code a
// rep scans when they come by.
const show = asyncHandler(async (req, res) => {
  const pharmacy = await Pharmacy.findOne({ userId: req.user._id }).select('_id').lean();
  if (!pharmacy) {
    throw ApiError.notFound('Pharmacy profile not found.', 'PHARMACY_PROFILE_NOT_FOUND');
  }
  const code = await pharmacyVisitCodes.getOrCreateVisitCode(pharmacy._id);
  res.json({ success: true, code, qrPayload: pharmacyVisitCodes.qrPayloadFor(code) });
});

module.exports = { show };
