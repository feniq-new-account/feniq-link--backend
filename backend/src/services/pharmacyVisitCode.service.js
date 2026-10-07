const crypto = require('node:crypto');
const Pharmacy = require('../models/pharmacy.model');
const { ApiError } = require('../utils/ApiError');

// The visit QR: one per pharmacy, printed and stuck on its glass (or shown
// from the pharmacy's own app). Any rep of any warehouse scans the same code -
// what the scan proves is decided by repPortal.service.js, which also checks
// that the rep's phone was at the pharmacy.
//
// The QR carries `FENIQ-VISIT:<code>`. The prefix lets the rep app tell a
// Feniq sticker from any other QR code it is pointed at.
const QR_PREFIX = 'FENIQ-VISIT:';

// 16 characters from an alphabet without look-alikes (no 0/O, 1/I/L), so a
// code can also be read out over the phone if a sticker is damaged.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 16;
const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

function qrPayloadFor(code) {
  return `${QR_PREFIX}${code}`;
}

// Accepts the full QR text or the bare code (typed by hand); returns the code
// or null when the text is not a Feniq visit code at all.
function parseVisitCode(text) {
  if (typeof text !== 'string') return null;
  let value = text.trim().toUpperCase();
  if (value.startsWith(QR_PREFIX)) value = value.slice(QR_PREFIX.length);
  return CODE_PATTERN.test(value) ? value : null;
}

// The pharmacy's code, minted the first time anyone asks for it. Two requests
// racing for the same pharmacy both end up with the one code that was written:
// the update only applies while the field is still missing, and whoever loses
// re-reads the winner's value.
async function getOrCreateVisitCode(pharmacyId) {
  const pharmacy = await Pharmacy.findById(pharmacyId).select('visitCode').lean();
  if (!pharmacy) {
    throw ApiError.notFound('Pharmacy not found.', 'PHARMACY_NOT_FOUND');
  }
  if (pharmacy.visitCode) return pharmacy.visitCode;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const updated = await Pharmacy.findOneAndUpdate(
        { _id: pharmacyId, visitCode: { $exists: false } },
        { $set: { visitCode: generateCode() } },
        { new: true, projection: { visitCode: 1 } }
      ).lean();
      if (updated) return updated.visitCode;
      const current = await Pharmacy.findById(pharmacyId).select('visitCode').lean();
      if (current && current.visitCode) return current.visitCode;
    } catch (err) {
      // 11000: another pharmacy already holds this exact code - draw again.
      if (!(err && err.code === 11000)) throw err;
    }
  }
  throw ApiError.conflict('Could not create a visit code. Please retry.', 'VISIT_CODE_UNAVAILABLE');
}

async function findPharmacyByVisitCode(code) {
  return Pharmacy.findOne({ visitCode: code }).select('_id nameAr nameEn location isActive').lean();
}

module.exports = {
  QR_PREFIX,
  qrPayloadFor,
  parseVisitCode,
  getOrCreateVisitCode,
  findPharmacyByVisitCode,
};
