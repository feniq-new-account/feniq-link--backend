const bcrypt = require('bcrypt');
const { ApiError } = require('../utils/ApiError');
const { normalizePhone, isValidPhone, toInternationalPhone } = require('../utils/phone');
const { assertPasswordPolicy } = require('../utils/password');
const User = require('../models/user.model');

// A dedicated admin-only operational onboarding path; no warehouse Rep profile,
// balances, commissions, order data or finance services are touched.
async function createExternalDriver({ name, phone, password } = {}) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 160) {
    throw ApiError.badRequest('Driver name must be 1–160 characters.', undefined, 'INVALID_DRIVER_NAME');
  }
  const rawPhone = normalizePhone(phone);
  if (!isValidPhone(rawPhone)) {
    throw ApiError.badRequest('Invalid driver phone number.', undefined, 'INVALID_PHONE_FORMAT');
  }
  assertPasswordPolicy(password, { role: 'driver', code: 'INVALID_PASSWORD' });
  const canonicalPhone = toInternationalPhone(rawPhone);
  const localPhone = '0' + canonicalPhone.slice(4);

  // Protect the legacy local-number spelling too. The unique database index
  // separately handles concurrent requests with the canonical spelling.
  const duplicate = await User.exists({ phone: { $in: [canonicalPhone, localPhone] } });
  if (duplicate) {
    throw ApiError.conflict('An account already exists for this phone number.', 'PHONE_ALREADY_REGISTERED');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  let driver;
  try {
    driver = await User.create({
      name: name.trim(),
      phone: canonicalPhone,
      password: passwordHash,
      role: 'driver',
      status: 'active',
      mustChangePassword: true,
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw ApiError.conflict('An account already exists for this phone number.', 'PHONE_ALREADY_REGISTERED');
    }
    throw err;
  }
  return {
    userId: driver._id,
    name: driver.name,
    phone: driver.phone,
    role: driver.role,
    status: driver.status,
    mustChangePassword: driver.mustChangePassword,
  };
}

module.exports = { createExternalDriver };
