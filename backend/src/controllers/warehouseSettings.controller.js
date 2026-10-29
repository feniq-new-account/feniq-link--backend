const { asyncHandler } = require('../utils/asyncHandler');
const settingsService = require('../services/warehouseSettings.service');
const settingsViewModel = require('../viewmodels/warehouseSettings.viewmodel');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');

const get = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const settings = await settingsService.getSettings(warehouse._id);
  res.json({ success: true, ...settingsViewModel.toWarehouseSettingsResponse(settings) });
});

// Scoped to the caller's OWN warehouse (resolved from the JWT's user, never
// from a body/param id) - a warehouse can't edit another's limits.
const update = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  // The limits are converted from SYP in the panel - a changed one must carry
  // the rate it used (exchangeRate.service.js's assertRateUsedIsCurrent).
  const updated = await settingsService.updateOrderLimits(
    warehouse._id,
    {
      minOrderAmountUsd: req.body.minOrderAmountUsd,
      maxOrderAmountUsd: req.body.maxOrderAmountUsd,
      requireDeliverySealPhoto: req.body.requireDeliverySealPhoto,
      rateUsed: req.body.rateUsed,
    },
    { requireRateUsed: true }
  );
  res.json({
    success: true,
    message: 'Settings updated.',
    ...settingsViewModel.toWarehouseSettingsResponse(updated),
  });
});

const updateLoyalty = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const updated = await settingsService.updateLoyalty(warehouse._id, {
    enabled: req.body?.enabled,
    mode: req.body?.mode,
    revision: req.body?.revision,
    actorId: req.user._id,
    tiers: req.body?.tiers,
  });
  res.json({ success: true, message: 'Loyalty updated.', ...settingsViewModel.toWarehouseSettingsResponse(updated) });
});

module.exports = { get, update, updateLoyalty };
