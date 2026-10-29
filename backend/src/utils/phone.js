// Normalizes to a consistent storage format and accepts Syrian mobile numbers
// in either local (09XXXXXXXX) or international (+9639XXXXXXXX) form.
const PHONE_REGEX = /^(?:\+963|0)9\d{8}$/;

function normalizePhone(phone) {
  if (typeof phone !== 'string') {
    return '';
  }
  return phone.replace(/[\s-]/g, '');
}

function isValidPhone(phone) {
  return typeof phone === 'string' && PHONE_REGEX.test(phone);
}

// The +9639XXXXXXXX form. The mobile app always signs in with this shape
// (phone_text_field.dart composes it). New reps use this storage format;
// password login also falls back to the other spelling for legacy accounts.
// Expects a number isValidPhone already accepted.
function toInternationalPhone(phone) {
  return phone.startsWith('0') ? `+963${phone.slice(1)}` : phone;
}

module.exports = { normalizePhone, isValidPhone, toInternationalPhone };
