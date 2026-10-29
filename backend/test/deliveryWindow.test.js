const test = require('node:test');
const assert = require('node:assert/strict');
const { nextDelivery } = require('../src/utils/deliveryWindow');
const zone = { active: true, preparationHours: 2,
  slots: [{ weekday: 6, departureTime: '10:00', arrivalHours: 4, cutoffHours: 3 }], exceptions: [] };
test('cutoff is inclusive in Damascus; a millisecond late selects the next week', () => {
  const atCutoff = new Date('2026-10-31T04:00:00Z'); // 07:00 local
  const current = nextDelivery(zone, atCutoff);
  assert.equal(current.dispatchDate, '2026-10-31');
  assert.equal(current.expectedBusiness, '2026-10-31 14:00');
  assert.equal(current.from.getTime(), atCutoff.getTime(), 'window never precedes submission');
  assert.equal(nextDelivery(zone, new Date(atCutoff.getTime() + 1)).dispatchDate, '2026-11-07');
});
test('preparation, cancelled trip and replacement trip are respected', () => {
  assert.equal(nextDelivery({ ...zone, preparationHours: 4 }, new Date('2026-10-31T04:00Z')).dispatchDate, '2026-11-07');
  const cancelled = { ...zone, exceptions: [{ date: '2026-10-31', cancelled: true }] };
  assert.equal(nextDelivery(cancelled, new Date('2026-10-30T04:00Z')).dispatchDate, '2026-11-07');
  const replacement = { ...zone, exceptions: [{ date: '2026-10-30', cancelled: false, departureTime: '18:00', cutoffHours: 1, arrivalHours: 2 }] };
  assert.equal(nextDelivery(replacement, new Date('2026-10-30T04:00Z')).expectedBusiness, '2026-10-30 20:00');
});
test('no schedule or disabled region has no invented arrival', () => {
  assert.equal(nextDelivery(null), null); assert.equal(nextDelivery({ ...zone, active: false }), null);
  assert.equal(nextDelivery({ ...zone, slots: [] }), null);
});
