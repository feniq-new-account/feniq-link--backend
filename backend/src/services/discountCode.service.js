const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const DiscountCode = require('../models/discountCode.model');
const DiscountCodePharmacyUsage = require('../models/discountCodePharmacyUsage.model');
const Order = require('../models/order.model');
const Pharmacy = require('../models/pharmacy.model');
const Warehouse = require('../models/warehouse.model');
const notificationService = require('./notification.service');
const { emitToAdmins, emitToWarehouse, EVENTS } = require('../realtime');

// The shared core of the discount-code feature: the code string, the terms,
// "can this pharmacy use this code on this order right now", and the usage
// counters. The warehouse and admin flows (warehouseDiscountCode.service.js /
// adminDiscountCode.service.js) and the order flow (order.service.js) all go
// through here, so the three can never disagree about what a code allows.

// Uppercase letters and digits minus the ones people confuse when reading a
// code off a screen or a message: 0/O and 1/I/L. 31 characters.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Generated at the top of the allowed 6-8 range: the most codes for the same
// typing effort (31^8, about 8.5e11).
const GENERATED_CODE_LENGTH = 8;
const CODE_PATTERN = /^[A-Z0-9]{6,8}$/;
const MAX_GENERATION_ATTEMPTS = 5;

const REJECTION_NOTE_MAX_LENGTH = 500;

// The reasons a code cannot be used on an order. Each is also the `code` of
// the error the pharmacist sees - the app and the panel carry the Arabic (and
// English) text for each, keyed by this string (the backend `message` is the
// English fallback, as everywhere else).
const REASONS = {
  INVALID: 'DISCOUNT_CODE_INVALID',
  NOT_FOR_PHARMACY: 'DISCOUNT_CODE_NOT_FOR_PHARMACY',
  NOT_FOR_WAREHOUSE: 'DISCOUNT_CODE_NOT_FOR_WAREHOUSE',
  PENDING_APPROVAL: 'DISCOUNT_CODE_PENDING_APPROVAL',
  STOPPED: 'DISCOUNT_CODE_STOPPED',
  NOT_STARTED: 'DISCOUNT_CODE_NOT_STARTED',
  EXPIRED: 'DISCOUNT_CODE_EXPIRED',
  LIMIT_REACHED: 'DISCOUNT_CODE_LIMIT_REACHED',
  PHARMACY_LIMIT_REACHED: 'DISCOUNT_CODE_PHARMACY_LIMIT_REACHED',
  // Only ever a DISCOUNT_CODE_CHANGED reason: the code is still usable, but
  // its amount changed since the cart previewed it.
  EDITED: 'DISCOUNT_CODE_EDITED',
};

const REASON_MESSAGES = {
  [REASONS.INVALID]: 'This discount code is not valid.',
  [REASONS.NOT_FOR_PHARMACY]: 'This discount code is not for your pharmacy.',
  [REASONS.NOT_FOR_WAREHOUSE]: 'This discount code is not valid for orders to this warehouse.',
  [REASONS.PENDING_APPROVAL]: 'This discount code is still waiting for approval.',
  [REASONS.STOPPED]: 'This discount code has been stopped.',
  [REASONS.NOT_STARTED]: 'This discount code is not active yet.',
  [REASONS.EXPIRED]: 'This discount code has expired.',
  [REASONS.LIMIT_REACHED]: 'This discount code has reached its usage limit.',
  [REASONS.PHARMACY_LIMIT_REACHED]: 'You have already used this discount code the maximum number of times.',
  [REASONS.EDITED]: 'The terms of this discount code have changed.',
};

function reasonError(reason) {
  return ApiError.badRequest(REASON_MESSAGES[reason] ?? REASON_MESSAGES[REASONS.INVALID], undefined, reason);
}

// The order was priced against a code that has since stopped working, or
// whose amount changed (DISCOUNT_CODE_EDITED). Refused like RATE_CHANGED -
// the pharmacist sees why and decides again; nothing was ordered.
function changedError(reason, codeDoc) {
  const details = { reason, code: codeDoc?.code ?? null };
  if (reason === REASONS.EDITED && codeDoc) {
    details.type = codeDoc.type;
    details.value = codeDoc.value;
    details.revision = codeDoc.revision;
  }
  return ApiError.conflict(
    `The discount code changed since it was applied: ${REASON_MESSAGES[reason] ?? reason}`,
    'DISCOUNT_CODE_CHANGED',
    details
  );
}

function generateCodeString(length = GENERATED_CODE_LENGTH) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// What the pharmacist typed, in the form codes are stored in - or null when
// it cannot possibly be a code (never worth a database read).
function normalizeCodeInput(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

// Creates the code under a fresh random string. Uniqueness is the unique index
// on `code`; a collision (vanishingly rare at 31^8) just draws again.
async function createWithGeneratedCode(fields) {
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      return await DiscountCode.create({ ...fields, code: generateCodeString() });
    } catch (err) {
      const isCodeClash = err && err.code === 11000 && err.keyPattern && err.keyPattern.code;
      if (!isCodeClash || attempt === MAX_GENERATION_ATTEMPTS) throw err;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Terms

function parseDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseOptionalLimit(value) {
  if (value === undefined || value === null || value === '') return null;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw ApiError.badRequest('A usage limit must be a whole number of at least 1.', undefined, 'INVALID_DISCOUNT_CODE_LIMIT');
  }
  return limit;
}

function hasAtMostTwoDecimals(value) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

// Everything a create and an edit both validate, for either owner. Returns the
// normalized editable terms. `usedCount` is the code's current usage on an
// edit: a total limit below the uses already held would strand live orders.
function validateTerms(data, { usedCount = 0 } = {}) {
  const input = data ?? {};
  if (input.type !== 'percentage' && input.type !== 'fixed') {
    throw ApiError.badRequest('Invalid discount type.', undefined, 'INVALID_DISCOUNT_CODE_TYPE');
  }

  const value = typeof input.value === 'string' && input.value.trim() ? Number(input.value) : input.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw ApiError.badRequest('Invalid discount value.', undefined, 'INVALID_DISCOUNT_CODE_VALUE');
  }
  if (input.type === 'percentage' && (value <= 0 || value > 100 || !hasAtMostTwoDecimals(value))) {
    throw ApiError.badRequest(
      'A percentage must be above 0 and at most 100, with up to two decimals.',
      undefined,
      'INVALID_DISCOUNT_CODE_VALUE'
    );
  }
  if (input.type === 'fixed' && (!Number.isInteger(value) || value <= 0)) {
    throw ApiError.badRequest(
      'A fixed discount must be a whole amount in lira, above 0.',
      undefined,
      'INVALID_DISCOUNT_CODE_VALUE'
    );
  }

  const startDate = parseDate(input.startDate);
  const endDate = parseDate(input.endDate);
  if (!startDate || !endDate || endDate <= startDate) {
    throw ApiError.badRequest('Invalid date range.', undefined, 'INVALID_DATE_RANGE');
  }

  const maxUses = parseOptionalLimit(input.maxUses);
  const maxUsesPerPharmacy = parseOptionalLimit(input.maxUsesPerPharmacy);
  if (maxUses !== null && maxUses < usedCount) {
    throw ApiError.badRequest(
      'The total usage limit cannot be below the uses already made.',
      { usedCount },
      'DISCOUNT_CODE_LIMIT_BELOW_USED'
    );
  }

  return {
    type: input.type,
    value: input.type === 'percentage' ? Math.round(value * 100) / 100 : value,
    startDate,
    endDate,
    maxUses,
    maxUsesPerPharmacy,
  };
}

// The optional pharmacy a code is scoped to: null (general) or a valid id.
function parsePharmacyId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !mongoose.Types.ObjectId.isValid(value)) {
    throw ApiError.badRequest('Invalid pharmacy.', undefined, 'INVALID_PHARMACY');
  }
  return new mongoose.Types.ObjectId(value);
}

// Whether applying `next` changes the amount a code takes off an order. Only
// that bumps `revision` - see discountCode.model.js.
function changesAmount(codeDoc, next) {
  return codeDoc.type !== next.type || Number(codeDoc.value) !== Number(next.value);
}

function requireRejectionNote(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw ApiError.badRequest('A rejection note is required.', undefined, 'REJECTION_NOTE_REQUIRED');
  }
  const note = value.trim();
  if (note.length > REJECTION_NOTE_MAX_LENGTH) {
    throw ApiError.badRequest('The rejection note is too long.', undefined, 'REJECTION_NOTE_TOO_LONG');
  }
  return note;
}

// ---------------------------------------------------------------------------
// The discount itself (pure)

// Who pays for the discount: the warehouse for its own codes, the platform for
// an admin's.
function fundedByFor(codeDoc) {
  return codeDoc.ownerRole === 'admin' ? 'platform' : 'warehouse';
}

// The terms order.service.js's rollUpOrderMoney applies.
function termsOf(codeDoc) {
  return { type: codeDoc.type, value: codeDoc.value, fundedBy: fundedByFor(codeDoc) };
}

// What the code takes off `preCodeSyp` - the order total after every other
// discount. Whole lira; never more than that total, so the order can reach 0
// but never go below it.
function codeDiscountSyp(terms, preCodeSyp) {
  if (!terms || !(preCodeSyp > 0)) return 0;
  const raw = terms.type === 'percentage'
    ? Math.round((preCodeSyp * terms.value) / 100)
    : Math.round(terms.value);
  return Math.max(0, Math.min(preCodeSyp, raw));
}

// What the platform owes the warehouse for one order: the whole code discount
// on an admin code, 0 otherwise (and 0 on an order with no code). Frozen on
// the order at creation (and re-derived by a pending edit) - see
// order.model.js.
function platformCompensationOf(order) {
  return order?.discountCode?.platformCompensationSyp ?? 0;
}

// ---------------------------------------------------------------------------
// Can this pharmacy use this code on this order?

// The first reason the code cannot be used, or null when it can. The order of
// the checks is deliberate: a code aimed at another pharmacy says only that,
// never whether it is pending, stopped or used up.
function reasonCodeCannotBeUsed(codeDoc, { pharmacyId, warehouseId, now, pharmacyUsageCount = 0 }) {
  if (!codeDoc || codeDoc.status === 'rejected') return REASONS.INVALID;
  if (codeDoc.pharmacyId && String(codeDoc.pharmacyId) !== String(pharmacyId)) return REASONS.NOT_FOR_PHARMACY;
  if (codeDoc.warehouseId && String(codeDoc.warehouseId) !== String(warehouseId)) return REASONS.NOT_FOR_WAREHOUSE;
  if (codeDoc.status === 'pending') return REASONS.PENDING_APPROVAL;
  if (codeDoc.status === 'stopped') return REASONS.STOPPED;
  if (now < codeDoc.startDate) return REASONS.NOT_STARTED;
  if (now > codeDoc.endDate) return REASONS.EXPIRED;
  if (codeDoc.maxUses != null && codeDoc.usedCount >= codeDoc.maxUses) return REASONS.LIMIT_REACHED;
  if (codeDoc.maxUsesPerPharmacy != null && pharmacyUsageCount >= codeDoc.maxUsesPerPharmacy) {
    return REASONS.PHARMACY_LIMIT_REACHED;
  }
  return null;
}

async function pharmacyUsageCount(codeId, pharmacyId, session = null) {
  const query = DiscountCodePharmacyUsage.findOne({ codeId, pharmacyId }).select('count').lean();
  if (session) query.session(session);
  const usage = await query;
  return usage?.count ?? 0;
}

// Looks the code up and decides. Never throws for an unusable code - returns
// the reason, so the order flow can phrase it as DISCOUNT_CODE_CHANGED when the
// cart had previewed it, and the preview as the plain reason.
async function evaluate({ code, pharmacyId, warehouseId, now = new Date(), session = null }) {
  const normalized = normalizeCodeInput(code);
  let codeDoc = null;
  if (normalized) {
    const query = DiscountCode.findOne({ code: normalized }).lean();
    if (session) query.session(session);
    codeDoc = await query;
  }
  const usage = codeDoc && codeDoc.maxUsesPerPharmacy != null
    ? await pharmacyUsageCount(codeDoc._id, pharmacyId, session)
    : 0;
  const reason = reasonCodeCannotBeUsed(codeDoc, {
    pharmacyId,
    warehouseId,
    now,
    pharmacyUsageCount: usage,
  });
  return { codeDoc, reason };
}

// For the checkout: the usable code, or the refusal. `expectedRevision` is the
// revision the cart previewed; when it is present every refusal is a
// DISCOUNT_CODE_CHANGED (the code worked a moment ago), and a different
// revision is one too (reason DISCOUNT_CODE_EDITED).
async function assertUsableForOrder({ code, pharmacyId, warehouseId, now, expectedRevision = null }) {
  const { codeDoc, reason } = await evaluate({ code, pharmacyId, warehouseId, now });
  const previewed = expectedRevision !== null && expectedRevision !== undefined;
  if (reason) throw previewed ? changedError(reason, codeDoc) : reasonError(reason);
  if (previewed && Number(expectedRevision) !== codeDoc.revision) {
    throw changedError(REASONS.EDITED, codeDoc);
  }
  return codeDoc;
}

// ---------------------------------------------------------------------------
// Usage counters

// Called BEFORE the order transaction opens (see
// discountCodePharmacyUsage.model.js): makes sure the per-pharmacy counter
// exists, so the claim inside the transaction is a plain conditional $inc.
async function ensurePharmacyUsage(codeId, pharmacyId) {
  await DiscountCodePharmacyUsage.updateOne(
    { codeId, pharmacyId },
    { $setOnInsert: { count: 0 } },
    { upsert: true }
  );
}

// Takes one use of the code for this order, inside the order's own
// transaction. Both counters move with a CONDITIONAL $inc, so the limit is
// enforced by the write itself: two concurrent orders touch the same document,
// MongoDB makes one of them retry, and the retry re-reads the count. Neither
// limit can ever be exceeded.
//
// The code must also still be the one the order was priced against: approved,
// inside its window and on the same `revision`. If anything moved since the
// check before the transaction, the claim fails and the whole order is
// refused with DISCOUNT_CODE_CHANGED naming the reason - the transaction rolls
// the order back with it.
async function claimUse({ codeDoc, pharmacyId, now }, session) {
  const claimed = await DiscountCode.findOneAndUpdate(
    {
      _id: codeDoc._id,
      status: 'approved',
      revision: codeDoc.revision,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [{ maxUses: null }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }],
    },
    { $inc: { usedCount: 1 } },
    { new: true, session }
  ).lean();

  if (!claimed) {
    const { codeDoc: current, reason } = await evaluate({
      code: codeDoc.code,
      pharmacyId,
      warehouseId: codeDoc.warehouseId ?? null,
      now,
      session,
    });
    throw changedError(reason ?? REASONS.EDITED, current ?? codeDoc);
  }

  const usageFilter = { codeId: claimed._id, pharmacyId };
  // The limit as it stands NOW (the document the claim just returned), not as
  // it was read before the transaction.
  if (claimed.maxUsesPerPharmacy != null) usageFilter.count = { $lt: claimed.maxUsesPerPharmacy };
  const usage = await DiscountCodePharmacyUsage.findOneAndUpdate(
    usageFilter,
    { $inc: { count: 1 } },
    { new: true, session }
  ).lean();
  if (!usage) throw changedError(REASONS.PHARMACY_LIMIT_REACHED, claimed);

  return claimed;
}

// Hands a use back: the order was cancelled, or every unit of it returned.
// Guarded by a compare-and-swap on the order's own `releasedAt`, so the same
// order can never release twice (a retried transaction, or a cancel racing a
// return). The counters never go below zero. Returns whether it released.
async function releaseUse(order, reason, session) {
  const snapshot = order.discountCode;
  if (!snapshot || !snapshot.codeId || snapshot.releasedAt) return false;

  const now = new Date();
  const marked = await Order.updateOne(
    { _id: order._id, 'discountCode.codeId': snapshot.codeId, 'discountCode.releasedAt': null },
    { $set: { 'discountCode.releasedAt': now, 'discountCode.releaseReason': reason } },
    { session }
  );
  if (marked.modifiedCount !== 1) return false;

  await DiscountCode.updateOne(
    { _id: snapshot.codeId, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } },
    { session }
  );
  await DiscountCodePharmacyUsage.updateOne(
    { codeId: snapshot.codeId, pharmacyId: order.pharmacyId, count: { $gt: 0 } },
    { $inc: { count: -1 } },
    { session }
  );
  // Mirrored onto the caller's copy so what it hands back shows the release.
  // Written already - a later save of that copy writes the same values.
  snapshot.releasedAt = now;
  snapshot.releaseReason = reason;
  return true;
}

// ---------------------------------------------------------------------------
// Signals

// A moderation change the admins' screens (and, for a warehouse code, the
// owning warehouse) must re-read. The warehouse room comes from the stored
// code, never from a request.
function emitCodeStatus(codeDoc, status, { toWarehouse = true } = {}) {
  const payload = {
    discountCodeId: codeDoc._id.toString(),
    warehouseId: codeDoc.warehouseId ? codeDoc.warehouseId.toString() : null,
    status,
  };
  emitToAdmins(EVENTS.DISCOUNT_CODE_STATUS_UPDATED, payload);
  if (toWarehouse && codeDoc.warehouseId) {
    emitToWarehouse(codeDoc.warehouseId, EVENTS.DISCOUNT_CODE_STATUS_UPDATED, payload);
  }
}

function emitCodePending(codeDoc) {
  emitToAdmins(EVENTS.DISCOUNT_CODE_PENDING, {
    discountCodeId: codeDoc._id.toString(),
    warehouseId: codeDoc.warehouseId ? codeDoc.warehouseId.toString() : null,
  });
}

function formatAmountAr(codeDoc) {
  if (codeDoc.type === 'percentage') return `${codeDoc.value}%`;
  return `${Number(codeDoc.value).toLocaleString('en-US')} ل.س`;
}

function formatAmountEn(codeDoc) {
  if (codeDoc.type === 'percentage') return `${codeDoc.value}%`;
  return `${Number(codeDoc.value).toLocaleString('en-US')} SYP`;
}

function formatDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// A pharmacy-specific code just became usable (an admin approved a warehouse
// code, or created one of its own): the one pharmacy it is for is told, once.
// General codes notify nobody. The claim on `activationNotifiedAt` makes a
// repeated approval (or a retried request) a no-op. Never throws - the
// approval or creation that got here has already succeeded.
async function notifyPharmacyOfActivation(codeDoc) {
  if (!codeDoc.pharmacyId || codeDoc.status !== 'approved') return false;
  try {
    const claimed = await DiscountCode.updateOne(
      { _id: codeDoc._id, activationNotifiedAt: null },
      { $set: { activationNotifiedAt: new Date() } }
    );
    if (claimed.modifiedCount !== 1) return false;

    const [pharmacy, warehouse] = await Promise.all([
      Pharmacy.findById(codeDoc.pharmacyId).select('userId').lean(),
      codeDoc.warehouseId ? Warehouse.findById(codeDoc.warehouseId).select('nameAr nameEn').lean() : null,
    ]);
    if (!pharmacy) return false;

    const warehouseAr = warehouse ? `من ${warehouse.nameAr}` : 'من أي مستودع';
    const warehouseEn = warehouse ? `from ${warehouse.nameEn || warehouse.nameAr}` : 'from any warehouse';
    await notificationService.sendToUser(pharmacy.userId, {
      type: 'discount_code',
      titleAr: 'كود خصم خاص بك',
      titleEn: 'A discount code for you',
      bodyAr: `استخدم الكود ${codeDoc.code} لخصم ${formatAmountAr(codeDoc)} على طلباتك ${warehouseAr}، حتى ${formatDate(codeDoc.endDate)}.`,
      bodyEn: `Use code ${codeDoc.code} for ${formatAmountEn(codeDoc)} off your orders ${warehouseEn}, until ${formatDate(codeDoc.endDate)}.`,
      relatedWarehouseId: codeDoc.warehouseId ?? null,
      warehouseNameAr: warehouse?.nameAr ?? null,
      warehouseNameEn: warehouse?.nameEn ?? null,
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send discount code notification.', err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lists

// The status a code shows as, derived from its stored state and the clock -
// 'active' only while a pharmacy could actually use it.
function displayStatusOf(codeDoc, now = new Date()) {
  if (codeDoc.status !== 'approved') return codeDoc.status;
  if (now < codeDoc.startDate) return 'scheduled';
  if (now > codeDoc.endDate) return 'expired';
  if (codeDoc.maxUses != null && codeDoc.usedCount >= codeDoc.maxUses) return 'exhausted';
  return 'active';
}

// The filter behind each status pill. 'review' is the moderation queue: a new
// warehouse code, or an approved one with a parked edit.
function statusFilter(status, now = new Date()) {
  switch (status) {
    case 'review':
      return { $or: [{ status: 'pending' }, { pendingUpdate: { $ne: null } }] };
    case 'pending':
    case 'rejected':
    case 'stopped':
      return { status };
    case 'scheduled':
      return { status: 'approved', startDate: { $gt: now } };
    case 'expired':
      return { status: 'approved', endDate: { $lt: now } };
    case 'exhausted':
      return {
        status: 'approved',
        maxUses: { $ne: null },
        $expr: { $gte: ['$usedCount', '$maxUses'] },
      };
    case 'active':
      return {
        status: 'approved',
        startDate: { $lte: now },
        endDate: { $gte: now },
        $or: [{ maxUses: null }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }],
      };
    default:
      return {};
  }
}

const STATUS_FILTERS = ['review', 'pending', 'active', 'scheduled', 'expired', 'exhausted', 'stopped', 'rejected'];

function parseStatusFilter(value) {
  if (value === undefined || value === null || value === '' || value === 'all') return null;
  if (!STATUS_FILTERS.includes(value)) {
    throw ApiError.badRequest('Invalid status filter.', undefined, 'INVALID_STATUS_FILTER');
  }
  return value;
}

// A code search is a prefix match on the code itself - codes are plain
// [A-Z0-9], so the input is reduced to that alphabet (nothing to escape) and
// the prefix walks the unique index.
function codeSearchFilter(search) {
  if (typeof search !== 'string') return {};
  const term = search.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return term ? { code: { $regex: `^${term}` } } : {};
}

// Cursor pagination, newest first, on _id.
async function listPage(filter, { limit, after }) {
  const query = after ? { $and: [filter, { _id: { $lt: new mongoose.Types.ObjectId(after) } }] } : filter;
  const rows = await DiscountCode.find(query).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { rows: page, hasMore, nextCursor: hasMore ? String(page[page.length - 1]._id) : null };
}

// Names for the rows on a page: one $in query per collection, never one per
// code.
async function attachRefs(codes) {
  if (codes.length === 0) return [];
  const pharmacyIds = [...new Set(codes.map((c) => c.pharmacyId && String(c.pharmacyId)).filter(Boolean))];
  const warehouseIds = [...new Set(codes.map((c) => c.warehouseId && String(c.warehouseId)).filter(Boolean))];
  const [pharmacies, warehouses] = await Promise.all([
    pharmacyIds.length ? Pharmacy.find({ _id: { $in: pharmacyIds } }).select('nameAr nameEn').lean() : [],
    warehouseIds.length ? Warehouse.find({ _id: { $in: warehouseIds } }).select('nameAr nameEn').lean() : [],
  ]);
  const pharmacyById = new Map(pharmacies.map((p) => [String(p._id), p]));
  const warehouseById = new Map(warehouses.map((w) => [String(w._id), w]));
  return codes.map((codeDoc) => ({
    codeDoc,
    pharmacy: codeDoc.pharmacyId ? pharmacyById.get(String(codeDoc.pharmacyId)) ?? null : null,
    warehouse: codeDoc.warehouseId ? warehouseById.get(String(codeDoc.warehouseId)) ?? null : null,
  }));
}

// Built at boot next to the financial indexes (server.js) - the counters are
// written inside order transactions, and a lazy index build colliding with
// one would surface as a spurious TRANSACTION_CONTENTION.
async function ensureDiscountCodeIndexes() {
  await Promise.all([DiscountCode.createIndexes(), DiscountCodePharmacyUsage.createIndexes()]);
}

module.exports = {
  CODE_ALPHABET,
  CODE_PATTERN,
  GENERATED_CODE_LENGTH,
  REASONS,
  generateCodeString,
  normalizeCodeInput,
  createWithGeneratedCode,
  validateTerms,
  parsePharmacyId,
  changesAmount,
  requireRejectionNote,
  fundedByFor,
  termsOf,
  codeDiscountSyp,
  platformCompensationOf,
  reasonCodeCannotBeUsed,
  evaluate,
  reasonError,
  changedError,
  assertUsableForOrder,
  ensurePharmacyUsage,
  claimUse,
  releaseUse,
  emitCodeStatus,
  emitCodePending,
  notifyPharmacyOfActivation,
  displayStatusOf,
  statusFilter,
  parseStatusFilter,
  codeSearchFilter,
  listPage,
  attachRefs,
  ensureDiscountCodeIndexes,
};
