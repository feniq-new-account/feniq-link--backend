const { asyncHandler } = require('../utils/asyncHandler');
const license = require('../services/pharmacyLicense.service');
const { ApiError } = require('../utils/ApiError');

const getOwnStatus = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, license: await license.ownStatus(req.user._id) });
});

const submitOwn = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.status(201).json({
    success: true,
    license: await license.submit(req.user._id, req.file),
  });
});

function sendPrivateDocument(res, { stream, length, mimeType }) {
  const ext = mimeType === 'application/pdf' ? 'pdf'
    : mimeType === 'image/png' ? 'png' : 'jpg';
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Disposition', 'attachment; filename="pharmacy-licence.' + ext + '"');
  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Length', String(length));
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

const downloadOwn = asyncHandler(async (req, res) => {
  sendPrivateDocument(res, await license.openOwnDocument(req.user._id));
});

const listPending = asyncHandler(async (req, res) => {
  const rawLimit = req.query.limit;
  if (rawLimit !== undefined && (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit))) {
    throw ApiError.badRequest('Invalid page size.');
  }
  const limit = rawLimit === undefined ? 20 : Number(rawLimit);
  const after = req.query.after === undefined ? null : req.query.after;
  const results = await license.listPending({ limit, after });
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, ...results });
});

const review = asyncHandler(async (req, res) => {
  const result = await license.review(req.user._id, req.params.pharmacyId, req.body || {});
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, license: result });
});

const downloadAdmin = asyncHandler(async (req, res) => {
  sendPrivateDocument(res, await license.openDocument(req.params.pharmacyId));
});

module.exports = { getOwnStatus, submitOwn, downloadOwn, listPending, review, downloadAdmin };
