const { asyncHandler } = require('../utils/asyncHandler');
const repPortal = require('../services/repPortal.service');
const repViewModel = require('../viewmodels/rep.viewmodel');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');

// The rep's own app (role 'rep'). Every handler starts from the rep profile,
// which also refuses a rep the warehouse has switched off.

const me = asyncHandler(async (req, res) => {
  const rep = await repPortal.loadRepOrThrow(req.user._id);
  res.json({ success: true, ...repViewModel.toMe(await repPortal.getMe(rep)) });
});

const pharmacies = asyncHandler(async (req, res) => {
  const rep = await repPortal.loadRepOrThrow(req.user._id);
  const rows = await repPortal.listMyPharmacies(rep, { search: req.query.search });
  res.json({ success: true, pharmacies: rows.map(repViewModel.toAssignedPharmacy) });
});

const pharmacy = asyncHandler(async (req, res) => {
  const rep = await repPortal.loadRepOrThrow(req.user._id);
  const detail = await repPortal.getMyPharmacy(rep, req.params.pharmacyId);
  res.json({
    success: true,
    pharmacy: repViewModel.toAssignedPharmacy(detail),
    orders: detail.orders.map(repViewModel.toRepOrder),
    visits: detail.visits.map(repViewModel.toVisit),
  });
});

const createVisit = asyncHandler(async (req, res) => {
  const rep = await repPortal.loadRepOrThrow(req.user._id);
  const { code, latitude, longitude, accuracy, isMocked } = req.body ?? {};
  const { visit, pharmacy, duplicate } = await repPortal.recordVisit(rep, {
    code,
    latitude,
    longitude,
    accuracy,
    isMocked,
  });
  res.status(duplicate ? 200 : 201).json({
    success: true,
    duplicate,
    visit: repViewModel.toVisit(visit),
    pharmacy: { id: pharmacy._id, nameAr: pharmacy.nameAr, nameEn: pharmacy.nameEn },
  });
});

const visits = asyncHandler(async (req, res) => {
  const rep = await repPortal.loadRepOrThrow(req.user._id);
  const { limit, after } = parseCursorQuery(req.query, 20);
  const { rows, hasMore, nextCursor } = await repPortal.listMyVisits(rep, { limit, after: parseObjectIdCursor(after) });
  res.json({ success: true, visits: rows.map(repViewModel.toVisitRow), pagination: paginationMeta(hasMore, nextCursor) });
});

module.exports = { me, pharmacies, pharmacy, createVisit, visits };
