const ExcelJS = require('exceljs');
const { ApiError } = require('../utils/ApiError');
const { normalizeText } = require('../utils/normalizeText');
const { nameTokens, personMatchTokens, pharmacyNameMatchTokens, phoneKey } = require('../utils/nameMatch');
const { runInTransaction } = require('../utils/transaction');
const SyndicatePharmacy = require('../models/syndicatePharmacy.model');
const SyndicateImport = require('../models/syndicateImport.model');
const Pharmacy = require('../models/pharmacy.model');
const User = require('../models/user.model');

// The pharmacists' syndicate list, and the check every new pharmacy
// registration goes through: a pharmacist on the list is let in at once,
// anyone else waits for an admin (the admin decides - nothing is ever
// rejected automatically).

const MAX_ROWS = 20000;
// Below this a "closest name" is noise, not a suggestion worth showing.
const SUGGESTION_MIN_SCORE = 30;

// ---------------------------------------------------------------- the list

// Small (a couple of thousand rows) and read on every registration, so it is
// kept in memory and dropped whenever a new list is uploaded. The time limit
// covers a second server instance that did not see the upload.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = null;

function invalidateCache() {
  cache = null;
}

async function loadEntries() {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.entries;
  const entries = await SyndicatePharmacy.find({})
    .select('pharmacistName fatherName pharmacyName phones region place address notes')
    .lean();
  // Split once here rather than on every registration.
  entries.forEach((entry) => {
    entry.tokens = {
      name: nameTokens(entry.pharmacistName),
      father: nameTokens(entry.fatherName),
      pharmacy: nameTokens(entry.pharmacyName),
      phones: entry.phones.map(phoneKey),
    };
  });
  cache = { entries, loadedAt: Date.now() };
  return entries;
}

function entryKey(entry) {
  return `${normalizeText(entry.pharmacistName)}|${normalizeText(entry.fatherName || '')}`;
}

// ------------------------------------------------------------------ upload

// Header text (normalized) -> field. The cleaned list's "كل الصيدليات" sheet.
const COLUMNS = {
  'اسم الصيدلاني': 'pharmacistName',
  'اسم الاب': 'fatherName',
  'اسم الصيدليه': 'pharmacyName',
  'الموبايل': 'phone',
  'موبايل اخر': 'phone2',
  'المنطقه': 'region',
  'الحي القريه': 'place',
  'العنوان بالتفصيل': 'address',
  'ملاحظات': 'notes',
  'رقم السطر بالملف الاصلي': 'sourceRow',
};

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return cellText(value.result);
    if ('text' in value) return cellText(value.text);
    return '';
  }
  return String(value).trim();
}

function toMobile(value) {
  const key = phoneKey(value);
  return key.length === 9 && key.startsWith('9') ? `0${key}` : '';
}

// Finds the sheet and the row holding the headers. The cleaned workbook has
// one page per region besides "كل الصيدليات", and those have an
// "اسم الصيدلاني" column too (with a heading row per neighbourhood in between),
// so the header row recognising the most columns wins - the full table.
function findTable(workbook) {
  let best = null;
  for (const sheet of workbook.worksheets) {
    const lastProbe = Math.min(sheet.rowCount, 10);
    for (let r = 1; r <= lastProbe; r += 1) {
      const columns = {};
      sheet.getRow(r).eachCell((cell, col) => {
        const field = COLUMNS[normalizeText(cellText(cell.value))];
        if (field && !columns[field]) columns[field] = col;
      });
      const recognised = Object.keys(columns).length;
      if (columns.pharmacistName && (!best || recognised > best.recognised)) {
        best = { sheet, headerRow: r, columns, recognised };
      }
    }
  }
  return best;
}

async function parseWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw ApiError.badRequest('ما قدرت أقرأ الملف. لازم يكون ملف Excel (.xlsx).', undefined, 'SYNDICATE_FILE_UNREADABLE');
  }
  const table = findTable(workbook);
  if (!table) {
    throw ApiError.badRequest(
      'ما لقيت عمود «اسم الصيدلاني» بالملف. ارفع ملف «صيدليات اللاذقية حسب المنطقة» (فيه صفحة «كل الصيدليات»).',
      undefined,
      'SYNDICATE_FILE_NO_NAME_COLUMN'
    );
  }

  const { sheet, headerRow, columns } = table;
  const read = (row, field) => (columns[field] ? cellText(row.getCell(columns[field]).value) : '');
  const entries = [];
  let skipped = 0;
  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const pharmacistName = read(row, 'pharmacistName');
    if (!pharmacistName) {
      if (row.hasValues) skipped += 1;
      continue;
    }
    const phones = [read(row, 'phone'), read(row, 'phone2')].map(toMobile).filter(Boolean);
    const sourceRow = Number(read(row, 'sourceRow'));
    entries.push({
      pharmacistName,
      fatherName: read(row, 'fatherName'),
      pharmacyName: read(row, 'pharmacyName'),
      phones: [...new Set(phones)],
      region: read(row, 'region'),
      place: read(row, 'place'),
      address: read(row, 'address'),
      notes: read(row, 'notes'),
      sourceRow: Number.isFinite(sourceRow) && sourceRow > 0 ? sourceRow : null,
    });
    if (entries.length > MAX_ROWS) {
      throw ApiError.badRequest(`الملف فيه أكتر من ${MAX_ROWS} صف.`, undefined, 'SYNDICATE_FILE_TOO_LARGE');
    }
  }
  if (entries.length === 0) {
    throw ApiError.badRequest('الملف ما فيه ولا صيدلاني.', undefined, 'SYNDICATE_FILE_EMPTY');
  }
  return { entries, skipped };
}

// Replaces the whole list in one transaction - a failed upload leaves the old
// list in place, never half of each - then re-checks the accounts that are
// waiting, since the new list may now have them.
async function importList(buffer, { fileName = '', adminId = null } = {}) {
  const { entries, skipped } = await parseWorkbook(buffer);
  await runInTransaction(async (session) => {
    await SyndicatePharmacy.deleteMany({}, { session });
    await SyndicatePharmacy.insertMany(entries, { session });
  });
  invalidateCache();

  const { approved } = await recheckPending();
  await SyndicateImport.create({
    fileName: String(fileName || '').slice(0, 200),
    rowCount: entries.length,
    skippedRows: skipped,
    autoApproved: approved.length,
    importedBy: adminId,
  });
  return { imported: entries.length, skipped, autoApproved: approved.length };
}

async function getStatus() {
  const [count, lastImport] = await Promise.all([
    SyndicatePharmacy.estimatedDocumentCount(),
    SyndicateImport.findOne({}).sort({ createdAt: -1 }).populate('importedBy', 'name').lean(),
  ]);
  return {
    count,
    lastImport: lastImport
      ? {
          fileName: lastImport.fileName,
          rowCount: lastImport.rowCount,
          autoApproved: lastImport.autoApproved,
          importedAt: lastImport.createdAt,
          importedBy: lastImport.importedBy ? lastImport.importedBy.name : null,
        }
      : null,
  };
}

// ----------------------------------------------------------------- the check

// The verdict for one registration.
//
//   { decision: 'approved' | 'review', score 0..100, reasons: [Arabic], entry }
//
// `entry` is the closest listed pharmacist (null when nothing is close), shown
// to the admin as "closest name on the list" even when the decision is review.
//
// Approved when the pharmacist's name (typed as the owner's name, or as the
// pharmacy's name - "صيدلية عمار شغري") matches a listed pharmacist, or when
// the mobile number is on the list and the name is at least close. Phone
// numbers and addresses that differ never count against anyone.
async function check({ name, pharmacyName, phone }, { excludeUserId = null } = {}) {
  const entries = await loadEntries();
  if (entries.length === 0) {
    return { decision: 'review', score: 0, reasons: ['قائمة النقابة لسّا ما انرفعت'], entry: null };
  }

  const typedPhone = phoneKey(phone);
  const typedName = nameTokens(name);
  const typedPharmacy = nameTokens(pharmacyName);
  let best = null;
  for (const entry of entries) {
    const { tokens } = entry;
    const byOwner = personMatchTokens(typedName, tokens.name, tokens.father);
    const byPharmacy = personMatchTokens(typedPharmacy, tokens.name, tokens.father);
    const samePharmacyName = pharmacyNameMatchTokens(typedPharmacy, tokens.pharmacy);
    const samePhone = Boolean(typedPhone) && tokens.phones.includes(typedPhone);
    const nameFound = byOwner.full || byPharmacy.full;
    const ratio = Math.max(byOwner.ratio, byPharmacy.ratio);

    let score = nameFound ? 90 : Math.round(ratio * 60);
    if (samePharmacyName) score += 10;
    if (samePhone) score = Math.max(score + 10, 70);
    score = Math.min(score, 100);

    const approve = nameFound || (samePhone && (ratio >= 0.5 || samePharmacyName));
    const candidate = { entry, score, approve, nameFound, samePhone, samePharmacyName, ratio };
    if (
      !best ||
      (candidate.approve && !best.approve) ||
      (candidate.approve === best.approve && candidate.score > best.score)
    ) {
      best = candidate;
    }
  }

  let entry = null;
  if (best.score >= SUGGESTION_MIN_SCORE) {
    const { tokens, ...listed } = best.entry;
    entry = { ...listed, entryKey: entryKey(listed) };
  }
  const reasons = [];
  let decision = best.approve ? 'approved' : 'review';

  if (best.approve) {
    reasons.push(best.nameFound ? 'الاسم موجود بقائمة النقابة' : 'رقم الموبايل موجود بقائمة النقابة والاسم قريب');
    if (best.nameFound && best.samePhone) reasons.push('ورقم الموبايل كمان مطابق');
    if (/الغاء|إلغاء/.test(best.entry.notes || '')) {
      decision = 'review';
      reasons.push('بس بالقائمة مكتوب جنبه «إلغاء»');
    } else {
      const claimedBefore = await Pharmacy.exists({
        'syndicateMatch.entryKey': entry.entryKey,
        'syndicateMatch.decision': 'approved',
        ...(excludeUserId ? { userId: { $ne: excludeUserId } } : {}),
      });
      if (claimedBefore) {
        decision = 'review';
        reasons.push('بس هالاسم انقبل قبل هيك بحساب تاني');
      }
    }
  } else if (best.samePhone) {
    reasons.push('رقم الموبايل موجود بالقائمة بس باسم مختلف');
  } else if (best.samePharmacyName) {
    reasons.push('اسم الصيدلية موجود بالقائمة بس اسم الصيدلاني لأ');
  } else if (entry) {
    reasons.push('في اسم قريب بالقائمة بس مش متطابق');
  } else {
    reasons.push('الاسم مش موجود بقائمة النقابة');
  }

  return { decision, score: entry ? best.score : 0, reasons, entry };
}

// What a Pharmacy keeps of a check (pharmacy.model.js syndicateMatch).
function toStoredMatch(result) {
  const { entry } = result;
  return {
    decision: result.decision,
    score: result.score,
    reasons: result.reasons,
    entryKey: entry ? entry.entryKey : null,
    pharmacistName: entry ? entry.pharmacistName : null,
    fatherName: entry ? entry.fatherName || null : null,
    pharmacyName: entry ? entry.pharmacyName || null : null,
    region: entry ? entry.region || null : null,
    place: entry ? entry.place || null : null,
    phones: entry ? entry.phones : [],
    checkedAt: new Date(),
  };
}

// Runs the check again for every pharmacy waiting for approval and lets in the
// ones the list now has. Returns the user ids it approved.
async function recheckPending() {
  // Lazy: admin.service -> realtime, and telegram.service -> admin.service;
  // neither is needed until there is actually something to approve.
  const adminService = require('./admin.service');
  const telegram = require('./telegram.service');

  const users = await User.find({ role: 'pharmacy', status: 'pending' }).select('_id phone').lean();
  const approved = [];
  for (const user of users) {
    const pharmacy = await Pharmacy.findOne({ userId: user._id });
    if (!pharmacy) continue;
    const result = await check(
      { name: pharmacy.ownerName, pharmacyName: pharmacy.nameAr, phone: user.phone },
      { excludeUserId: user._id }
    );
    pharmacy.syndicateMatch = toStoredMatch(result);
    await pharmacy.save();
    if (result.decision === 'approved') {
      await adminService.approveAccount(user._id.toString());
      approved.push(user._id);
      telegram.notifyRegistration(user._id, { afterUpload: true }).catch(() => {});
    }
  }
  return { approved };
}

// Approval switched off: everyone waiting is let in (as the server also does
// at boot with approval off). Returns how many.
async function releasePending() {
  const { modifiedCount } = await User.updateMany(
    { role: 'pharmacy', status: 'pending' },
    { $set: { status: 'active' } }
  );
  return modifiedCount;
}

module.exports = {
  releasePending,
  importList,
  getStatus,
  check,
  toStoredMatch,
  recheckPending,
  invalidateCache,
  _parseWorkbook: parseWorkbook,
};
