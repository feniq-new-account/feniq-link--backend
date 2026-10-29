process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'delivery-test-secret-at-least-32-characters';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Schedule = require('../src/models/deliverySchedule.model');
const Assignment = require('../src/models/deliveryAssignment.model');
const Order = require('../src/models/order.model');
const Audit = require('../src/models/warehouseAudit.model');
const service = require('../src/services/deliverySchedule.service');
const billing = require('../src/services/warehouseSubscription.service');
const { runInTransaction } = require('../src/utils/transaction');
let wh, other, actor, ph, zoneId, saved, server, base;
const now = new Date('2026-10-30T04:00:00Z');
test.before(async () => {
  await startMemoryMongo({ dbName: 'delivery-schedule' }); await Promise.all([Schedule.init(), Assignment.init(), Order.init()]);
  actor = await User.create({ name: 'Owner', phone: '+963944123456', role: 'warehouse', status: 'active' });
  wh = await Warehouse.create({ userId: actor.id, nameAr: 'A', nameEn: 'A', city: 'Latakia', address: 'Street', phone: actor.phone });
  other = await Warehouse.create({ userId: new mongoose.Types.ObjectId(), nameAr: 'B', nameEn: 'B', city: 'Jableh', address: 'Street', phone: actor.phone });
  ph = await Pharmacy.create({ userId: new mongoose.Types.ObjectId(), nameAr: 'Pharmacy', nameEn: 'Pharmacy', ownerName: 'Owner', city: 'Latakia', areaType: 'rural', address: 'Street', phone: '+963944987654', addedBy: 'self' });
  saved = await service.configure(wh.id, actor.id, { enabled: true, revision: 0, zones: [{ name: 'الريف الشمالي', active: true,
    preparationHours: 2, slots: [{ weekday: 6, departureTime: '10:00', arrivalHours: 4, cutoffHours: 3 }], exceptions: [] }] });
  zoneId = saved.zones[0]._id;
});
test.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await stopMemoryMongo(); });
test('server estimates only the assigned warehouse region and freezes its source at order submission', async () => {
  assert.equal((await service.estimate(ph.id, wh.id, now)).unavailable, true);
  assert.equal(await service.estimate(ph.id, other.id, now), null);
  await service.assign(wh.id, actor.id, ph.id, { zoneId, revision: 0 });
  const estimate = await runInTransaction((session) => service.estimate(ph.id, wh.id, now, { session, lock: true }));
  assert.equal(estimate.zoneName, 'الريف الشمالي'); assert.equal(estimate.expectedBusiness, '2026-10-31 14:00');
  const order = await Order.create({ orderNumber: 991001, pharmacyId: ph.id, warehouseId: wh.id, status: 'pending',
    totalPrice: 100, discountAmount: 0, commissionAmount: 0, finalPrice: 100, deliveryEstimate: estimate });
  saved = await service.configure(wh.id, actor.id, { ...saved, revision: saved.revision, enabled: false });
  assert.equal(await service.estimate(ph.id, wh.id, now), null);
  assert.equal((await Order.findById(order.id)).deliveryEstimate.expectedBusiness, '2026-10-31 14:00');
  assert.ok((await Audit.countDocuments({ warehouseId: wh.id })) >= 3);
});
test('concurrent settings cannot overwrite each other and foreign/dangling zones are refused', async () => {
  const results = await Promise.allSettled([service.configure(wh.id, actor.id, saved), service.configure(wh.id, actor.id, saved)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'DELIVERY_CHANGED');
  await assert.rejects(service.assign(other.id, actor.id, ph.id, { zoneId, revision: 0 }), { code: 'INVALID_DELIVERY_SCHEDULE' });
  await assert.rejects(service.assign(wh.id, actor.id, ph.id, { zoneId, revision: 0 }), { code: 'DELIVERY_CHANGED' });
});
test('HTTP settings and pharmacy search resolve the caller warehouse; pharmacy role is refused', async () => {
  const jwt = require('jsonwebtoken');
  const pharmacyUser = await User.create({ _id: ph.userId, name: 'Pharmacy', phone: ph.phone, role: 'pharmacy', status: 'active' });
  server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api/warehouse/delivery`;
  const headers = (person) => ({ authorization: `Bearer ${jwt.sign({ sub: person.id, role: person.role, tokenVersion: 0 }, process.env.JWT_SECRET)}` });
  const own = await fetch(base, { headers: headers(actor) }); assert.equal(own.status, 200);
  const search = await fetch(`${base}/pharmacies?q=Pharmacy`, { headers: headers(actor) });
  assert.equal(search.status, 200);
  const body = await search.json(); assert.equal(body.pharmacies.length, 1);
  assert.equal(body.pharmacies[0].id, ph.id); assert.equal(body.pharmacies[0].assignment.zoneId, zoneId);
  assert.equal((await fetch(base, { headers: headers(pharmacyUser) })).status, 403);
});
test('subscription switch stops new estimates without deleting an old promise', async () => {
  const current = await service.settings(wh.id);
  await service.configure(wh.id, actor.id, { ...current, enabled: true });
  await billing.configureSubscription(wh.id, actor.id, { features: { deliverySchedule: false } });
  assert.equal(await service.estimate(ph.id, wh.id, now), null);
  assert.ok((await Order.findOne({ orderNumber: 991001 })).deliveryEstimate.expectedAt);
});
test('reschedule requires a reason, expected revision and own live order; it preserves history', async () => {
  const order = await Order.findOne({ orderNumber: 991001 });
  const expectedAt = new Date(Date.now() + 2 * 86400000).toISOString();
  await assert.rejects(service.reschedule(other.id, actor.id, order.id, { revision: 0, reason: 'Road closed', expectedAt }), { code: 'ORDER_NOT_FOUND' });
  await assert.rejects(service.reschedule(wh.id, actor.id, order.id, { revision: 0, reason: '', expectedAt }), { code: 'INVALID_DELIVERY_SCHEDULE' });
  const result = await service.reschedule(wh.id, actor.id, order.id, { revision: 0, reason: 'Road closed', expectedAt });
  assert.equal(result.revision, 1); assert.equal(result.history.length, 1); assert.equal(result.history[0].expectedBusiness, '2026-10-31 14:00');
  await assert.rejects(service.reschedule(wh.id, actor.id, order.id, { revision: 0, reason: 'Again', expectedAt }), { code: 'DELIVERY_CHANGED' });
});
test('bad calendar dates, duplicate weekdays and oversized input are rejected', () => {
  assert.throws(() => service.parseConfiguration({ enabled: true, revision: 0, zones: [] }), { code: 'INVALID_DELIVERY_SCHEDULE' });
  const zone = saved.zones[0];
  assert.throws(() => service.parseConfiguration({ ...saved, zones: [{ ...zone, exceptions: [{ date: '2026-02-30', cancelled: true }] }] }), { code: 'INVALID_DELIVERY_SCHEDULE' });
  assert.throws(() => service.parseConfiguration({ ...saved, zones: [{ ...zone, slots: [zone.slots[0], zone.slots[0]] }] }), { code: 'INVALID_DELIVERY_SCHEDULE' });
});
