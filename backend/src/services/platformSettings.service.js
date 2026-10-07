const crypto = require('crypto');
const env = require('../config/env');
const PlatformSetting = require('../models/platformSetting.model');

// Settings the owner switches from the admin panel (from a phone, without
// touching the host's environment). Each has an environment-variable
// fallback, used until the panel sets a value.
const KEYS = {
  ACCOUNT_APPROVAL: 'accountApproval',
  TELEGRAM_BOT_TOKEN: 'telegramBotToken',
};

async function getValue(key) {
  const doc = await PlatformSetting.findOne({ key }).select('value').lean();
  return doc ? doc.value : undefined;
}

async function setValue(key, value) {
  await PlatformSetting.updateOne({ key }, { $set: { value } }, { upsert: true });
}

// Whether a new pharmacy that is not on the syndicate list waits for an admin.
// Off: everyone is let in at once (the launch behaviour). The panel's switch
// wins over REQUIRE_ACCOUNT_APPROVAL once it has been used.
async function isApprovalRequired() {
  const value = await getValue(KEYS.ACCOUNT_APPROVAL);
  return typeof value === 'boolean' ? value : env.requireAccountApproval;
}

async function setApprovalRequired(required) {
  await setValue(KEYS.ACCOUNT_APPROVAL, Boolean(required));
}

// The bot token is a credential, so it is stored encrypted under a key derived
// from JWT_SECRET (AES-256-GCM). A database dump alone does not hand over the
// bot. If JWT_SECRET ever changes the stored token simply stops decrypting and
// the admin pastes it again.
function tokenKey() {
  return crypto.createHash('sha256').update(`${env.jwtSecret}:telegram-bot-token`).digest();
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
}

function decrypt(stored) {
  try {
    const [iv, tag, body] = String(stored).split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// TELEGRAM_BOT_TOKEN in the environment wins; otherwise the one pasted in the panel.
async function getTelegramBotToken() {
  if (env.telegram.botToken) return env.telegram.botToken;
  const stored = await getValue(KEYS.TELEGRAM_BOT_TOKEN);
  return stored ? decrypt(stored) : '';
}

async function setTelegramBotToken(token) {
  await setValue(KEYS.TELEGRAM_BOT_TOKEN, token ? encrypt(token) : null);
}

module.exports = {
  isApprovalRequired,
  setApprovalRequired,
  getTelegramBotToken,
  setTelegramBotToken,
};
