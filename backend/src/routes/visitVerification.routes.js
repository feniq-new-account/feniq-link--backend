const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { objectIdParams, stringQueryOnly } = require('../middlewares/validateRequest');
const { asyncHandler } = require('../utils/asyncHandler');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');
const Pharmacy = require('../models/pharmacy.model');
const service = require('../services/visitVerification.service');
const router = Router();
router.use(authenticate, authorize('admin'));
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, policy: await service.getPolicy() })));
router.put('/', asyncHandler(async (req, res) => res.json({ success: true, policy: await service.savePolicy(req.body, req.user._id) })));
router.get('/pharmacies', stringQueryOnly, asyncHandler(async (req, res) => {
  const { limit, after } = parseCursorQuery(req.query, 20);
  const cursor = parseObjectIdCursor(after);
  const filter = cursor ? { _id: { $gt: cursor } } : {};
  if (req.query.approval === 'approved') filter.locationApproval = 'approved';
  if (req.query.approval === 'pending') filter.locationApproval = { $ne: 'approved' };
  if (req.query.search?.trim()) {
    const term = new RegExp(req.query.search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ nameAr: term }, { nameEn: term }, { city: term }, { phone: term }];
  }
  const rows = await Pharmacy.find(filter).select('nameAr nameEn city address phone location locationApproval locationVersion locationApprovedAt')
    .sort({ _id: 1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  res.json({ success: true, pharmacies: page.map(service.locationSummary),
    pagination: paginationMeta(rows.length > limit, page.length ? String(page.at(-1)._id) : null) });
}));
router.put('/pharmacies/:pharmacyId', objectIdParams('pharmacyId'), asyncHandler(async (req, res) => {
  res.json({ success: true, pharmacy: await service.setPharmacyLocation(req.params.pharmacyId, req.user._id, req.body) });
}));
module.exports = router;
