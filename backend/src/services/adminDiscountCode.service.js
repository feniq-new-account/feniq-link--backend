const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const DiscountCode = require('../models/discountCode.model');
const Pharmacy = require('../models/pharmacy.model');
const User = require('../models/user.model');
const core = require('./discountCode.service');

// The admin side of discount codes:
//   - the review queue for warehouse codes (approve, or reject with a reason);
//   - the admin's own codes, which work on every warehouse, are live from
//     creation (the admin IS the approval authority) and are paid for by the
//     platform (see settlement.service.js for how the warehouse is made whole);
//   - stopping any code;
//   - the list of every code.

function codeNotFound() {
  return ApiError.notFound('Discount code not found.', 'DISCOUNT_CODE_NOT_FOUND');
}

async function findCodeOrThrow(codeId) {
  if (!mongoose.Types.ObjectId.isValid(codeId)) throw codeNotFound();
  const codeDoc = await DiscountCode.findById(codeId);
  if (!codeDoc) throw codeNotFound();
  return codeDoc;
}

// The admin decides on the code as it was displayed; `expectedVersion` is that
// display's `version` (__v). A warehouse save in between - a newer parked edit,
// or an in-place edit of a pending code - refuses the decision and the panel
// reloads. Omitted means unchecked; the save itself is still conditional on
// __v (optimisticConcurrency).
function versionConflict() {
  return ApiError.conflict(
    'This discount code changed while you were reviewing it. Reload and review it again.',
    'DISCOUNT_CODE_VERSION_CONFLICT'
  );
}

function assertExpectedVersion(codeDoc, expectedVersion) {
  if (expectedVersion === undefined || expectedVersion === null) return;
  if (Number(expectedVersion) !== (codeDoc.__v ?? 0)) throw versionConflict();
}

async function saveOrConflict(codeDoc) {
  try {
    await codeDoc.save();
  } catch (err) {
    if (err.name === 'VersionError') throw versionConflict();
    throw err;
  }
}

function notEditableError() {
  return ApiError.conflict('This discount code can no longer be changed.', 'DISCOUNT_CODE_NOT_EDITABLE');
}

// An admin code can be aimed at any approved pharmacy.
async function assertPharmacyIsApproved(pharmacyId) {
  const pharmacy = await Pharmacy.findById(pharmacyId).select('userId isActive').lean();
  const user = pharmacy ? await User.findById(pharmacy.userId).select('status').lean() : null;
  if (!pharmacy || pharmacy.isActive === false || !user || user.status !== 'active') {
    throw ApiError.badRequest('Pharmacy not found.', undefined, 'DISCOUNT_CODE_PHARMACY_NOT_FOUND');
  }
}

function isInReview(codeDoc) {
  return codeDoc.ownerRole === 'warehouse' && (codeDoc.status === 'pending' || codeDoc.pendingUpdate != null);
}

async function createCode(userId, data) {
  const terms = core.validateTerms(data);
  const pharmacyId = core.parsePharmacyId(data?.pharmacyId);
  if (pharmacyId) await assertPharmacyIsApproved(pharmacyId);

  const now = new Date();
  const codeDoc = await core.createWithGeneratedCode({
    ...terms,
    ownerRole: 'admin',
    warehouseId: null,
    pharmacyId,
    status: 'approved',
    approvedBy: userId,
    approvedAt: now,
    createdBy: userId,
  });

  core.emitCodeStatus(codeDoc, 'approved');
  // Active from creation, so a pharmacy-specific code is announced now.
  await core.notifyPharmacyOfActivation(codeDoc);
  return codeDoc;
}

// Direct edit of an ADMIN code - no buffer, the admin is the authority. A
// warehouse's codes are not edited here: the admin approves, rejects or stops
// them, and the warehouse edits its own terms.
async function updateCode(codeId, data, { expectedVersion } = {}) {
  const codeDoc = await findCodeOrThrow(codeId);
  if (codeDoc.ownerRole !== 'admin') {
    throw ApiError.forbidden('Only the admin\'s own discount codes can be edited here.', 'DISCOUNT_CODE_NOT_ADMIN_OWNED');
  }
  if (codeDoc.status === 'stopped') throw notEditableError();
  assertExpectedVersion(codeDoc, expectedVersion);

  const terms = core.validateTerms(data, { usedCount: codeDoc.usedCount });
  if (core.changesAmount(codeDoc, terms)) codeDoc.revision += 1;
  Object.assign(codeDoc, terms);
  await saveOrConflict(codeDoc);

  core.emitCodeStatus(codeDoc, codeDoc.status);
  return codeDoc;
}

async function approveCode(codeId, userId, { expectedVersion } = {}) {
  const codeDoc = await findCodeOrThrow(codeId);
  if (!isInReview(codeDoc)) {
    throw ApiError.conflict('This discount code is not waiting for review.', 'DISCOUNT_CODE_NOT_IN_REVIEW');
  }
  assertExpectedVersion(codeDoc, expectedVersion);

  const update = codeDoc.pendingUpdate;
  if (update) {
    // An approved code's parked edit: the new terms go live now. Carts that
    // previewed the old amount are told at checkout (DISCOUNT_CODE_CHANGED).
    const terms = {
      type: update.type,
      value: update.value,
      startDate: update.startDate,
      endDate: update.endDate,
      maxUses: update.maxUses ?? null,
      maxUsesPerPharmacy: update.maxUsesPerPharmacy ?? null,
    };
    if (terms.maxUses !== null && terms.maxUses < codeDoc.usedCount) {
      // Uses were taken after the edit was proposed - the limit it asks for no
      // longer fits. Refused rather than stranding live orders.
      throw ApiError.conflict(
        'The proposed usage limit is now below the uses already made. Reject it and ask for a new one.',
        'DISCOUNT_CODE_LIMIT_BELOW_USED'
      );
    }
    if (core.changesAmount(codeDoc, terms)) codeDoc.revision += 1;
    Object.assign(codeDoc, terms);
    codeDoc.pendingUpdate = null;
  } else {
    codeDoc.status = 'approved';
  }
  codeDoc.approvedBy = userId;
  codeDoc.approvedAt = new Date();
  codeDoc.rejectionNote = null;
  codeDoc.rejectedAt = null;
  await saveOrConflict(codeDoc);

  core.emitCodeStatus(codeDoc, 'approved');
  // Only the first approval makes a code usable - notifyPharmacyOfActivation
  // itself ignores a code that has already been announced.
  await core.notifyPharmacyOfActivation(codeDoc);
  return codeDoc;
}

// A new code becomes 'rejected' (final) with the reason. A parked edit is
// discarded - the code keeps working on its current terms - and the reason is
// kept so the warehouse can see why.
async function rejectCode(codeId, { note, expectedVersion } = {}) {
  const rejectionNote = core.requireRejectionNote(note);
  const codeDoc = await findCodeOrThrow(codeId);
  if (!isInReview(codeDoc)) {
    throw ApiError.conflict('This discount code is not waiting for review.', 'DISCOUNT_CODE_NOT_IN_REVIEW');
  }
  assertExpectedVersion(codeDoc, expectedVersion);

  const isEditRejection = codeDoc.pendingUpdate != null;
  if (isEditRejection) {
    codeDoc.pendingUpdate = null;
  } else {
    codeDoc.status = 'rejected';
  }
  codeDoc.rejectionNote = rejectionNote;
  codeDoc.rejectedAt = new Date();
  await saveOrConflict(codeDoc);

  core.emitCodeStatus(codeDoc, isEditRejection ? 'update_rejected' : 'rejected');
  return codeDoc;
}

// Any code, any owner, any time. Final, like the warehouse's own stop.
async function stopCode(codeId, userId) {
  const codeDoc = await findCodeOrThrow(codeId);
  if (codeDoc.status === 'stopped') return codeDoc;
  if (codeDoc.status === 'rejected') throw notEditableError();

  codeDoc.status = 'stopped';
  codeDoc.stoppedAt = new Date();
  codeDoc.stoppedBy = userId;
  codeDoc.stoppedByRole = 'admin';
  codeDoc.pendingUpdate = null;
  await saveOrConflict(codeDoc);

  core.emitCodeStatus(codeDoc, 'stopped');
  return codeDoc;
}

const VIEWS = ['review', 'admin', 'all'];

// view 'review': warehouse codes waiting for a decision; 'admin': the
// admins' own codes; 'all': every code. Each can be narrowed by a status pill,
// a code prefix and (for 'all') a warehouse.
async function listCodes({ view = 'all', status, search, warehouseId, limit, after } = {}) {
  if (!VIEWS.includes(view)) {
    throw ApiError.badRequest('Invalid view.', undefined, 'INVALID_VIEW');
  }
  const clauses = [];
  if (view === 'review') clauses.push({ ownerRole: 'warehouse' }, core.statusFilter('review'));
  if (view === 'admin') clauses.push({ ownerRole: 'admin' });

  const statusValue = core.parseStatusFilter(status);
  if (statusValue) clauses.push(core.statusFilter(statusValue));
  const searchFilter = core.codeSearchFilter(search);
  if (searchFilter.code) clauses.push(searchFilter);
  if (warehouseId !== undefined && warehouseId !== null && warehouseId !== '') {
    if (!mongoose.Types.ObjectId.isValid(warehouseId)) {
      throw ApiError.badRequest('Invalid warehouse.', undefined, 'INVALID_WAREHOUSE');
    }
    clauses.push({ warehouseId: new mongoose.Types.ObjectId(warehouseId) });
  }

  const filter = clauses.length ? { $and: clauses } : {};
  const [{ rows, hasMore, nextCursor }, reviewCount] = await Promise.all([
    core.listPage(filter, { limit, after }),
    DiscountCode.countDocuments({ $and: [{ ownerRole: 'warehouse' }, core.statusFilter('review')] }),
  ]);
  return { rows: await core.attachRefs(rows), hasMore, nextCursor, reviewCount };
}

module.exports = {
  createCode,
  updateCode,
  approveCode,
  rejectCode,
  stopCode,
  listCodes,
};
