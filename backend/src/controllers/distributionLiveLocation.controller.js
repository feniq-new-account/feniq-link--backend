const { asyncHandler } = require('../utils/asyncHandler');
const service = require('../services/distributionLiveLocation.service');

const update = asyncHandler(async (req, res) => {
  const result = await service.update(req.user._id, req.params.id, req.body);
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, location: result });
});

const readForAdmin = asyncHandler(async (req, res) => {
  const result = await service.readForAdmin(req.params.id);
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, location: result });
});

module.exports = { update, readForAdmin };
