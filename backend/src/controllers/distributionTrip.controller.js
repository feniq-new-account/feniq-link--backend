const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const service = require('../services/distributionTrip.service');

const create = asyncHandler(async (req, res) => {
  const trip = await service.create(req.user._id, req.body);
  res.status(201).json({ success: true, trip });
});

const list = asyncHandler(async (req, res) => {
  const rawLimit = req.query.limit;
  if (rawLimit !== undefined && (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit))) {
    throw ApiError.badRequest('Invalid limit.');
  }
  res.json({ success: true, ...await service.list({
    status: req.query.status,
    after: req.query.after,
    limit: rawLimit === undefined ? 20 : Number(rawLimit),
  }) });
});

const detail = asyncHandler(async (req, res) => {
  res.json({ success: true, trip: await service.get(req.params.id) });
});

const start = asyncHandler(async (req, res) => {
  res.json({ success: true, trip: await service.transition(
    req.user._id, req.params.id, req.body, 'started',
  ) });
});
const stop = asyncHandler(async (req, res) => {
  res.json({ success: true, trip: await service.transition(
    req.user._id, req.params.id,
    { ...req.body, stopId: req.params.stopId }, 'stop',
  ) });
});
const complete = asyncHandler(async (req, res) => {
  res.json({ success: true, trip: await service.transition(
    req.user._id, req.params.id, req.body, 'completed',
  ) });
});
const cancel = asyncHandler(async (req, res) => {
  res.json({ success: true, trip: await service.transition(
    req.user._id, req.params.id, req.body, 'cancelled',
  ) });
});
module.exports = { create, list, detail, start, stop, complete, cancel };
