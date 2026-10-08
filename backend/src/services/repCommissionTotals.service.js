const Order = require('../models/order.model');
const Return = require('../models/return.model');

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
async function sumRepCommission(match, { byRep = false } = {}) {
  return Order.aggregate([
    { $match: { ...match, status: 'delivered', repCommission: { $ne: null } } },
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
}

module.exports = { sumRepCommission };
