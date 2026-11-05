const { asyncHandler } = require('../utils/asyncHandler');
const service = require('../services/distributionDriverAccount.service');

const create = asyncHandler(async (req, res) => {
  const driver = await service.createExternalDriver(req.body);
  res.set('Cache-Control', 'private, no-store');
  res.status(201).json({ success: true, driver });
});

module.exports = { create };
