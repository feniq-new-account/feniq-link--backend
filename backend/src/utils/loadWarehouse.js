const Warehouse = require('../models/warehouse.model');
const { ApiError } = require('./ApiError');

// The signed-in warehouse user's Warehouse profile, or 404
// WAREHOUSE_PROFILE_NOT_FOUND. One copy for every warehouse controller
// (catalog overhaul Phase 11, L6 - it used to be pasted into each).
// `select` / `lean` for callers that only need the id.
async function loadWarehouseOrThrow(userId, { select = null, lean = false } = {}) {
  let query = Warehouse.findOne({ userId });
  if (select) query = query.select(select);
  if (lean) query = query.lean();
  const warehouse = await query;
  if (!warehouse) {
    throw ApiError.notFound('Warehouse profile not found.', 'WAREHOUSE_PROFILE_NOT_FOUND');
  }
  return warehouse;
}

module.exports = { loadWarehouseOrThrow };
