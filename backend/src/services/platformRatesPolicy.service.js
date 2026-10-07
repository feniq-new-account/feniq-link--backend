const Warehouse = require('../models/warehouse.model');

// Feniq's profit policy (owner's decision, HANDOFF.md): no platform discount
// for pharmacies and no flat commission on orders. Feniq's only cut of an order
// is a quarter of the rep's commission (utils/repCommission.js). The 4% discount
// and 1% commission the code used to default to were placeholders.
//
// Warehouses created before that still carry the old defaults in their own
// rows. This sets exactly those - 4 and 1 together, the untouched defaults - to
// zero, once and for good (it finds nothing the second time). A warehouse whose
// rates an admin has deliberately changed is left alone, so this can never
// overwrite a real agreement.
async function zeroLegacyPlatformRates() {
  const { modifiedCount } = await Warehouse.updateMany(
    { discountRate: 4, commissionRate: 1 },
    { $set: { discountRate: 0, commissionRate: 0 } }
  );
  return modifiedCount;
}

module.exports = { zeroLegacyPlatformRates };
