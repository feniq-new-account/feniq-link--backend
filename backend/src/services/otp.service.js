// Phone verification codes.
//
// This module was written for the registration/login OTP flow, which is still
// switched off (auth.service.js: admin approval is the verification step for
// now). It is live again for one purpose: password recovery (Audit H-3), which
// is the account's only way back in now that /auth/register refuses a phone
// that already has an account.
const crypto = require('crypto');
const { ApiError } = require('../utils/ApiError');
const Otp = require('../models/otp.model');
const env = require('../config/env');
const { getSmsProvider } = require('./sms');

const CODE_LENGTH = 6;
const EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS_PER_WINDOW = 3;
const WINDOW_MINUTES = 15;

// Wrong guesses allowed against a single code before it is burned (Audit
// H-3c). Before this, verifyOtp had no per-code ceiling at all: the only
// thing standing between an attacker and a 6-digit secret was the shared
// 20-requests-per-IP-per-15-minutes auth limiter, which a handful of
// addresses walks straight through. Five is enough for a mistyped code and
// nowhere near enough to search 10^6.
const MAX_VERIFY_ATTEMPTS = 5;

function generateCode() {
  return crypto
    .randomInt(0, 10 ** CODE_LENGTH)
    .toString()
    .padStart(CODE_LENGTH, '0');
}

// Codes are stored hashed, never in plain text: a database dump, a backup
// file or a read-only leak must not hand out live password-reset codes.
//
// HMAC-SHA256 keyed with JWT_SECRET rather than bcrypt: a 6-digit code has
// only 10^6 values, so a slow hash would not stop an offline search anyway -
// the server-side key does. Without JWT_SECRET (which never sits in the
// database or its backups) a stolen hash cannot be brute-forced at all. The
// phone and purpose are mixed in so the same digits never produce the same
// stored value for two numbers or two flows.
const HASH_PREFIX = 'hmac-sha256:';

function hashCode(phone, purpose, code) {
  const digest = crypto
    .createHmac('sha256', env.jwtSecret)
    .update(`otp:${purpose}:${phone}:${code}`)
    .digest('hex');
  return `${HASH_PREFIX}${digest}`;
}

// Constant-time comparison of the stored hash against the hash of what was
// supplied, so the response time reveals nothing about how close a guess was.
// Both sides are fixed-length hex digests of the same algorithm.
function codesMatch(otp, supplied) {
  if (typeof supplied !== 'string' || !/^[0-9]+$/.test(supplied)) return false;
  const expected = Buffer.from(otp.code, 'utf8');
  const actual = Buffer.from(hashCode(otp.phone, otp.purpose, supplied), 'utf8');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

// Sends the code over whichever transport SMS_PROVIDER selects. The transport
// itself lives behind services/sms - no gateway is wired up yet, and the
// default `console` provider prints the message instead of sending it, so the
// whole flow is exercisable locally. See services/sms/smsProvider.js.
async function deliverSms(phone, code) {
  const message = `Your Feniq verification code is ${code}. It expires in ${EXPIRY_MINUTES} minutes.`;
  await getSmsProvider().send(phone, message);
}

// `purpose` scopes the code (otp.model.js): a password-reset code is only ever
// accepted by the password-reset flow. Defaulted so the dormant login flow's
// existing call site keeps its old behaviour untouched.
async function sendOtp(phone, purpose = 'login') {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  const recentCount = await Otp.countDocuments({
    phone,
    purpose,
    createdAt: { $gte: windowStart },
  });

  if (recentCount >= MAX_ATTEMPTS_PER_WINDOW) {
    throw ApiError.tooManyRequests(
      `Too many verification code requests for this number. Please wait ${WINDOW_MINUTES} minutes and try again.`,
      'OTP_RATE_LIMITED'
    );
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);

  // Only the hash is persisted; the plain code exists in memory just long
  // enough to be handed to the SMS transport.
  await Otp.create({ phone, purpose, code: hashCode(phone, purpose, code), expiresAt });
  await deliverSms(phone, code);

  return { expiresAt };
}

// Verifies and consumes the newest live code for this (phone, purpose).
//
// Note the shape change from the original: the lookup no longer includes the
// supplied `code` in the query. Matching on the code meant a wrong guess found
// no document at all, so there was nothing to count the guess against - which
// is precisely why the attempt ceiling could not exist before. Now the newest
// live code is loaded first and compared in the application, so every wrong
// guess is recorded against it and the code is burned at MAX_VERIFY_ATTEMPTS.
//
// Consequence worth knowing: requesting a second code does NOT keep the first
// one alive. Only the newest is ever considered, which is the behaviour users
// expect ("I asked for a new code, I'll use the new one") and one fewer live
// secret per phone.
async function verifyOtp(phone, code, purpose = 'login') {
  const otp = await Otp.findOne({
    phone,
    purpose,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  // Deliberately the same error for "no code outstanding", "expired",
  // "already used", "burned" and "wrong digits": which of those it is tells a
  // caller whether the phone has an account and whether a reset is in flight.
  const invalid = () =>
    ApiError.badRequest('Invalid or expired verification code.', undefined, 'INVALID_OTP');

  if (!otp) {
    throw invalid();
  }

  if (!codesMatch(otp, code)) {
    otp.attempts += 1;
    // Burn the code rather than merely counting: leaving it live would let the
    // attacker keep guessing and just eat the error.
    if (otp.attempts >= MAX_VERIFY_ATTEMPTS) {
      otp.isUsed = true;
    }
    await otp.save();
    throw invalid();
  }

  otp.isUsed = true;
  await otp.save();
}

module.exports = {
  sendOtp,
  verifyOtp,
  _hashCode: hashCode,
  _limits: { CODE_LENGTH, EXPIRY_MINUTES, MAX_ATTEMPTS_PER_WINDOW, WINDOW_MINUTES, MAX_VERIFY_ATTEMPTS },
};
