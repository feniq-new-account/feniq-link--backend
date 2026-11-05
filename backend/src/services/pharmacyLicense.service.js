const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const User = require('../models/user.model');
const Pharmacy = require('../models/pharmacy.model');
const PharmacyLicenseAudit = require('../models/pharmacyLicenseAudit.model');

const GRACE_DAYS = 14;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const BUCKET_NAME = 'private_pharmacy_licences';

const badDocument = () => ApiError.badRequest(
  'Upload a JPEG, PNG or PDF licence document under 2MB.', undefined, 'INVALID_PHARMACY_LICENCE_FILE'
);

function acceptedMime(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length < 8 ||
      file.buffer.length > MAX_DOCUMENT_BYTES) throw badDocument();
  const bytes = file.buffer;
  if (file.mimetype === 'image/jpeg' &&
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (file.mimetype === 'image/png' &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (file.mimetype === 'application/pdf' &&
      bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  throw badDocument();
}

function bucket() {
  if (!mongoose.connection.db) throw new Error('MongoDB is not connected.');
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
}

async function savePrivateFile(fileId, pharmacyId, mimeType, buffer) {
  const upload = bucket().openUploadStreamWithId(fileId, 'pharmacy-licence', {
    contentType: mimeType,
    metadata: { pharmacyId: String(pharmacyId), mimeType },
  });
  await new Promise((resolve, reject) => {
    upload.once('finish', resolve);
    upload.once('error', reject);
    upload.end(buffer);
  });
}

async function deletePrivateFile(fileId) {
  if (!fileId) return;
  try { await bucket().delete(fileId); } catch (err) {
    if (err.code !== 'ENOENT' && !/FileNotFound/i.test(err.message)) {
      console.error('Private licence cleanup failed:', err.message);
    }
  }
}

function publicStatus(user, pharmacy) {
  const review = pharmacy?.licenseReview;
  const approvedAt = user?.pharmacyApprovedAt || null;
  const dueAt = approvedAt
    ? new Date(new Date(approvedAt).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000)
    : null;
  return {
    status: review?.status || 'not_submitted',
    revision: review?.revision || 0,
    submittedAt: review?.submittedAt || null,
    reviewedAt: review?.reviewedAt || null,
    reviewNote: review?.reviewNote || '',
    approvedAt: approvedAt || null,
    dueAt,
    // Informational only: order/checkout enforcement remains out of scope.
    graceExpired: dueAt && review?.status !== 'approved' ? Date.now() >= dueAt.getTime() : false,
    hasDocument: Boolean(review?.documentId),
  };
}

async function ownProfile(userId) {
  const user = await User.findById(userId).select('role status pharmacyApprovedAt').lean();
  if (!user || user.role !== 'pharmacy' || user.status !== 'active') {
    throw ApiError.forbidden('An active pharmacy account is required.', 'PHARMACY_APPROVAL_REQUIRED');
  }
  const pharmacy = await Pharmacy.findOne({ userId }).select('+licenseReview').lean();
  if (!pharmacy) throw ApiError.notFound('Pharmacy profile not found.');
  return { user, pharmacy };
}

async function ownStatus(userId) {
  const { user, pharmacy } = await ownProfile(userId);
  return publicStatus(user, pharmacy);
}

async function submit(userId, file) {
  const mimeType = acceptedMime(file);
  const { user, pharmacy } = await ownProfile(userId);
  if (pharmacy.licenseReview?.status === 'approved') {
    throw ApiError.conflict('Your licence has already been approved.', 'PHARMACY_LICENCE_APPROVED');
  }
  const previous = pharmacy.licenseReview;
  const nextRevision = (previous?.revision || 0) + 1;
  const now = new Date();
  const fileId = new mongoose.Types.ObjectId();
  await savePrivateFile(fileId, pharmacy._id, mimeType, file.buffer);
  let saved = false;
  try {
    await runInTransaction(async (session) => {
      const versionFilter = previous?.revision
        ? { 'licenseReview.revision': previous.revision }
        : { $or: [
          { licenseReview: { $exists: false } },
          { 'licenseReview.revision': 0 },
        ] };
      const updated = await Pharmacy.findOneAndUpdate(
        { _id: pharmacy._id, ...versionFilter },
        { $set: { licenseReview: {
          status: 'pending',
          revision: nextRevision,
          documentId: fileId,
          mimeType,
          fileSize: file.buffer.length,
          submittedAt: now,
          reviewedAt: null,
          reviewedBy: null,
          reviewNote: '',
        } } },
        { new: true, session }
      );
      if (!updated) throw ApiError.conflict('Licence changed; refresh and try again.', 'PHARMACY_LICENCE_CHANGED');
      await PharmacyLicenseAudit.create([{
        pharmacyId: pharmacy._id, actorId: userId, action: 'submitted', revision: nextRevision,
      }], { session });
    });
    saved = true;
  } finally {
    if (!saved) await deletePrivateFile(fileId);
  }
  // Only after the database refers to the replacement: never delete first.
  if (previous?.documentId) await deletePrivateFile(previous.documentId);
  return publicStatus(user, { licenseReview: {
    status: 'pending', revision: nextRevision, documentId: fileId, submittedAt: now,
  } });
}

function requireId(value) {
  if (!mongoose.isValidObjectId(value)) {
    throw ApiError.badRequest('Invalid pharmacy id.', undefined, 'INVALID_PHARMACY_ID');
  }
  return value;
}

async function review(adminId, pharmacyId, { decision, note } = {}) {
  requireId(pharmacyId);
  if (!['approved', 'rejected'].includes(decision)) {
    throw ApiError.badRequest('Choose approved or rejected.', undefined, 'INVALID_LICENCE_DECISION');
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) {
    throw ApiError.badRequest('Review note is too long.', undefined, 'INVALID_LICENCE_NOTE');
  }
  if (decision === 'rejected' && (!note || !note.trim())) {
    throw ApiError.badRequest('A rejection reason is required.', undefined, 'LICENCE_REASON_REQUIRED');
  }
  const trimmedNote = (note || '').trim();
  await runInTransaction(async (session) => {
    const current = await Pharmacy.findById(pharmacyId).select('+licenseReview').session(session);
    if (!current) throw ApiError.notFound('Pharmacy not found.');
    if (!current.licenseReview || current.licenseReview.status !== 'pending') {
      throw ApiError.conflict('Licence is not awaiting review.', 'PHARMACY_LICENCE_CHANGED');
    }
    const changed = await Pharmacy.findOneAndUpdate({
      _id: pharmacyId, 'licenseReview.status': 'pending',
      'licenseReview.revision': current.licenseReview.revision,
    }, {
      $set: {
        'licenseReview.status': decision,
        'licenseReview.reviewedAt': new Date(),
        'licenseReview.reviewedBy': adminId,
        'licenseReview.reviewNote': trimmedNote,
      },
    }, { session, new: true });
    if (!changed) throw ApiError.conflict('Licence changed; reload it.', 'PHARMACY_LICENCE_CHANGED');
    await PharmacyLicenseAudit.create([{
      pharmacyId, actorId: adminId, action: decision,
      revision: current.licenseReview.revision, note: trimmedNote,
    }], { session });
  });
  const [pharmacy, user] = await Promise.all([
    Pharmacy.findById(pharmacyId).select('+licenseReview').lean(),
    Pharmacy.findById(pharmacyId).select('userId').lean()
      .then(p => p ? User.findById(p.userId).select('pharmacyApprovedAt').lean() : null),
  ]);
  return publicStatus(user, pharmacy);
}

async function listPending({ after = null, limit = 20 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw ApiError.badRequest('Invalid page size.');
  }
  const filter = { 'licenseReview.status': 'pending' };
  if (after) filter._id = { $gt: new mongoose.Types.ObjectId(requireId(after)) };
  const rows = await Pharmacy.find(filter).select('nameAr ownerName phone userId +licenseReview')
    .sort({ _id: 1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map(p => ({
      pharmacyId: p._id, pharmacyName: p.nameAr, ownerName: p.ownerName, phone: p.phone,
      userId: p.userId, status: p.licenseReview.status,
      submittedAt: p.licenseReview.submittedAt, revision: p.licenseReview.revision,
    })),
    pagination: { hasMore, nextCursor: hasMore ? String(page[page.length - 1]._id) : null },
  };
}

async function openDocument(pharmacyId) {
  requireId(pharmacyId);
  const pharmacy = await Pharmacy.findById(pharmacyId).select('+licenseReview').lean();
  const documentId = pharmacy?.licenseReview?.documentId;
  if (!documentId) throw ApiError.notFound('Licence document not found.');
  const grid = bucket();
  const stored = await grid.find({ _id: documentId }).next();
  if (!stored) throw ApiError.notFound('Licence document not found.');
  return {
    stream: grid.openDownloadStream(documentId),
    length: stored.length,
  };
}

async function openOwnDocument(userId) {
  const { pharmacy } = await ownProfile(userId);
  return openDocument(pharmacy._id);
}

module.exports = {
  GRACE_DAYS, MAX_DOCUMENT_BYTES, publicStatus, acceptedMime,
  ownStatus, submit, review, listPending, openDocument, openOwnDocument,
};
