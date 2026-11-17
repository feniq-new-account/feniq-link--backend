// Owner's call, 2026-11-17: no order is ever delivered on its own. Only the
// manager or the accountant marks it delivered, and decides then how it is
// paid. The hourly job stays in the code behind FEATURES.autoDelivery, off.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-auto-delivery-switch-pad';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const { FEATURES } = require('../src/config/features');
const { shownAutoDeliverAt } = require('../src/utils/autoDelivery');

const onRoad = { status: 'out_for_delivery', statusHistory: [{ status: 'out_for_delivery', changedAt: new Date('2026-11-20T08:00:00Z') }] };

test('automatic delivery and its countdown are both off', () => {
  assert.strictEqual(FEATURES.autoDelivery, false);
  assert.strictEqual(FEATURES.autoDeliverCountdown, false);
});

test('the server never schedules the auto-delivery job while it is off', (t) => {
  const { _startAutoDelivery } = require('../src/server');
  const scheduled = [];
  t.mock.method(global, 'setInterval', (fn, ms) => { scheduled.push(ms); return { unref() {} }; });
  _startAutoDelivery();
  assert.deepStrictEqual(scheduled, []);
});

test('no countdown is shown while auto-delivery is off, even if the countdown switch is on', (t) => {
  t.after(() => { FEATURES.autoDeliverCountdown = false; FEATURES.autoDelivery = false; });
  FEATURES.autoDeliverCountdown = true;
  assert.strictEqual(shownAutoDeliverAt(onRoad), null);
  FEATURES.autoDelivery = true;
  assert.ok(shownAutoDeliverAt(onRoad));
});
