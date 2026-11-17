'use strict';
// "Clean page" before real ordering opens (owner decision 2026-11-17): every
// trial order that has NOT been delivered is cancelled by an admin, with a
// reason, so pharmacists re-order for real.
//
// Why cancellation and never deletion: an undelivered order has no ledger
// charge (a charge is posted only at delivery - orderLedger.service.js), so
// cancelling it leaves the books exactly as they are. Delivered orders already
// carry a real charge; they are reported and NEVER touched here - they need a
// separate financial review.
//
// Each order is cancelled on its own, in its own transaction, by a
// compare-and-swap on a resettable status and the cutoff, so a warehouse that
// delivers an order at the same moment wins cleanly and the order is simply
// reported as skipped. Re-running after a completed reset finds nothing.
const mongoose = require('mongoose');
const Order = require('../models/order.model');
const Pharmacy = require('../models/pharmacy.model');
const Warehouse = require('../models/warehouse.model');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const discountCodes = require('./discountCode.service');
const pharmacyCredit = require('./pharmacyCredit.service');
const financialAudit = require('./financialAudit.service');
const notificationService = require('./notification.service');
const { emitToWarehouse, EVENTS } = require('../realtime');

// Orders the warehouse has not sent out yet: cancelling them is always safe.
const RESETTABLE_STATUSES = Object.freeze(['pending', 'confirmed', 'preparing']);
// 'out_for_delivery' is opt-in and listed one by one in the preview: it has no
// charge in the system, but the goods may already be at the pharmacy with
// nobody having tapped "delivered" - cancelling it would erase a real debt and
// invite a second shipment. The admin must look at each one and decide.
const ON_THE_ROAD = 'out_for_delivery';
const MAX_ON_THE_ROAD_LISTED = 200;
function statusesFor(includeOutForDelivery) {
  return includeOutForDelivery ? [...RESETTABLE_STATUSES, ON_THE_ROAD] : [...RESETTABLE_STATUSES];
}
const MAX_ORDERS_PER_RUN = 5000;
const REASON_MIN = 10;
const REASON_MAX = 300;
const HISTORY_NOTE = 'admin_trial_reset';

function invalid(message, code = 'INVALID_TRIAL_RESET') {
  return ApiError.badRequest(message, undefined, code);
}

// The cutoff is explicit and never in the future: only orders created before
// it are in scope, so orders placed after real ordering opens are safe.
function parseCutoff(value, now = new Date()) {
  if (typeof value !== 'string' || value.length > 40) throw invalid('A cutoff date is required.');
  const cutoff = new Date(value);
  if (!Number.isFinite(cutoff.getTime())) throw invalid('Invalid cutoff date.');
  if (cutoff.getTime() > now.getTime() + 60 * 1000) throw invalid('The cutoff cannot be in the future.');
  return cutoff;
}

function parseReason(value) {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw invalid(`A reason of ${REASON_MIN}-${REASON_MAX} characters is required.`);
  }
  return reason;
}

function scopeFilter(cutoff, statuses) {
  return { createdAt: { $lt: cutoff }, status: { $in: statuses } };
}

async function previewTrialOrderReset({ before, includeOutForDelivery = false }, now = new Date()) {
  const cutoff = parseCutoff(before, now);
  const include = includeOutForDelivery === true || includeOutForDelivery === 'true';
  const statuses = statusesFor(include);
  const [byStatus, byWarehouse, delivered, onTheRoad] = await Promise.all([
    Order.aggregate([
      { $match: { createdAt: { $lt: cutoff } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: scopeFilter(cutoff, statuses) },
      { $group: { _id: '$warehouseId', count: { $sum: 1 }, pharmacies: { $addToSet: '$pharmacyId' } } },
    ]),
    Order.aggregate([
      { $match: scopeFilter(cutoff, ['delivered']) },
      { $group: { _id: '$warehouseId', count: { $sum: 1 }, finalPriceSyp: { $sum: '$finalPrice' } } },
    ]),
    Order.find(scopeFilter(cutoff, [ON_THE_ROAD])).select('orderNumber warehouseId finalPrice statusHistory')
      .sort({ createdAt: 1 }).limit(MAX_ON_THE_ROAD_LISTED + 1).lean(),
  ]);
  const warehouseIds = [...new Set([...byWarehouse, ...delivered, ...onTheRoad.map(row => ({ _id: row.warehouseId }))]
    .map(row => String(row._id)))];
  const names = new Map((await Warehouse.find({ _id: { $in: warehouseIds } }).select('nameAr nameEn').lean())
    .map(row => [String(row._id), row]));
  const label = id => ({ id: String(id), nameAr: names.get(String(id))?.nameAr ?? null, nameEn: names.get(String(id))?.nameEn ?? null });
  const statusCounts = Object.fromEntries(byStatus.map(row => [row._id, row.count]));
  const resettableCount = statuses.reduce((sum, status) => sum + (statusCounts[status] || 0), 0);
  return {
    before: cutoff.toISOString(),
    generatedAt: now.toISOString(),
    includeOutForDelivery: include,
    resettableStatuses: statuses,
    // Always listed, included or not, so the admin sees what is on the road.
    onTheRoad: {
      orders: statusCounts[ON_THE_ROAD] || 0,
      list: onTheRoad.slice(0, MAX_ON_THE_ROAD_LISTED).map(row => ({
        id: String(row._id), orderNumber: row.orderNumber, finalPriceSyp: row.finalPrice, ...label(row.warehouseId),
        sentAt: row.statusHistory?.filter(entry => entry.status === ON_THE_ROAD).at(-1)?.changedAt ?? null,
      })),
      truncated: onTheRoad.length > MAX_ON_THE_ROAD_LISTED,
    },
    statusCounts,
    resettableCount,
    affectedPharmacies: new Set(byWarehouse.flatMap(row => row.pharmacies.map(String))).size,
    warehouses: byWarehouse.map(row => ({ ...label(row._id), orders: row.count }))
      .sort((a, b) => b.orders - a.orders),
    // Not touched by the reset - real charges already exist for these.
    deliveredUntouched: {
      orders: delivered.reduce((sum, row) => sum + row.count, 0),
      warehouses: delivered.map(row => ({ ...label(row._id), orders: row.count, finalPriceSyp: row.finalPriceSyp })),
    },
    tooMany: resettableCount > MAX_ORDERS_PER_RUN,
    maxOrdersPerRun: MAX_ORDERS_PER_RUN,
  };
}

async function cancelOne(orderId, { actorId, cutoff, reason, now, statuses }) {
  return runInTransaction(async (session) => {
    const before = await Order.findById(orderId).select('status').session(session).lean();
    const updated = await Order.findOneAndUpdate(
      { _id: orderId, ...scopeFilter(cutoff, statuses) },
      {
        $set: { status: 'cancelled', cancelledBy: actorId, cancelReason: reason },
        $push: { statusHistory: { status: 'cancelled', changedBy: actorId, changedAt: now, note: HISTORY_NOTE } },
      },
      { new: true, session }
    );
    if (!updated) return null;
    await discountCodes.releaseUse(updated, 'cancelled', session);
    await pharmacyCredit.releaseForCancel(updated, session);
    await financialAudit.record({
      action: 'order.admin_cancelled',
      actorId,
      actorRole: 'admin',
      onBehalfOfWarehouseId: updated.warehouseId,
      entityType: 'Order',
      entityId: updated._id,
      before: { status: before?.status ?? null },
      after: { status: 'cancelled', note: HISTORY_NOTE },
      reason,
    }, session);
    return updated;
  });
}

async function notifyPharmacies(cancelled, reason) {
  const byPharmacy = new Map();
  for (const order of cancelled) {
    const key = String(order.pharmacyId);
    if (!byPharmacy.has(key)) byPharmacy.set(key, []);
    byPharmacy.get(key).push(order.orderNumber);
  }
  const pharmacies = await Pharmacy.find({ _id: { $in: [...byPharmacy.keys()] } }).select('userId').lean();
  let notified = 0;
  for (const pharmacy of pharmacies) {
    const numbers = byPharmacy.get(String(pharmacy._id)).sort((a, b) => a - b);
    const list = numbers.slice(0, 10).join('، ') + (numbers.length > 10 ? '…' : '');
    try {
      await notificationService.sendToUser(pharmacy.userId, {
        titleAr: 'تحديث طلباتك',
        titleEn: 'Order update',
        bodyAr: `ألغت إدارة فينيق الطلبات التجريبية (${list}): ${reason}`,
        bodyEn: `Feniq cancelled your trial orders (${numbers.slice(0, 10).join(', ')}): ${reason}`,
        type: 'order_update',
        relatedOrderId: numbers.length === 1 ? cancelled.find(o => o.orderNumber === numbers[0])._id : undefined,
      });
      notified += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Trial reset notification failed.', err.message);
    }
  }
  return notified;
}

// The warehouse may have the web panel closed and a driver on the road: a push
// to the owner account says which orders are off, so nobody ships them.
async function notifyWarehouses(cancelled) {
  const byWarehouse = new Map();
  for (const order of cancelled) {
    const key = String(order.warehouseId);
    if (!byWarehouse.has(key)) byWarehouse.set(key, []);
    byWarehouse.get(key).push(order.orderNumber);
  }
  const warehouses = await Warehouse.find({ _id: { $in: [...byWarehouse.keys()] } }).select('userId').lean();
  let notified = 0;
  for (const warehouse of warehouses) {
    if (!warehouse.userId) continue;
    const numbers = byWarehouse.get(String(warehouse._id)).sort((a, b) => a - b);
    const list = numbers.slice(0, 20).join('، ') + (numbers.length > 20 ? '…' : '');
    try {
      await notificationService.sendToUser(warehouse.userId, {
        titleAr: 'إلغاء طلبات تجريبية',
        titleEn: 'Trial orders cancelled',
        bodyAr: `ألغت إدارة فينيق ${numbers.length} طلب تجريبي: ${list}. لا تشحنها.`,
        bodyEn: `Feniq cancelled ${numbers.length} trial orders: ${numbers.slice(0, 20).join(', ')}. Do not ship them.`,
        type: 'order_update',
      });
      notified += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Trial reset warehouse notification failed.', err.message);
    }
  }
  return notified;
}

async function executeTrialOrderReset(actorId, body, now = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['before', 'reason', 'confirmCount', 'includeOutForDelivery'].includes(key)) ||
      (body.includeOutForDelivery !== undefined && typeof body.includeOutForDelivery !== 'boolean')) {
    throw invalid('Invalid trial reset request.');
  }
  const cutoff = parseCutoff(body.before, now);
  const include = body.includeOutForDelivery === true;
  const statuses = statusesFor(include);
  const reason = parseReason(body.reason);
  if (!Number.isSafeInteger(body.confirmCount) || body.confirmCount < 1) {
    throw invalid('Confirm the number of orders shown in the preview.');
  }
  const ids = await Order.find(scopeFilter(cutoff, statuses)).select('_id').sort({ createdAt: 1 })
    .limit(MAX_ORDERS_PER_RUN + 1).lean();
  if (ids.length > MAX_ORDERS_PER_RUN) throw invalid('Too many orders for one run.', 'TRIAL_RESET_TOO_MANY');
  // The preview is stale (an order was placed, delivered or cancelled since):
  // the admin must look again before anything is written.
  if (ids.length !== body.confirmCount) {
    throw ApiError.conflict('Orders changed since the preview. Preview again before confirming.', 'TRIAL_RESET_CHANGED');
  }
  const cancelled = [];
  const failed = [];
  let skipped = 0;
  for (const { _id } of ids) {
    try {
      const order = await cancelOne(_id, { actorId: new mongoose.Types.ObjectId(String(actorId)), cutoff, reason, now, statuses });
      if (order) cancelled.push(order); else skipped += 1;
    } catch (err) {
      failed.push({ orderId: String(_id), error: err.message });
    }
  }
  for (const order of cancelled) {
    emitToWarehouse(order.warehouseId, EVENTS.ORDER_CANCELLED, {
      orderId: order._id.toString(), orderNumber: order.orderNumber, warehouseId: order.warehouseId.toString(),
    });
  }
  const notifiedPharmacies = cancelled.length ? await notifyPharmacies(cancelled, reason) : 0;
  const notifiedWarehouses = cancelled.length ? await notifyWarehouses(cancelled) : 0;
  return {
    before: cutoff.toISOString(),
    includeOutForDelivery: include,
    requested: ids.length,
    cancelled: cancelled.length,
    skipped,
    failed,
    notifiedPharmacies,
    notifiedWarehouses,
    after: await previewTrialOrderReset({ before: cutoff.toISOString(), includeOutForDelivery: include }, now),
  };
}

module.exports = { RESETTABLE_STATUSES, ON_THE_ROAD, MAX_ORDERS_PER_RUN, HISTORY_NOTE, parseCutoff,
  previewTrialOrderReset, executeTrialOrderReset };
