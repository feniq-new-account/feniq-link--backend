const Order = require('../models/order.model');
const Return = require('../models/return.model');
const { Event: CollectionEvent } = require('../models/collectionAccounting.model');

// What the rep, Feniq and the warehouse earn from the commission on a set of
// orders, from the split frozen on each order (utils/repCommission.js).
//
// Only DELIVERED orders count: that is when the warehouse owes anyone anything.
// And a credited return takes its proportion back - the same rule
// settlement.service.js applies to Feniq's share (commissionClawbackFor), so
// the rep's half and Feniq's quarter never disagree about an order whose goods
// came back. An order with no approved return counts in full.
//
// `match` is a plain aggregation $match (ObjectIds already cast). With `byRep`
// the rows are one per repId; without, a single row (or none). Amounts are
// whole liras, rounded once at the end rather than per order.
async function sumRepCommission(match, { byRep = false, sourceBreakdown = false } = {}) {
  const legacy = await Order.aggregate([
    { $match: { ...match, status: 'delivered', commissionEngine: { $ne: 'collection_v2' }, repCommission: { $ne: null } } },
    {
      $lookup: {
        from: Return.collection.name,
        let: { orderId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$orderId', '$$orderId'] }, { $eq: ['$status', 'approved'] }] } } },
          { $project: { _id: 0, creditSyp: { $ifNull: ['$creditSyp', 0] } } },
        ],
        as: 'returns',
      },
    },
    {
      $addFields: {
        keptShare: {
          $max: [0, { $subtract: [1, { $divide: [{ $sum: '$returns.creditSyp' }, { $max: [1, '$finalPrice'] }] }] }],
        },
      },
    },
    {
      $group: {
        _id: byRep ? '$repId' : null,
        repAmount: { $sum: { $multiply: ['$repCommission.repAmount', '$keptShare'] } },
        feniqAmount: { $sum: { $multiply: ['$repCommission.feniqAmount', '$keptShare'] } },
        pharmacyAmount: { $sum: { $multiply: [{ $ifNull: ['$repCommission.pharmacyAmount', 0] }, '$keptShare'] } },
        savingAmount: { $sum: { $multiply: ['$repCommission.savingAmount', '$keptShare'] } },
      },
    },
    {
      $project: {
        repAmount: { $round: ['$repAmount', 0] },
        feniqAmount: { $round: ['$feniqAmount', 0] },
        pharmacyAmount: { $round: ['$pharmacyAmount', 0] },
        savingAmount: { $round: ['$savingAmount', 0] },
      },
    },
  ]);
  if (Object.keys(match).some(key => !['warehouseId', 'repId', 'createdAt'].includes(key))) {
    throw new Error('Unsupported cross-model commission filter.');
  }
  const eventMatch = { ...(match.warehouseId ? { warehouseId: match.warehouseId } : {}),
    ...(match.repId ? { repId: match.repId } : {}), ...(match.createdAt ? { at: match.createdAt } : {}) };
  const collection = await CollectionEvent.aggregate([{ $match: eventMatch }, { $group: {
    _id: byRep ? '$repId' : null, repAmount: { $sum: '$repSyp' }, feniqAmount: { $sum: '$feniqSyp' },
  } }]);
  const combined = new Map(legacy.map(row => [String(row._id), row]));
  for (const row of collection) {
    const previous = combined.get(String(row._id)) ?? { _id: row._id, repAmount: 0, feniqAmount: 0, pharmacyAmount: 0, savingAmount: 0 };
    combined.set(String(row._id), { ...previous, repAmount: previous.repAmount + row.repAmount, feniqAmount: previous.feniqAmount + row.feniqAmount });
  }
  // Additive, opt-in read model for the rep's own profile. Legacy delivered-order
  // sums and collection_v2 posted cash events have different recognition times.
  // Never present their sum as one homogeneous earned/paid amount.
  if (sourceBreakdown) {
    const legacyById = new Map(legacy.map(row => [String(row._id), row.repAmount]));
    const collectedById = new Map(collection.map(row => [String(row._id), row.repAmount]));
    return [...combined.values()].map(row => ({
      ...row,
      legacyDeliveredRepAmount: legacyById.get(String(row._id)) ?? 0,
      collectedRepAmount: collectedById.get(String(row._id)) ?? 0,
    }));
  }
  return [...combined.values()];
}

module.exports = { sumRepCommission };
