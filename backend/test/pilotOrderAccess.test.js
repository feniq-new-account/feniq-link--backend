process.env.JWT_SECRET ||= 'test-pilot-access-secret-at-least-32-characters';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/unused';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const PlatformSetting = require('../src/models/platformSetting.model');
const { saveLaunch } = require('../src/services/launch.service');
const pilot = require('../src/services/pilotOrderAccess.service');

let admin;
let first;
let another;
let knownWarehouse;
let unrelatedWarehouse;
test.before(async () => {
  await startMemoryMongo({ dbName: 'pilot-allowlist', orderingOpen: false });
  await PlatformSetting.init();
  admin = await User.create({ name: 'Admin', phone: '0944000200', role: 'admin', status: 'active' });
  first = await User.create({ name: 'First', phone: '0944000201', role: 'pharmacy', status: 'active' });
  another = await User.create({ name: 'Other', phone: '0944000202', role: 'pharmacy', status: 'active' });
  const demoOwner = await User.create({ name: 'Known demo', phone: '0930000101', role: 'warehouse', status: 'active' });
  const otherOwner = await User.create({ name: 'Other owner', phone: '0939123456', role: 'warehouse', status: 'active' });
  knownWarehouse = await Warehouse.create({
    userId: demoOwner._id, nameAr: 'مستودع النجاح', nameEn: 'Najah',
    city: 'Latakia', address: 'Demo', phone: demoOwner.phone, isActive: true,
  });
  unrelatedWarehouse = await Warehouse.create({
    userId: otherOwner._id, nameAr: 'Real warehouse', nameEn: 'Real',
    city: 'Latakia', address: 'Other', phone: otherOwner.phone, isActive: true,
  });
  await saveLaunch(admin._id, {
    mode: 'ordering_open', message: 'Temporary test', revision: 0,
    orderingClosesAt: new Date(Date.now() + 3600000).toISOString(),
  });
});
test.after(async () => { await stopMemoryMongo(); });

test('time-limited pilot denies every checkout until an admin selects testers', async () => {
  const status = await pilot.readPilotAccess();
  assert.deepEqual(status.allowedPhones, []);
  assert.equal(status.revision, 0);
  await assert.rejects(pilot.assertPilotOrderAccess({
    userId: first._id, warehouseId: knownWarehouse._id,
  }), error => error.statusCode === 403 && error.code === 'PILOT_ACCESS_RESTRICTED');
});

test('admin allowlist accepts only specified active testers and old demo warehouses', async () => {
  const saved = await pilot.savePilotAccess(admin._id, {
    revision: 0, allowedPhones: [first.phone],
  });
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.allowedPhones, [first.phone]);
  await pilot.assertPilotOrderAccess({ userId: first._id, warehouseId: knownWarehouse._id });
  await assert.rejects(pilot.assertPilotOrderAccess({
    userId: another._id, warehouseId: knownWarehouse._id,
  }), error => error.code === 'PILOT_ACCESS_RESTRICTED');
  await assert.rejects(pilot.assertPilotOrderAccess({
    userId: first._id, warehouseId: unrelatedWarehouse._id,
  }), error => error.code === 'PILOT_WAREHOUSE_RESTRICTED');
});

test('unrecognized, blocked and stale admin configuration cannot loosen access', async () => {
  await assert.rejects(pilot.savePilotAccess(admin._id, {
    revision: 1, allowedPhones: ['0944999999'],
  }), error => error.code === 'PILOT_PHARMACY_NOT_ACTIVE');
  await User.updateOne({ _id: another._id }, { $set: { status: 'blocked' } });
  await assert.rejects(pilot.savePilotAccess(admin._id, {
    revision: 1, allowedPhones: [another.phone],
  }), error => error.code === 'PILOT_PHARMACY_NOT_ACTIVE');
  await assert.rejects(pilot.savePilotAccess(admin._id, {
    revision: 0, allowedPhones: [],
  }), error => error.code === 'PILOT_ACCESS_CHANGED');
  assert.deepEqual((await pilot.readPilotAccess()).allowedPhones, [first.phone]);
});

test('permanent launch has no trial allowlist gate', async () => {
  await PlatformSetting.updateOne({ key: 'pharmacistLaunch' },
    { $set: { 'value.orderingClosesAt': null } });
  await pilot.assertPilotOrderAccess({ userId: another._id, warehouseId: unrelatedWarehouse._id });
});

test('pilot expiry and manually closed ordering leave retries to existing service rules', async () => {
  assert.equal(pilot.activePilotWindow({
    mode: 'ordering_open', orderingClosesAt: '2026-11-08T21:00:00.000Z',
  }, Date.parse('2026-11-08T21:00:00.000Z')), false);
  assert.equal(pilot.activePilotWindow({
    mode: 'registration_only', orderingClosesAt: null,
  }), false);
  await PlatformSetting.updateOne({ key: 'pharmacistLaunch' },
    { $set: { 'value.mode': 'registration_only' } });
  await pilot.assertPilotOrderAccess({ userId: another._id, warehouseId: unrelatedWarehouse._id });
});
