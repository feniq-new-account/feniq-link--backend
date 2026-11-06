process.env.JWT_SECRET ||= 'pilot-maintenance-tests-secret-at-least-32';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/unused';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const { previewPilotCleanup } = require('../src/services/adminMaintenancePreview.service');
const app = require('../src/app');
let server, base;
test.before(async () => {
  await startMemoryMongo({ dbName: 'admin-maintenance-preview', orderingOpen: false });
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});

test('preview inventories historical records and preserves them all', async () => {
  const owner = await User.create({ name: 'Old demo', phone: '0930000101', role: 'warehouse', status: 'blocked' });
  const warehouse = await Warehouse.create({
    userId: owner._id, nameAr: 'مستودع النجاح', nameEn: 'Al-Najah', city: 'Latakia',
    address: 'Historical address', phone: owner.phone, isActive: true,
  });
  const orderId = new mongoose.Types.ObjectId();
  const db = mongoose.connection.db;
  await db.collection('products').insertOne({ warehouseId: warehouse._id, nameEn: 'Sample', price: 1 });
  await db.collection('orders').insertOne({ _id: orderId, warehouseId: warehouse._id, status: 'delivered' });
  await db.collection('orderitems').insertOne({ orderId, quantity: 1 });
  await db.collection('payments').insertOne({ warehouseId: warehouse._id, amount: 1200 });

  const report = await previewPilotCleanup();
  assert.equal(report.readOnly, true);
  assert.equal(report.cleanupAvailable, false);
  assert.equal(report.verifiedRestorePoint, false);
  assert.equal(report.foundWarehouses, 1);
  assert.equal(report.needsAccountRecovery, 1);
  assert.equal(report.needsFinancialReview, true);
  assert.equal(report.warehouses[0].warehouseActive, true);
  assert.equal(report.warehouses[0].accountStatus, 'blocked');
  assert.equal(report.warehouses[0].counts.products, 1);
  assert.equal(report.warehouses[0].counts.orders, 1);
  assert.equal(report.warehouses[0].counts.orderitems, 1);
  assert.equal(report.warehouses[0].counts.payments, 1);
  assert.equal(await db.collection('orders').countDocuments({}), 1);
  assert.equal((await User.findById(owner._id)).status, 'blocked');
});

test('maintenance preview is not anonymously accessible', async () => {
  const response = await fetch(base + '/api/admin/maintenance/preview');
  assert.equal(response.status, 401);
  assert.equal(await mongoose.connection.db.collection('orders').countDocuments({}), 1);
});

test('pilot readiness distinguishes unblocked accounts and unexpired offers/packages from archived data', async () => {
  const db = mongoose.connection.db;
  const owner = await User.findOne({ role: 'warehouse', phone: '0930000101' });
  const warehouse = await Warehouse.findOne({ userId: owner._id });
  const now = Date.now();
  const started = new Date(now - 3600 * 1000);
  const ending = new Date(now + 3600 * 1000);
  const expired = new Date(now - 1000);
  await db.collection('offers').insertMany([
    { warehouseId: warehouse._id, status: 'approved', startDate: started, endDate: ending },
    { warehouseId: warehouse._id, status: 'approved', startDate: started, endDate: expired },
  ]);
  await db.collection('advertisements').insertMany([
    { warehouseId: warehouse._id, status: 'approved', startDate: started, endDate: ending, isAvailable: true },
    { warehouseId: warehouse._id, status: 'approved', startDate: started, endDate: ending, isAvailable: false },
  ]);
  await db.collection('banners').insertOne({
    warehouseId: warehouse._id, status: 'approved', startDate: started, endDate: ending,
  });
  const before = await previewPilotCleanup();
  assert.equal(before.warehouses[0].readiness.visibleToPharmacist, false);
  assert.equal(before.warehouses[0].readiness.availableProducts, 1);
  assert.equal(before.warehouses[0].readiness.visibleOffers, 1);
  assert.equal(before.warehouses[0].readiness.visiblePackages, 1);
  assert.equal(before.warehouses[0].readiness.visibleBanners, 1);
  assert.equal(before.pilotReadiness.visibleWarehouses, 0);
  assert.equal(before.pilotReadiness.orderingEnabled, false);
  assert.equal(before.pilotReadiness.phoneToDashboardVerified, false);
  assert.equal(before.pilotReadiness.deployVerified, false);

  await User.updateOne({ _id: owner._id }, { $set: { status: 'active' } });
  const after = await previewPilotCleanup();
  assert.equal(after.warehouses[0].readiness.visibleToPharmacist, true);
  assert.equal(after.warehouses[0].readiness.canReceiveOrders, true);
  assert.equal(after.pilotReadiness.visibleWarehouses, 1);
  assert.equal(after.pilotReadiness.warehousesWithOffers, 1);
  assert.equal(after.pilotReadiness.warehousesWithPackages, 1);
  await User.updateOne({ _id: owner._id }, { $set: { status: 'blocked' } });
});
