const mongoose = require('mongoose');
const Schedule = require('../models/deliverySchedule.model');
const Assignment = require('../models/deliveryAssignment.model');
const Pharmacy = require('../models/pharmacy.model');
const Order = require('../models/order.model');
const Audit = require('../models/warehouseAudit.model');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const { hasFeature } = require('./warehouseSubscription.service');
const { nextDelivery, TIME, windowAround } = require('../utils/deliveryWindow');
const { startOfBusinessDay, zonedTimeToInstant } = require('../utils/businessTime');
const invalid = () => ApiError.badRequest('Check the delivery regions, times and revision.', undefined, 'INVALID_DELIVERY_SCHEDULE');
const changed = () => ApiError.conflict('Delivery settings changed; reload first.', 'DELIVERY_CHANGED');
async function settings(warehouseId) {
  return await Schedule.findOne({ warehouseId }).select('-__v -lockVersion').lean() || { enabled: false, revision: 0, zones: [] };
}
function parseConfiguration(body) {
  if (!body || typeof body.enabled !== 'boolean' || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
    !Array.isArray(body.zones) || body.zones.length > 30) throw invalid();
  const ids = new Set(), names = new Set();
  const hours = (n, max) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max && Number.isInteger(n * 4);
  function slot(row, weekly) {
    if (!row || !TIME.test(row.departureTime) || !hours(row.arrivalHours, 72) || !hours(row.cutoffHours, 168) ||
      (weekly && (!Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6))) throw invalid();
    return { ...(weekly ? { weekday: row.weekday } : {}), departureTime: row.departureTime, arrivalHours: row.arrivalHours, cutoffHours: row.cutoffHours };
  }
  const zones = body.zones.map((row) => {
    const id = row._id ? String(row._id) : String(new mongoose.Types.ObjectId());
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!mongoose.isValidObjectId(id) || ids.has(id) || !name || name.length > 80 || names.has(name) ||
      typeof row.active !== 'boolean' || !hours(row.preparationHours, 168) || !Array.isArray(row.slots) || row.slots.length > 7 ||
      !Array.isArray(row.exceptions || []) || (row.exceptions || []).length > 90) throw invalid();
    ids.add(id); names.add(name);
    const weekdays = new Set(), dates = new Set();
    const slots = row.slots.map((s) => { const parsed = slot(s, true); if (weekdays.has(s.weekday)) throw invalid(); weekdays.add(s.weekday); return parsed; });
    const exceptions = (row.exceptions || []).map((s) => {
      if (!startOfBusinessDay(s.date) || dates.has(s.date) || typeof s.cancelled !== 'boolean') throw invalid();
      dates.add(s.date); return s.cancelled ? { date: s.date, cancelled: true } : { date: s.date, cancelled: false, ...slot(s, false) };
    });
    if (row.active && !slots.length && !exceptions.some((s) => !s.cancelled)) throw invalid();
    return { _id: id, name, active: row.active, preparationHours: row.preparationHours, slots, exceptions };
  });
  if (body.enabled && !zones.some((z) => z.active)) throw invalid();
  return { enabled: body.enabled, revision: body.revision + 1, zones };
}
async function configure(warehouseId, actorId, body) {
  const after = parseConfiguration(body);
  return runInTransaction(async (session) => {
    const before = await Schedule.findOne({ warehouseId }).session(session).lean();
    if ((before?.revision ?? 0) !== body.revision) throw changed();
    if (!before) {
      try { await Schedule.create([{ warehouseId, ...after }], { session }); } catch (error) { if (error.code === 11000) throw changed(); throw error; }
    } else {
      const result = await Schedule.updateOne({ _id: before._id, revision: body.revision }, { $set: after }, { session });
      if (!result.modifiedCount) throw changed();
    }
    await Audit.create([{ warehouseId, actorId, action: 'delivery.configured', before, after }], { session });
    return after;
  });
}
async function assign(warehouseId, actorId, pharmacyId, body) {
  if (!mongoose.isValidObjectId(pharmacyId) || !body || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
    (body.zoneId !== null && !mongoose.isValidObjectId(body.zoneId))) throw invalid();
  if (!await Pharmacy.exists({ _id: pharmacyId })) throw ApiError.notFound('Pharmacy not found.', 'PHARMACY_NOT_FOUND');
  return runInTransaction(async (session) => {
    const schedule = await Schedule.findOneAndUpdate({ warehouseId }, { $inc: { lockVersion: 1 } }, { session, new: true });
    if (!schedule || (body.zoneId && !schedule.zones.some((z) => String(z._id) === body.zoneId))) throw invalid();
    const before = await Assignment.findOne({ warehouseId, pharmacyId }).session(session).lean();
    if ((before?.revision ?? 0) !== body.revision) throw changed();
    const after = { zoneId: body.zoneId, revision: body.revision + 1 };
    await Assignment.updateOne({ warehouseId, pharmacyId, ...(before ? { revision: body.revision } : {}) }, { $set: after }, { session, upsert: !before });
    await Audit.create([{ warehouseId, actorId, action: 'delivery.assigned', before, after: { pharmacyId, ...after } }], { session });
    return after;
  });
}
async function estimate(pharmacyId, warehouseId, now = new Date(), { session, lock = false } = {}) {
  if (!await hasFeature(warehouseId, 'deliverySchedule')) return null;
  const schedule = lock ? await Schedule.findOneAndUpdate({ warehouseId, enabled: true }, { $inc: { lockVersion: 1 } }, { session, new: true }).lean()
    : await Schedule.findOne({ warehouseId, enabled: true }).session(session || null).lean();
  if (!schedule) return null;
  const assigned = await Assignment.findOne({ warehouseId, pharmacyId }).session(session || null).lean();
  const zone = schedule.zones.find((z) => String(z._id) === String(assigned?.zoneId));
  const window = nextDelivery(zone, now);
  return window ? { ...window, zoneId: String(zone._id), zoneName: zone.name, scheduleRevision: schedule.revision,
    promisedAt: now, revision: 0, source: { preparationHours: zone.preparationHours, slots: zone.slots, exceptions: zone.exceptions } }
    : { unavailable: true, timezone: 'Asia/Damascus' };
}
async function reschedule(warehouseId, actorId, orderId, body) {
  let expectedAt = typeof body?.expectedAt === 'string' && /T.*(Z|[+-]\d{2}:\d{2})$/.test(body.expectedAt) ? new Date(body.expectedAt) : new Date(NaN);
  if (typeof body?.expectedBusiness === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/.exec(body.expectedBusiness);
    if (match && startOfBusinessDay(match[1]) && TIME.test(match[2])) {
      const [year, month, day] = match[1].split('-').map(Number);
      const [hour, minute] = match[2].split(':').map(Number);
      expectedAt = zonedTimeToInstant(year, month, day, hour, minute);
    } else throw invalid();
  }
  const now = new Date();
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!mongoose.isValidObjectId(orderId) || !Number.isSafeInteger(body?.revision) || body.revision < 0 ||
    !reason || reason.length > 300 || !Number.isFinite(expectedAt.getTime()) || expectedAt <= now || expectedAt - now > 90 * 86400000) throw invalid();
  const result = await runInTransaction(async (session) => {
    const order = await Order.findOne({ _id: orderId, warehouseId }).session(session);
    if (!order) throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND');
    if (['delivered', 'cancelled'].includes(order.status) || !order.deliveryEstimate || order.deliveryEstimate.unavailable) throw invalid();
    if ((order.deliveryRevision ?? 0) !== body.revision) throw changed();
    const before = order.deliveryEstimate;
    const history = [...(before.history || []), { ...before, history: undefined }];
    if (history.length >= 30) throw invalid();
    order.deliveryRevision = body.revision + 1;
    order.deliveryEstimate = { ...before, ...windowAround(expectedAt, now), revision: order.deliveryRevision, reason, changedAt: now, history };
    await order.save({ session });
    await Audit.create([{ warehouseId, actorId, action: 'delivery.rescheduled', before: { orderId, estimate: before }, after: { orderId, estimate: order.deliveryEstimate } }], { session });
    return order;
  });
  const { emitToWarehouse, EVENTS } = require('../realtime');
  emitToWarehouse(warehouseId, EVENTS.ORDER_STATUS_UPDATED, { orderId: String(result._id), warehouseId: String(warehouseId), status: result.status });
  const pharmacy = await Pharmacy.findById(result.pharmacyId).select('userId').lean();
  if (pharmacy) await require('./notification.service').sendToUser(pharmacy.userId, { type: 'order_update', relatedOrderId: result._id,
    titleAr: 'تعديل موعد التوصيل', titleEn: 'Delivery estimate changed',
    bodyAr: `الطلب #${result.orderNumber}: ${result.deliveryEstimate.fromBusiness} — ${result.deliveryEstimate.toBusiness}. ${reason}`,
    bodyEn: `Order #${result.orderNumber}: ${result.deliveryEstimate.fromBusiness} — ${result.deliveryEstimate.toBusiness}. ${reason}` });
  return result.deliveryEstimate;
}
module.exports = { settings, configure, assign, estimate, reschedule, parseConfiguration };
