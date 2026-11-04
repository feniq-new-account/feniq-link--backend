const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');
const Rep = require('../models/rep.model');
const Payment = require('../models/payment.model');
const { hasFeature } = require('../services/warehouseSubscription.service');

function requireWarehouseFeature(name) {
  return asyncHandler(async (req, res, next) => {
    let warehouseId;
    if (req.user.role === 'rep') {
      const rep = await Rep.findOne({ userId: req.user._id, isActive: true }).select('warehouseId').lean();
      if (!rep) throw ApiError.forbidden('Rep account is inactive.', 'REP_INACTIVE');
      warehouseId = rep.warehouseId;
    } else {
      warehouseId = (await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true }))._id;
    }
    if (!await hasFeature(warehouseId, name)) {
      // Expiry must not turn a lost payment acknowledgement into a new,
      // unconfirmable attempt. Only let an existing same-warehouse receipt
      // reach the payment service's original fingerprint/replay validation.
      const key = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
      const replay = name === 'accounting' && req.method === 'POST' && key &&
        await Payment.exists({ warehouseId, idempotencyKey: key,
          kind: req.path.endsWith('/reverse') ? 'reversal' : 'settlement' });
      if (!replay) throw ApiError.forbidden('This feature is not enabled for this warehouse.', 'FEATURE_NOT_ENABLED');
    }
    next();
  });
}
module.exports = { requireWarehouseFeature };
