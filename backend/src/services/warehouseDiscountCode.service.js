const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const DiscountCode = require('../models/discountCode.model');
const LedgerAccount = require('../models/ledgerAccount.model');
const core = require('./discountCode.service');

// A warehouse's own discount codes. They work only on orders to that
// warehouse, the warehouse pays for them, and none works until an admin
// approves it (adminDiscountCode.service.js). The flow mirrors offers
// (warehouseOffer.service.js): an edit of an approved code is parked for
// review, the live terms untouched until then. Unlike offers, the warehouse
// can STOP its code at any time with no approval at all.

// IDOR guard: a warehouse only ever reaches its own codes.
async function findOwnedCodeOrThrow(codeId, warehouseId) {
  if (!mongoose.Types.ObjectId.isValid(codeId)) {
    throw ApiError.notFound('Discount code not found.', 'DISCOUNT_CODE_NOT_FOUND');
  }
  const codeDoc = await DiscountCode.findOne({ _id: codeId, warehouseId, ownerRole: 'warehouse' });
  if (!codeDoc) {
    throw ApiError.notFound('Discount code not found.', 'DISCOUNT_CODE_NOT_FOUND');
  }
  return codeDoc;
}

// A warehouse can aim a code only at its own customers: a pharmacy it has
// delivered to, i.e. one it holds a ledger account with (owner's decision -
// warehouses do not get to browse the platform's pharmacy directory).
async function assertPharmacyIsCustomer(warehouseId, pharmacyId) {
  const account = await LedgerAccount.exists({ warehouseId, pharmacyId });
  if (!account) {
    throw ApiError.badRequest(
      'A warehouse code can only be aimed at one of your own customers.',
      undefined,
      'DISCOUNT_CODE_PHARMACY_NOT_CUSTOMER'
    );
  }
}

function notEditableError() {
  return ApiError.conflict('This discount code can no longer be changed.', 'DISCOUNT_CODE_NOT_EDITABLE');
}

async function createCode(warehouseId, userId, data) {
  const terms = core.validateTerms(data);
  const pharmacyId = core.parsePharmacyId(data?.pharmacyId);
  if (pharmacyId) await assertPharmacyIsCustomer(warehouseId, pharmacyId);

  const codeDoc = await core.createWithGeneratedCode({
    ...terms,
    ownerRole: 'warehouse',
    warehouseId,
    pharmacyId,
    status: 'pending',
    createdBy: userId,
  });

  // Straight into the admin queue - nothing works until an admin approves.
  core.emitCodePending(codeDoc);
  return codeDoc;
}

// A pending code is not live, so an edit is applied in place and keeps its
// place in the queue. An approved code keeps working on its current terms and
// the change waits in `pendingUpdate` until an admin approves (the terms then
// change, and `revision` moves if the amount did) or rejects it (discarded).
// Only the terms are editable - who the code is for is fixed at creation.
async function updateCode(codeId, warehouseId, data) {
  const codeDoc = await findOwnedCodeOrThrow(codeId, warehouseId);
  if (codeDoc.status === 'stopped' || codeDoc.status === 'rejected') throw notEditableError();

  const terms = core.validateTerms(data, { usedCount: codeDoc.usedCount });

  if (codeDoc.status === 'pending') {
    Object.assign(codeDoc, terms);
    await codeDoc.save();
    return codeDoc;
  }

  const alreadyQueued = codeDoc.pendingUpdate != null;
  codeDoc.pendingUpdate = { ...terms, requestedAt: new Date() };
  // A new proposal supersedes any earlier rejection's note.
  codeDoc.rejectionNote = null;
  codeDoc.rejectedAt = null;
  await codeDoc.save();

  // Only a change newly entering the queue is announced.
  if (!alreadyQueued) core.emitCodePending(codeDoc);
  return codeDoc;
}

// No approval needed: the warehouse pays for its own codes, so it can always
// stop one. Final - a stopped code is a record, and a new code is how the
// warehouse promotes again. Orders already placed keep their discount (it is
// frozen on the order).
async function stopCode(codeId, warehouseId, userId) {
  const codeDoc = await findOwnedCodeOrThrow(codeId, warehouseId);
  if (codeDoc.status === 'stopped') return codeDoc;
  if (codeDoc.status === 'rejected') throw notEditableError();

  const wasInQueue = codeDoc.status === 'pending' || codeDoc.pendingUpdate != null;
  codeDoc.status = 'stopped';
  codeDoc.stoppedAt = new Date();
  codeDoc.stoppedBy = userId;
  codeDoc.stoppedByRole = 'warehouse';
  codeDoc.pendingUpdate = null;
  await codeDoc.save();

  // Drops it from every admin's open queue. The warehouse made this change
  // itself, so its own room is not echoed.
  if (wasInQueue) core.emitCodeStatus(codeDoc, 'stopped', { toWarehouse: false });
  return codeDoc;
}

async function listCodes(warehouseId, { status, search, limit, after } = {}) {
  const statusValue = core.parseStatusFilter(status);
  const clauses = [{ warehouseId, ownerRole: 'warehouse' }];
  if (statusValue) clauses.push(core.statusFilter(statusValue));
  const searchFilter = core.codeSearchFilter(search);
  if (searchFilter.code) clauses.push(searchFilter);

  const [{ rows, hasMore, nextCursor }, reviewCount] = await Promise.all([
    core.listPage({ $and: clauses }, { limit, after }),
    DiscountCode.countDocuments({
      $and: [{ warehouseId, ownerRole: 'warehouse' }, core.statusFilter('review')],
    }),
  ]);
  return { rows: await core.attachRefs(rows), hasMore, nextCursor, reviewCount };
}

module.exports = {
  createCode,
  updateCode,
  stopCode,
  listCodes,
  findOwnedCodeOrThrow,
  assertPharmacyIsCustomer,
};
