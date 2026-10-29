const Order = require('../models/order.model');
const { Types } = require('mongoose');
const Pharmacy = require('../models/pharmacy.model');
const Warehouse = require('../models/warehouse.model');
const LedgerEntry = require('../models/ledgerEntry.model');
const Subscription = require('../models/warehouseSubscription.model');
const ProductCatalog = require('../models/productCatalog.model');
const RepVisit = require('../models/repVisit.model');
const { evaluateSubscription, FEATURES } = require('./warehouseSubscription.service');
const { runInTransaction } = require('../utils/transaction');
const { resolveSummaryPeriod } = require('./warehouseSummary.service');
const { movementsFor } = require('./warehouseInsights.service');
const { businessDateOf } = require('../utils/businessTime');
const { businessStamp } = require('../utils/deliveryWindow');
const { ApiError } = require('../utils/ApiError');
const NET = { charge: ['salesSyp', 1], charge_reversal: ['salesSyp', -1], payment: ['collectionsSyp', 1],
  payment_reversal: ['collectionsSyp', -1], return_credit: ['returnsSyp', 1], return_credit_reversal: ['returnsSyp', -1] };
const cache = new Map();
function invalidate() { cache.clear(); }
function reportingWindow(query, now) {
  if (query.period === 'custom' && [query.from, query.to].some((v) => !/^\d{4}-\d{2}-\d{2}$/.test(v || ''))) throw ApiError.badRequest('Select calendar dates.', undefined, 'INVALID_PERIOD');
  const period = resolveSummaryPeriod({ ...query, period: query.period || 'month' }, now);
  if (period.to > now) period.to = now;
  if (period.from > period.to || period.to - period.from > 366 * 86400000) throw ApiError.badRequest('Choose at most 366 days ending today.', undefined, 'INVALID_PERIOD');
  return period;
}
async function load(query, now) {
  const period = reportingWindow(query, now);
  const previous = { from: new Date(period.from.getTime() - (period.to - period.from) - 1), to: new Date(period.from.getTime() - 1) };
  return runInTransaction(async (session) => {
    const profiles = await Pharmacy.find({}).select('city areaType').session(session).lean();
    const pharmacyRegion = new Map(profiles.map((p) => [String(p._id), { city: p.city?.trim() || '', areaType: p.areaType || '' }]));
    const regions = new Map();
    function regionFor(pharmacyId) {
      const place = pharmacyRegion.get(String(pharmacyId)) || { city: '', areaType: '' };
      const key = `${place.city}\u0000${place.areaType}`;
      if (!regions.has(key)) regions.set(key, { ...place, orders: 0, cancelled: 0, requestedSyp: 0, salesSyp: 0, returnsSyp: 0, collectionsSyp: 0 });
      return regions.get(key);
    }
    let requestedOrders = 0, cancelledOrders = 0, requestedSyp = 0, acceptedSamples = 0, acceptedMs = 0, deliveredSamples = 0, deliveredMs = 0;
    let loyaltyOrders = 0, scheduledOrders = 0;
    const statuses = {}, cancellationReasons = new Map(), currentPharmacies = new Set(), previousPharmacies = new Set(), olderPharmacies = new Set();
    for await (const order of Order.find({ createdAt: { $gte: previous.from, $lte: now } }).select('pharmacyId status finalPrice createdAt statusHistory cancelReason loyaltyDiscountAmount monthlyLoyalty.tiers deliveryEstimate.expectedAt')
      .session(session).lean().cursor()) {
      const pharmacy = String(order.pharmacyId);
      const current = order.createdAt >= period.from && order.createdAt <= period.to;
      if (order.status !== 'cancelled') {
        if (current) currentPharmacies.add(pharmacy);
        else if (order.createdAt >= previous.from && order.createdAt <= previous.to) previousPharmacies.add(pharmacy);

      }
      if (!current) continue;
      const region = regionFor(order.pharmacyId); region.orders++; requestedOrders++;
      statuses[order.status] = (statuses[order.status] || 0) + 1;
      if (order.status === 'cancelled') {
        cancelledOrders++; region.cancelled++;
        const reason = order.cancelReason?.trim().slice(0, 300) || '';
        cancellationReasons.set(reason, (cancellationReasons.get(reason) || 0) + 1);
      } else {
        requestedSyp += order.finalPrice; region.requestedSyp += order.finalPrice;
        if (order.loyaltyDiscountAmount > 0 || order.monthlyLoyalty?.tiers?.length) loyaltyOrders++;
        if (order.deliveryEstimate?.expectedAt) scheduledOrders++;
      }
      const acceptedAt = order.statusHistory?.find((h) => ['confirmed', 'preparing', 'out_for_delivery', 'delivered'].includes(h.status))?.changedAt;
      if (acceptedAt >= order.createdAt && acceptedAt <= now) { acceptedSamples++; acceptedMs += acceptedAt - order.createdAt; }
      const deliveredAt = order.status === 'delivered' ? order.statusHistory?.find((h) => h.status === 'delivered')?.changedAt : null;
      if (deliveredAt >= order.createdAt && deliveredAt <= now) { deliveredSamples++; deliveredMs += deliveredAt - order.createdAt; }
    }
    const source = new Map();
    let paymentPosts = 0, paymentReversals = 0;
    for await (const entry of LedgerEntry.find({ kind: { $in: Object.keys(NET) }, createdAt: { $lte: now },
      effectiveAt: { $gte: period.from, $lte: period.to } }).select('pharmacyId kind effectiveAt amountSyp').session(session).lean().cursor()) {
      const [field, sign] = NET[entry.kind], amount = sign * entry.amountSyp;
      const date = businessDateOf(entry.effectiveAt);
      const row = source.get(date) || { date, salesSyp: 0, returnsSyp: 0, collectionsSyp: 0 };
      row[field] += amount; source.set(date, row); regionFor(entry.pharmacyId)[field] += amount;
      if (entry.kind === 'payment') paymentPosts++;
      if (entry.kind === 'payment_reversal') paymentReversals++;
    }
    const money = movementsFor([...source.values()], period);
    if (currentPharmacies.size) {
      const older = await Order.aggregate([
        { $match: { pharmacyId: { $in: [...currentPharmacies].map((id) => new Types.ObjectId(id)) },
          createdAt: { $lt: previous.from }, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$pharmacyId' } },
      ]).session(session);
      for (const row of older) olderPharmacies.add(String(row._id));
    }
    const demand = await Order.aggregate([
      { $match: { createdAt: { $gte: period.from, $lte: period.to }, status: { $ne: 'cancelled' } } },
      { $lookup: { from: 'orderitems', localField: '_id', foreignField: 'orderId', as: 'lines' } },
      { $unwind: '$lines' }, { $replaceRoot: { newRoot: '$lines' } },
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
      { $set: { linkedId: { $arrayElemAt: ['$product.masterProductId', 0] } } },
      { $lookup: { from: ProductCatalog.collection.name, localField: 'linkedId', foreignField: '_id', as: 'master' } },
      { $set: { masterId: { $arrayElemAt: ['$master._id', 0] } } },
      // Rank by distinct orders, not quantities across incompatible pack units.
      { $group: { _id: { orderId: '$orderId', identity: { $ifNull: ['$masterId', '$productId'] } },
        nameAr: { $first: '$productNameAr' }, nameEn: { $first: '$productNameEn' }, linked: { $first: { $ne: [{ $ifNull: ['$masterId', null] }, null] } } } },
      { $group: { _id: '$_id.identity', nameAr: { $first: '$nameAr' }, nameEn: { $first: '$nameEn' }, linked: { $first: '$linked' }, orders: { $sum: 1 } } },
      { $sort: { orders: -1, _id: 1 } }, { $limit: 20 },
    ]).session(session);
    const visits = await RepVisit.aggregate([{ $match: { scannedAt: { $gte: period.from, $lte: period.to } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).session(session);
    const subscriptions = await Subscription.find({}).session(session).lean();
    const warehouses = await Warehouse.find({}).select('_id isActive').session(session).lean();
    const byWarehouse = new Map(subscriptions.map((s) => [String(s.warehouseId), s]));
    const subscriptionStates = {}, featureAvailability = Object.fromEntries(FEATURES.map((f) => [f, 0]));
    for (const warehouse of warehouses) {
      const evaluated = evaluateSubscription(byWarehouse.get(String(warehouse._id)), now);
      subscriptionStates[evaluated.state] = (subscriptionStates[evaluated.state] || 0) + 1;
      for (const f of FEATURES) if (evaluated.features[f]) featureAvailability[f]++;
    }
    const retained = [...previousPharmacies].filter((p) => currentPharmacies.has(p)).length;
    const returned = [...currentPharmacies].filter((p) => !previousPharmacies.has(p) && olderPharmacies.has(p)).length;
    return { asOf: now, asOfBusiness: businessStamp(now), timezone: 'Asia/Damascus',
      period: { fromDate: businessDateOf(period.from), toDate: businessDateOf(period.to) },
      previous: { fromDate: businessDateOf(previous.from), toDate: businessDateOf(previous.to), fromBusiness: businessStamp(previous.from), toBusiness: businessStamp(previous.to) },
      orders: { requestedOrders, cancelledOrders, requestedSyp, statuses }, ...money,
      regions: [...regions.values()].map((row) => ({ ...row, netSalesSyp: row.salesSyp - row.returnsSyp })).sort((a, b) => b.orders - a.orders || a.city.localeCompare(b.city)),
      demand: demand.map((row) => ({ id: String(row._id), nameAr: row.nameAr, nameEn: row.nameEn, linked: row.linked, orders: row.orders })),
      cancellationReasons: [...cancellationReasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 20),
      timing: { acceptanceHours: acceptedSamples ? Math.round(acceptedMs / acceptedSamples / 36000) / 100 : null, acceptedSamples,
        deliveryHours: deliveredSamples ? Math.round(deliveredMs / deliveredSamples / 36000) / 100 : null, deliveredSamples },
      retention: { current: currentPharmacies.size, previous: previousPharmacies.size, retained, returned,
        percent: previousPharmacies.size ? Math.round(retained / previousPharmacies.size * 10000) / 100 : null },
      subscriptions: { warehouses: warehouses.length, states: subscriptionStates, featureAvailability },
      featureUsage: { loyaltyOrders, scheduledOrders, paymentPosts, paymentReversals, visits: Object.fromEntries(visits.map((r) => [r._id, r.count])) },
    };
  });
}
async function report(query = {}, now = new Date()) {
  reportingWindow(query, now);
  const key = JSON.stringify([query.period || 'month', query.from, query.to]);
  const entry = cache.get(key);
  if (query.force !== '1' && entry && Date.now() - entry.at < 30000) return entry.promise;
  const next = { at: Date.now(), promise: load(query, now) }; cache.set(key, next);
  if (cache.size > 10) cache.delete(cache.keys().next().value);
  try { return await next.promise; } catch (error) { if (cache.get(key) === next) cache.delete(key); throw error; }
}
module.exports = { report, invalidate, reportingWindow };
