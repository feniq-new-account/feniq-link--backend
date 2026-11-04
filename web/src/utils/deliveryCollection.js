import { newIdempotencyKey } from './payments';

// A delivery and its collection are separate server operations. Keep the
// acknowledged stage and the original payment key until both are confirmed.
export function createDeliveryCollectionStore(scope, storage) {
  if (storage === undefined) {
    try { storage = globalThis.localStorage; } catch { /* The visible queue remains available. */ }
  }
  const storageKey = `feniq.pending-deliveries:${scope}`;
  let pending = [];
  try { pending = JSON.parse(storage?.getItem(storageKey) || '[]'); } catch { /* Start with an empty queue. */ }
  if (!Array.isArray(pending)) pending = [];
  pending = pending.filter((item) => item && typeof item.orderId === 'string' && typeof item.idempotencyKey === 'string'
    && typeof item.pharmacyId === 'string' && Number.isFinite(item.amountSyp) && item.amountSyp >= 0
    && ['delivery', 'payment'].includes(item.phase));
  const listeners = new Set();
  const inFlight = new Map();
  const save = () => {
    try { storage?.setItem(storageKey, JSON.stringify(pending)); } catch { /* The visible queue remains available. */ }
    for (const listener of listeners) listener([...pending]);
  };
  const store = {
    list: () => [...pending],
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    prepare(order, amountSyp, note) {
      const existing = pending.find((item) => item.orderId === order.id);
      if (existing) return existing;
      const item = {
        orderId: order.id, orderNumber: order.orderNumber, pharmacyId: order.pharmacy?.id,
        amountSyp, note, phase: 'delivery', idempotencyKey: newIdempotencyKey(),
      };
      pending = [...pending, item];
      save();
      return item;
    },
    run(api, item) {
      if (inFlight.has(item.orderId)) return inFlight.get(item.orderId);
      const run = (async () => {
        if (item.phase === 'delivery') {
          await api.advanceOrderStatus(item.orderId, { expectedStatus: 'out_for_delivery', targetStatus: 'delivered' });
          item.phase = 'payment';
          save();
        }
        if (item.amountSyp > 0) {
          await api.createPayment({
            pharmacyId: item.pharmacyId, amount: item.amountSyp, currency: 'SYP', method: 'cash',
            note: item.note, idempotencyKey: item.idempotencyKey,
          });
        }
        pending = pending.filter((entry) => entry.orderId !== item.orderId);
        save();
      })().finally(() => inFlight.delete(item.orderId));
      inFlight.set(item.orderId, run);
      return run;
    },
  };
  return store;
}
