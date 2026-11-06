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
