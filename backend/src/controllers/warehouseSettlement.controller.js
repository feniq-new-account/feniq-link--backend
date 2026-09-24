const { asyncHandler } = require('../utils/asyncHandler');
const settlementService = require('../services/settlement.service');
const settlementViewModel = require('../viewmodels/settlement.viewmodel');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');

// Read-only. Scoped to the caller's own warehouse, resolved from the JWT -
// a warehouse can never see another's settlement.
const get = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const settlement = await settlementService.getSettlementForWarehouse(warehouse._id, {
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ success: true, ...settlementViewModel.toSettlementResponse(settlement) });
});

module.exports = { get };
