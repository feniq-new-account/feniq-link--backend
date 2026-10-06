const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const syndicateRegistry = require('../services/syndicateRegistry.service');
const platformSettings = require('../services/platformSettings.service');
const telegram = require('../services/telegram.service');
const adminService = require('../services/admin.service');

// The admin panel's "registration approval" page: the syndicate list, the
// approval switch and the Telegram bot - everything that decides what happens
// when a pharmacy signs up.

const getStatus = asyncHandler(async (req, res) => {
  const [registry, approvalRequired, telegramStatus, pending] = await Promise.all([
    syndicateRegistry.getStatus(),
    platformSettings.isApprovalRequired(),
    telegram.getStatus(req.user._id),
    adminService.countPendingAccountsByRole(),
  ]);
  res.json({
    success: true,
    registry,
    approvalRequired,
    pendingPharmacies: pending.pharmacyCount,
    telegram: telegramStatus,
  });
});

// multer hands over the file name decoded as latin1, which garbles an Arabic
// name; re-read its bytes as UTF-8 unless they are not valid UTF-8.
function originalFileName(name) {
  const decoded = Buffer.from(String(name || ''), 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

const importList = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('اختار ملف Excel.', undefined, 'SYNDICATE_FILE_MISSING');
  const result = await syndicateRegistry.importList(req.file.buffer, {
    fileName: originalFileName(req.file.originalname),
    adminId: req.user._id,
  });
  res.json({ success: true, ...result });
});

// "Would this name get in?" - lets the admin try names against the list.
const checkName = asyncHandler(async (req, res) => {
  const { name = '', pharmacyName = '', phone = '' } = req.body || {};
  if (![name, pharmacyName, phone].every((v) => typeof v === 'string')) {
    throw ApiError.badRequest('Invalid input.');
  }
  if (!name.trim() && !pharmacyName.trim()) {
    throw ApiError.badRequest('اكتب اسم الصيدلاني أو اسم الصيدلية.', undefined, 'SYNDICATE_CHECK_EMPTY');
  }
  const result = await syndicateRegistry.check({ name, pharmacyName, phone });
  res.json({ success: true, result: syndicateRegistry.toStoredMatch(result) });
});

const setApproval = asyncHandler(async (req, res) => {
  const { required } = req.body || {};
  if (typeof required !== 'boolean') throw ApiError.badRequest('`required` must be true or false.');
  await platformSettings.setApprovalRequired(required);
  // Turning approval off lets in everyone already waiting - the same thing the
  // server does at boot - or they would sit on the pending screen for good.
  let released = 0;
  if (!required) released = await syndicateRegistry.releasePending();
  res.json({ success: true, approvalRequired: required, released });
});

const setBotToken = asyncHandler(async (req, res) => {
  const result = await telegram.configureBot(req.body?.token);
  res.json({ success: true, ...result });
});

const removeBot = asyncHandler(async (req, res) => {
  await telegram.removeBot();
  res.json({ success: true });
});

const createTelegramLink = asyncHandler(async (req, res) => {
  const result = await telegram.createLinkUrl(req.user._id);
  res.json({ success: true, ...result });
});

const unlinkTelegram = asyncHandler(async (req, res) => {
  await telegram.unlink(req.user._id);
  res.json({ success: true });
});

module.exports = {
  getStatus,
  importList,
  checkName,
  setApproval,
  setBotToken,
  removeBot,
  createTelegramLink,
  unlinkTelegram,
};
