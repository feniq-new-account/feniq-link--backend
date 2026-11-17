// The owner's rule: an order on the road for a day without anyone marking it
// delivered counts as delivered (warehouseOrder.service.js's
// autoDeliverStaleOrders, run hourly from server.js). It is then charged to
// the pharmacy like any delivered order, so the manager is shown when that
// will happen (autoDeliverAt on the warehouse order responses).
const { FEATURES } = require('../config/features');

const AUTO_DELIVER_AFTER_MS = 24 * 60 * 60 * 1000;

// When this order becomes due for automatic delivery, or null when it is not
// on the road. Mirrors the job's query exactly: it closes an order once ANY
// 'out_for_delivery' entry is at least a day old, i.e. a day after the
// earliest one. The job itself runs hourly, so the actual close can come up
// to an hour after this time, never before it.
function autoDeliverAtFor(order) {
  if (!order || order.status !== 'out_for_delivery') return null;
  // The job cannot close an order still waiting for its delivery seal photo
  // (deliverOrder refuses it), so there is no deadline to promise.
  if (FEATURES.deliverySealPhoto && order.requiresDeliverySealPhoto && !order.deliverySealPhoto) return null;
  let earliest = null;
  for (const entry of order.statusHistory || []) {
    if (entry.status !== 'out_for_delivery' || !entry.changedAt) continue;
    const at = new Date(entry.changedAt).getTime();
    if (Number.isNaN(at)) continue;
    if (earliest === null || at < earliest) earliest = at;
  }
  return earliest === null ? null : new Date(earliest + AUTO_DELIVER_AFTER_MS);
}

// What the warehouse order responses carry: the deadline only while the
// countdown feature is on (FEATURES.autoDeliverCountdown), else null so the
// app shows nothing.
function shownAutoDeliverAt(order) {
  return FEATURES.autoDeliverCountdown ? autoDeliverAtFor(order) : null;
}

module.exports = { AUTO_DELIVER_AFTER_MS, autoDeliverAtFor, shownAutoDeliverAt };
