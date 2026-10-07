const crypto = require('crypto');
const env = require('../config/env');
const { ApiError } = require('../utils/ApiError');
const User = require('../models/user.model');
const Pharmacy = require('../models/pharmacy.model');
const platformSettings = require('./platformSettings.service');

// The admins' Telegram bot: every new pharmacy registration arrives as a
// message with approve / reject (or block) buttons, and pressing one acts
// exactly like the same button in the admin panel (admin.service.js).
//
// Security model:
//  - Telegram reaches us only through the webhook, and every delivery must
//    carry the secret header we registered with setWebhook (webhookSecret).
//  - A button acts only for a Telegram account linked to an active admin.
//    Linking happens by opening a one-time link generated in the admin panel
//    (createLinkUrl), so knowing the bot's name is worth nothing.
//  - The bot token never appears in logs or responses.

const API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 10000;
const LINK_TTL_MS = 15 * 60 * 1000;
const PENDING_LIST_LIMIT = 10;
const TOKEN_FORMAT = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

// ------------------------------------------------------------- transport

async function defaultTransport(botToken, method, payload) {
  const response = await fetch(`${API_BASE}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return response.json().catch(() => ({ ok: false, description: `HTTP ${response.status}` }));
}

let transport = defaultTransport;

// Tests swap in a fake Telegram.
function _setTransport(fn) {
  transport = fn || defaultTransport;
  usernameCache = { token: null, username: null };
}

async function callApi(botToken, method, payload) {
  const body = await transport(botToken, method, payload);
  if (!body || !body.ok) {
    const err = new Error(`Telegram ${method} failed: ${body?.description || 'no response'}`);
    err.telegramDescription = body?.description || '';
    throw err;
  }
  return body.result;
}

async function call(method, payload) {
  const botToken = await platformSettings.getTelegramBotToken();
  if (!botToken) return null;
  return callApi(botToken, method, payload);
}

// --------------------------------------------------------------- setup

let usernameCache = { token: null, username: null };

async function botUsername(botToken) {
  if (usernameCache.token === botToken && usernameCache.username) return usernameCache.username;
  const me = await callApi(botToken, 'getMe');
  usernameCache = { token: botToken, username: me.username };
  return me.username;
}

// Derived rather than stored: the same server secret plus the bot's token
// always give the same value, and a new token gives a new one.
function webhookSecret(botToken) {
  return crypto.createHmac('sha256', env.jwtSecret).update(`telegram-webhook:${botToken}`).digest('hex');
}

function webhookUrl() {
  return env.telegram.publicUrl ? `${env.telegram.publicUrl}/api/telegram/webhook` : '';
}

async function setupWebhook() {
  const botToken = await platformSettings.getTelegramBotToken();
  if (!botToken) return { ok: false, reason: 'no-token' };
  if (!webhookUrl()) return { ok: false, reason: 'no-public-url' };
  await callApi(botToken, 'setWebhook', {
    url: webhookUrl(),
    secret_token: webhookSecret(botToken),
    allowed_updates: ['message', 'callback_query'],
  });
  await callApi(botToken, 'setMyCommands', {
    commands: [{ command: 'pending', description: 'الصيدليات اللي بانتظار الموافقة' }],
  });
  return { ok: true, username: await botUsername(botToken) };
}

// The admin pastes the token BotFather gave them. Checked against Telegram
// before it is kept, so a typo is caught on the spot.
async function configureBot(rawToken) {
  if (env.telegram.botToken) {
    throw ApiError.badRequest('رمز البوت محطوط بإعدادات السيرفر (TELEGRAM_BOT_TOKEN) — غيّره من هناك.', undefined, 'TELEGRAM_TOKEN_FROM_ENV');
  }
  const botToken = String(rawToken || '').trim();
  if (!TOKEN_FORMAT.test(botToken)) {
    throw ApiError.badRequest('هيدا مش رمز بوت. انسخ الرمز كامل من رسالة BotFather (متل 123456789:ABC...).', undefined, 'TELEGRAM_TOKEN_INVALID');
  }
  let username;
  try {
    username = (await callApi(botToken, 'getMe')).username;
  } catch {
    throw ApiError.badRequest('تلغرام ما قبل هالرمز. تأكّد إنك نسخته كامل.', undefined, 'TELEGRAM_TOKEN_REJECTED');
  }
  await platformSettings.setTelegramBotToken(botToken);
  usernameCache = { token: botToken, username };
  const webhook = await setupWebhook().catch((err) => ({ ok: false, reason: err.message }));
  return { username, webhookReady: webhook.ok };
}

async function removeBot() {
  const botToken = await platformSettings.getTelegramBotToken();
  if (botToken && !env.telegram.botToken) {
    await callApi(botToken, 'deleteWebhook', {}).catch(() => {});
    await platformSettings.setTelegramBotToken(null);
  }
  await User.updateMany({ telegramChatId: { $ne: null } }, { $set: { telegramChatId: null } });
}

async function getStatus(adminUserId) {
  const botToken = await platformSettings.getTelegramBotToken();
  const [admin, linkedAdmins] = await Promise.all([
    User.findById(adminUserId).select('telegramChatId').lean(),
    User.countDocuments({ role: 'admin', status: 'active', telegramChatId: { $ne: null } }),
  ]);
  let username = null;
  let reachable = false;
  if (botToken) {
    try {
      username = await botUsername(botToken);
      reachable = true;
    } catch {
      reachable = false;
    }
  }
  return {
    configured: Boolean(botToken),
    source: env.telegram.botToken ? 'env' : botToken ? 'panel' : null,
    username,
    reachable,
    publicUrlKnown: Boolean(webhookUrl()),
    linked: Boolean(admin && admin.telegramChatId),
    linkedAdmins,
  };
}

function hashLinkToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function createLinkUrl(adminUserId) {
  const botToken = await platformSettings.getTelegramBotToken();
  if (!botToken) {
    throw ApiError.badRequest('حط رمز البوت أول.', undefined, 'TELEGRAM_NOT_CONFIGURED');
  }
  const username = await botUsername(botToken);
  const raw = crypto.randomBytes(18).toString('base64url');
  await User.updateOne(
    { _id: adminUserId },
    { $set: { telegramLinkTokenHash: hashLinkToken(raw), telegramLinkExpiresAt: new Date(Date.now() + LINK_TTL_MS) } }
  );
  return { url: `https://t.me/${username}?start=${raw}`, username, expiresInMinutes: LINK_TTL_MS / 60000 };
}

async function unlink(adminUserId) {
  await User.updateOne({ _id: adminUserId }, { $set: { telegramChatId: null } });
}

// ------------------------------------------------------------ messages

const AREA_LABELS = { city: 'مدينة', city_ring: 'محيط المدينة', rural: 'ريف' };
const STATUS_LABELS = { pending: 'بانتظار الموافقة', active: 'مقبول', blocked: 'محظور/مرفوض', deleted: 'محذوف' };

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buttonsFor(userId, status) {
  if (status === 'pending') {
    return {
      inline_keyboard: [[
        { text: '✅ قبول', callback_data: `acc:approve:${userId}` },
        { text: '❌ رفض', callback_data: `acc:reject:${userId}` },
      ]],
    };
  }
  if (status === 'active') {
    return { inline_keyboard: [[{ text: '🚫 حظر', callback_data: `acc:block:${userId}` }]] };
  }
  return { inline_keyboard: [] };
}

function registrationText(user, pharmacy, { afterUpload = false } = {}) {
  const match = pharmacy?.syndicateMatch;
  const onList = match?.decision === 'approved';
  let title;
  if (user.status === 'pending') title = '🆕 <b>صيدلية جديدة بانتظار موافقتك</b>';
  else if (user.status === 'active' && onList) {
    title = afterUpload ? '✅ <b>انقبلت تلقائياً بعد رفع قائمة النقابة</b>' : '✅ <b>صيدلية جديدة — انقبلت تلقائياً</b>';
  } else if (user.status === 'active') title = '🆕 <b>صيدلية جديدة دخلت</b> (الموافقة اليدوية طافية)';
  else title = `ℹ️ <b>حساب صيدلية — ${esc(STATUS_LABELS[user.status] || user.status)}</b>`;

  const lines = [title, ''];
  if (pharmacy) {
    lines.push(`🏥 <b>${esc(pharmacy.nameAr)}</b>`);
    lines.push(`👤 ${esc(pharmacy.ownerName)}`);
  } else {
    lines.push(`👤 ${esc(user.name)}`);
  }
  lines.push(`📞 ${esc(user.phone)}`);
  if (pharmacy) {
    lines.push(`📍 ${esc(AREA_LABELS[pharmacy.areaType] || '')} — ${esc(pharmacy.address)}`);
    const [lng, lat] = (pharmacy.location?.coordinates || []).map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      lines.push(`🗺 <a href="https://maps.google.com/?q=${lat},${lng}">الموقع على الخريطة</a>`);
    }
  }

  if (match) {
    lines.push('', `📋 <b>قائمة النقابة:</b> ${esc(match.reasons.join(' — '))}`);
    if (match.pharmacistName) {
      const who = [match.pharmacistName, match.fatherName ? `(اسم الأب ${match.fatherName})` : null]
        .filter(Boolean)
        .join(' ');
      const where = [match.place, match.region].filter(Boolean).join('، ');
      const details = [who, match.pharmacyName, where, (match.phones || []).join(' / ')].filter(Boolean);
      lines.push(`${onList ? 'المطابق' : 'أقرب اسم'}: ${esc(details.join(' — '))} — تطابق ${match.score}%`);
    }
  }
  return lines.join('\n');
}

async function linkedAdminChats() {
  const admins = await User.find({ role: 'admin', status: 'active', telegramChatId: { $ne: null } })
    .select('telegramChatId')
    .lean();
  return [...new Set(admins.map((a) => a.telegramChatId))];
}

async function sendRegistration(chatId, userId, options = {}) {
  const user = await User.findById(userId).select('name phone role status').lean();
  if (!user || user.role !== 'pharmacy') return;
  const pharmacy = await Pharmacy.findOne({ userId })
    .select('nameAr ownerName address areaType location syndicateMatch')
    .lean();
  await call('sendMessage', {
    chat_id: chatId,
    text: registrationText(user, pharmacy, options),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: buttonsFor(String(user._id), user.status),
  });
}

// Tells every linked admin about a registration. Never throws for one admin's
// chat failing - the others still get it.
async function notifyRegistration(userId, options = {}) {
  const botToken = await platformSettings.getTelegramBotToken();
  if (!botToken) return { sent: 0 };
  const chats = await linkedAdminChats();
  let sent = 0;
  for (const chatId of chats) {
    try {
      await sendRegistration(chatId, userId, options);
      sent += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Telegram alert to one admin failed:', err.message);
    }
  }
  return { sent };
}

// -------------------------------------------------------------- updates

function isValidSecret(headerValue, botToken) {
  if (!botToken || typeof headerValue !== 'string') return false;
  const expected = Buffer.from(webhookSecret(botToken));
  const given = Buffer.from(headerValue);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function adminForTelegramUser(telegramUserId) {
  if (!Number.isFinite(telegramUserId)) return null;
  return User.findOne({ role: 'admin', status: 'active', telegramChatId: telegramUserId }).select('name').lean();
}

async function reply(chatId, text) {
  await call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

const NOT_AN_ADMIN = 'هالبوت خاص بإدارة فينيق.';
const HELP =
  'أهلين 👋 رح يوصلك هون كل تسجيل صيدلية جديد، ومعه أزرار القبول والرفض.\n\n/pending — الصيدليات اللي بانتظار الموافقة';

async function handleStart(chatId, rawToken) {
  if (!rawToken) {
    const admin = await adminForTelegramUser(chatId);
    await reply(chatId, admin ? HELP : NOT_AN_ADMIN);
    return;
  }
  const admin = await User.findOne({
    role: 'admin',
    status: 'active',
    telegramLinkTokenHash: hashLinkToken(rawToken),
    telegramLinkExpiresAt: { $gt: new Date() },
  }).select('name');
  if (!admin) {
    await reply(chatId, 'الرابط منتهي أو مستعمل. افتح لوحة الأدمن واضغط «ربط تلغرام» من جديد.');
    return;
  }
  // One Telegram account belongs to one admin.
  await User.updateMany({ telegramChatId: chatId, _id: { $ne: admin._id } }, { $set: { telegramChatId: null } });
  await User.updateOne(
    { _id: admin._id },
    { $set: { telegramChatId: chatId, telegramLinkTokenHash: null, telegramLinkExpiresAt: null } }
  );
  await reply(chatId, `تم الربط ✅ أهلين ${esc(admin.name)}.\n\n${HELP}`);
}

async function handlePending(chatId) {
  const pending = await User.find({ role: 'pharmacy', status: 'pending' })
    .select('_id')
    .sort({ _id: 1 })
    .limit(PENDING_LIST_LIMIT + 1)
    .lean();
  if (pending.length === 0) {
    await reply(chatId, 'ما في ولا صيدلية بانتظار الموافقة ✅');
    return;
  }
  for (const user of pending.slice(0, PENDING_LIST_LIMIT)) {
    await sendRegistration(chatId, user._id);
  }
  if (pending.length > PENDING_LIST_LIMIT) {
    const total = await User.countDocuments({ role: 'pharmacy', status: 'pending' });
    await reply(chatId, `وفي كمان ${total - PENDING_LIST_LIMIT} بلوحة الأدمن (الحسابات ← بانتظار الموافقة).`);
  }
}

async function handleMessage(message) {
  if (!message || message.chat?.type !== 'private' || typeof message.text !== 'string') return;
  const chatId = message.chat.id;
  const [command, argument] = message.text.trim().split(/\s+/, 2);
  if (command === '/start') {
    await handleStart(chatId, argument);
    return;
  }
  const admin = await adminForTelegramUser(chatId);
  if (!admin) {
    await reply(chatId, NOT_AN_ADMIN);
    return;
  }
  if (command === '/pending') await handlePending(chatId);
  else await reply(chatId, HELP);
}

const OUTCOMES = { approve: '✅ انقبل', reject: '❌ انرفض', block: '🚫 انحظر' };

async function handleCallback(query) {
  const answer = (text) => call('answerCallbackQuery', { callback_query_id: query.id, text });
  const [kind, action, userId] = String(query.data || '').split(':');
  if (kind !== 'acc' || !OUTCOMES[action]) {
    await answer('زر قديم');
    return;
  }
  const admin = await adminForTelegramUser(query.from?.id);
  if (!admin) {
    await answer(NOT_AN_ADMIN);
    return;
  }

  // Lazy: admin.service pulls in the realtime layer.
  const adminService = require('./admin.service');
  const run = { approve: adminService.approveAccount, reject: adminService.rejectAccount, block: adminService.blockAccount }[action];
  let outcome;
  try {
    await run(userId);
    outcome = `${OUTCOMES[action]} — ${admin.name}`;
  } catch (err) {
    if (!err.statusCode || err.statusCode >= 500) throw err;
    const user = await User.findById(userId).select('status').lean().catch(() => null);
    outcome = user
      ? `ℹ️ ما تغيّر شي — الحساب حالياً: ${STATUS_LABELS[user.status] || user.status}`
      : 'ℹ️ الحساب مش موجود';
  }
  await answer(outcome);

  const message = query.message;
  if (!message) return;
  const user = await User.findById(userId).select('status').lean().catch(() => null);
  const text = `${message.text || ''}\n\n${outcome}`;
  await call('editMessageText', {
    chat_id: message.chat.id,
    message_id: message.message_id,
    text,
    // Appending at the end keeps every original entity's offset valid, so the
    // bold and the map link survive the edit.
    entities: message.entities || [],
    disable_web_page_preview: true,
    reply_markup: buttonsFor(userId, user ? user.status : null),
  }).catch(() => {});
}

// One webhook delivery. Returns false when the secret does not check out (the
// route answers 401), true otherwise - errors inside are logged, not thrown,
// so Telegram does not keep redelivering an update we cannot process.
async function handleWebhook(headerSecret, update) {
  const botToken = await platformSettings.getTelegramBotToken();
  if (!isValidSecret(headerSecret, botToken)) return false;
  try {
    if (update?.callback_query) await handleCallback(update.callback_query);
    else if (update?.message) await handleMessage(update.message);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Telegram update failed:', err.message);
  }
  return true;
}

module.exports = {
  setupWebhook,
  configureBot,
  removeBot,
  getStatus,
  createLinkUrl,
  unlink,
  notifyRegistration,
  handleWebhook,
  registrationText,
  _setTransport,
  _webhookSecret: webhookSecret,
};
