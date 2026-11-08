'use strict';
const { asyncHandler } = require('../utils/asyncHandler');
const draft = require('../services/quarterCommissionAllocationDraft.service');

// Router is admin-only. No endpoint here settles money or changes live shares.
const get = asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, allocation: await draft.readDraft() });
});
const put = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, allocation: await draft.saveDraft(req.user._id, req.body) });
});
const preview = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...draft.previewDraft(req.body) });
});
module.exports = { get, put, preview };
