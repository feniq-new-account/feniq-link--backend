const { asyncHandler } = require('../utils/asyncHandler');
const repService = require('../services/rep.service');
const repViewModel = require('../viewmodels/rep.viewmodel');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');

// The warehouse's Reps page: its field reps, the pharmacies each covers, and
// their visits.

async function warehouseId(req) {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  return warehouse._id;
}

const list = asyncHandler(async (req, res) => {
  const rows = await repService.listReps(await warehouseId(req));
  res.json({ success: true, reps: rows.map(repViewModel.toRepRow) });
});

const create = asyncHandler(async (req, res) => {
  const { name, phone, password } = req.body ?? {};
  const rep = await repService.createRep(await warehouseId(req), { name, phone, password });
  res.status(201).json({ success: true, message: 'Rep created.', rep: repViewModel.toRep(rep) });
});

const update = asyncHandler(async (req, res) => {
  const { name, isActive } = req.body ?? {};
  const rep = await repService.updateRep(await warehouseId(req), req.params.repId, { name, isActive });
  res.json({ success: true, rep: repViewModel.toRep(rep) });
});

const resetPassword = asyncHandler(async (req, res) => {
  const rep = await repService.resetRepPassword(await warehouseId(req), req.params.repId, {
    password: req.body?.password,
  });
  res.json({ success: true, message: 'Password reset.', rep: repViewModel.toRep(rep) });
});

const pharmacies = asyncHandler(async (req, res) => {
  const { rep, pharmacies: rows } = await repService.listRepPharmacies(await warehouseId(req), req.params.repId);
  res.json({ success: true, rep: repViewModel.toRep(rep), pharmacies: rows.map(repViewModel.toAssignedPharmacy) });
});

const searchPharmacies = asyncHandler(async (req, res) => {
  const rows = await repService.searchPharmacies(await warehouseId(req), { q: req.query.q });
  res.json({
    success: true,
    pharmacies: rows.map(({ pharmacy, currentRep }) => ({ ...repViewModel.toPharmacy(pharmacy), currentRep })),
  });
});

const assignPharmacy = asyncHandler(async (req, res) => {
  const assignment = await repService.assignPharmacy(
    await warehouseId(req),
    req.user._id,
    req.params.pharmacyId,
    req.body?.repId ?? null
  );
  res.json({
    success: true,
    assignment: assignment ? { pharmacyId: assignment.pharmacyId, repId: assignment.repId } : null,
  });
});

const visits = asyncHandler(async (req, res) => {
  const { limit, after } = parseCursorQuery(req.query, 20);
  const { rows, hasMore, nextCursor } = await repService.listVisits(await warehouseId(req), {
    repId: typeof req.query.repId === 'string' && req.query.repId ? req.query.repId : undefined,
    pharmacyId: typeof req.query.pharmacyId === 'string' && req.query.pharmacyId ? req.query.pharmacyId : undefined,
    limit,
    after: parseObjectIdCursor(after),
  });
  res.json({ success: true, visits: rows.map(repViewModel.toVisitRow), pagination: paginationMeta(hasMore, nextCursor) });
});

const visitCode = asyncHandler(async (req, res) => {
  const { pharmacy, code, qrPayload } = await repService.visitCodeForAssignedPharmacy(
    await warehouseId(req),
    req.params.pharmacyId
  );
  res.json({
    success: true,
    pharmacy: { id: pharmacy._id, nameAr: pharmacy.nameAr, nameEn: pharmacy.nameEn, address: pharmacy.address },
    code,
    qrPayload,
  });
});

module.exports = { list, create, update, resetPassword, pharmacies, searchPharmacies, assignPharmacy, visits, visitCode };
