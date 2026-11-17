// Pre-launch clean page (owner's call, 2026-11-17): every warehouse today is a
// demo; the three pilot ones (0930000101..103) are deleted with everything
// scoped to them before Asfoura, the first real warehouse, goes live.
// Pharmacy accounts must survive untouched - they are real pharmacists.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-demo-purge-tests-pad';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

function stubModule(relativePath, exportsValue) {
  const resolved = require.resolve(path.join(__dirname, '..', 'src', relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
}
stubModule('realtime/index.js', {
  emitToWarehouse: () => {}, emitToAdmins: () => {}, emitToUser: () => {},
  EVENTS: { ORDER_CREATED: 'order.created', ORDER_CANCELLED: 'order.cancelled', ORDER_STATUS_UPDATED: 'order.status.updated' },
});
stubModule('services/notification.service.js', { sendToUser: async () => {}, sendToAll: async () => {} });

const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Order = require('../src/models/order.model');
const Product = require('../src/models/product.model');
const Notification = require('../src/models/notification.model');
const LedgerEntry = require('../src/models/ledgerEntry.model');
const LedgerAccount = require('../src/models/ledgerAccount.model');
const FinancialAuditLog = require('../src/models/financialAuditLog.model');
const warehouseOrderService = require('../src/services/warehouseOrder.service');
const service = require('../src/services/demoWarehousePurge.service');

const ids = {};
let seq = 5000;

async function deliveredOrder(warehouse, warehouseUser) {
  const order = await Order.create({
    orderNumber: ++seq, pharmacyId: ids.pharmacy, warehouseId: warehouse, status: 'out_for_delivery',
    totalPrice: 1000, discountAmount: 0, commissionAmount: 0, finalPrice: 1000,
    statusHistory: [{ status: 'out_for_delivery', changedBy: warehouseUser, changedAt: new Date() }],
  });
  // The real path: delivery posts the pharmacy's debt in the ledger.
  await warehouseOrderService.advanceOrderStatus(String(order._id), warehouse, warehouseUser);
  await Notification.create({ userId: ids.pharmacyUser, titleAr: 'ت', titleEn: 'T', bodyAr: 'ب', bodyEn: 'B',
    type: 'order_update', relatedOrderId: order._id });
  return order;
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-demo-purge' });
  await syncIndexes(Order, LedgerEntry, LedgerAccount);
  const [pharmacyUser, admin, demoA, demoB, demoMember, real] = await User.create([
    { name: 'Pharm', phone: '0931111301', role: 'pharmacy', status: 'active' },
    { name: 'Admin', phone: '0951111301', role: 'admin', status: 'active' },
    { name: 'Demo A', phone: '0930000101', role: 'warehouse', status: 'active' },
    { name: 'Demo B', phone: '0930000102', role: 'warehouse', status: 'active' },
    { name: 'Demo accountant', phone: '0930000199', role: 'warehouse', warehouseRole: 'accountant', status: 'active' },
    { name: 'Asfoura', phone: '0941111301', role: 'warehouse', status: 'active' },
  ]);
  Object.assign(ids, { pharmacyUser: pharmacyUser._id, admin: admin._id, demoAUser: demoA._id, demoBUser: demoB._id,
    demoMember: demoMember._id, realUser: real._id });
  const pharmacy = await Pharmacy.create({ userId: pharmacyUser._id, nameAr: 'صيدلية', nameEn: 'Ph', ownerName: 'O',
    address: 'a', city: 'Latakia', areaType: 'city', phone: '0931111301', addedBy: 'self' });
  ids.pharmacy = pharmacy._id;
  const base = { address: 'r', city: 'Latakia', deliveryType: 'self', isActive: true };
  const [wa, wb, wr] = await Warehouse.create([
    { ...base, userId: demoA._id, memberUserIds: [demoMember._id], nameAr: 'تجريبي أ', nameEn: 'Demo A', phone: '0930000101' },
    { ...base, userId: demoB._id, nameAr: 'تجريبي ب', nameEn: 'Demo B', phone: '0930000102' },
    { ...base, userId: real._id, nameAr: 'مستودع عصفورة', nameEn: 'Asfoura', phone: '0941111301' },
  ]);
  Object.assign(ids, { demoA: wa._id, demoB: wb._id, real: wr._id });
  for (const [w, u] of [[wa._id, demoA._id], [wb._id, demoB._id], [wr._id, real._id]]) {
    await Product.create({ warehouseId: w, nameAr: 'دواء', nameEn: 'Drug', price: 1 });
    await deliveredOrder(w, u);
  }
});
test.after(stopMemoryMongo);

test('preview lists only the pilot warehouses and their logins, writes nothing, and keeps pharmacies', async () => {
  const preview = await service.previewDemoPurge();
  assert.deepEqual(preview.warehouses.map((w) => w.nameEn).sort(), ['Demo A', 'Demo B']);
  assert.deepEqual(preview.logins.map((u) => u.phone).sort(), ['0930000101', '0930000102', '0930000199']);
  assert.ok(preview.logins.every((u) => ['warehouse', 'rep'].includes(u.role)));
  assert.equal(preview.counts.Order, 2);
  assert.equal(preview.counts.Product, 2);
  assert.ok(preview.counts.LedgerAccount >= 2);
  assert.equal(preview.pharmacyAccountsKept, 1);
  assert.equal(preview.confirmPhrase, service.CONFIRM_PHRASE);
  assert.match(preview.planToken, /^[0-9a-f]{16}$/);
  assert.equal(await Order.countDocuments(), 3);
});

test('the delete needs the exact phrase and the previewed plan', async () => {
  const { planToken } = await service.previewDemoPurge();
  await assert.rejects(service.executeDemoPurge(ids.admin, { planToken, confirm: 'احذف' }), { code: 'DEMO_PURGE_CONFIRM_REQUIRED' });
  await assert.rejects(service.executeDemoPurge(ids.admin, { confirm: service.CONFIRM_PHRASE }), { code: 'DEMO_PURGE_PLAN_REQUIRED' });
  await assert.rejects(service.executeDemoPurge(ids.admin, { planToken: 'ffffffffffffffff', confirm: service.CONFIRM_PHRASE }),
    { code: 'DEMO_PURGE_PLAN_CHANGED' });
  assert.equal(await Order.countDocuments(), 3);
});

test('the purge removes the demo warehouses and everything of theirs, and nothing else', async () => {
  const realLedgerBefore = await LedgerEntry.countDocuments({ warehouseId: ids.real });
  assert.ok(realLedgerBefore > 0);
  const { planToken } = await service.previewDemoPurge();
  const result = await service.executeDemoPurge(ids.admin, { planToken, confirm: service.CONFIRM_PHRASE });

  // Demo side: gone.
  assert.equal(await Warehouse.countDocuments({ _id: { $in: [ids.demoA, ids.demoB] } }), 0);
  assert.equal(await Order.countDocuments({ warehouseId: { $in: [ids.demoA, ids.demoB] } }), 0);
  assert.equal(await Product.countDocuments({ warehouseId: { $in: [ids.demoA, ids.demoB] } }), 0);
  assert.equal(await LedgerAccount.countDocuments({ warehouseId: { $in: [ids.demoA, ids.demoB] } }), 0);
  assert.equal(await LedgerEntry.countDocuments({ warehouseId: { $in: [ids.demoA, ids.demoB] } }), 0);
  assert.equal(await User.countDocuments({ _id: { $in: [ids.demoAUser, ids.demoBUser, ids.demoMember] } }), 0);
  assert.equal(result.deleted.Warehouse, 2);
  assert.equal(result.deleted.User, 3);

  // Real warehouse, its ledger, and every pharmacy and admin account: untouched.
  assert.equal(await Warehouse.countDocuments({ _id: ids.real }), 1);
  assert.equal(await Order.countDocuments({ warehouseId: ids.real }), 1);
  assert.equal(await Product.countDocuments({ warehouseId: ids.real }), 1);
  assert.equal(await LedgerEntry.countDocuments({ warehouseId: ids.real }), realLedgerBefore);
  assert.equal(await User.countDocuments({ _id: { $in: [ids.pharmacyUser, ids.admin, ids.realUser] } }), 3);
  assert.equal(await Pharmacy.countDocuments({ _id: ids.pharmacy }), 1);
  assert.equal(result.pharmacyAccountsUnchanged, true);

  // The pharmacist's notifications about deleted orders go; the real one stays.
  assert.equal(await Notification.countDocuments({ userId: ids.pharmacyUser }), 1);

  // The trail stays: one audit row per deleted warehouse.
  assert.equal(await FinancialAuditLog.countDocuments({ action: 'maintenance.demo_purge' }), 2);

  // The real warehouse's books still balance after the purge.
  const { verifyAllAccounts } = require('../src/services/ledger.service');
  assert.deepEqual(await verifyAllAccounts({ rebuild: false }), []);
});

test('running it again finds nothing to delete', async () => {
  const preview = await service.previewDemoPurge();
  assert.deepEqual(preview.warehouses, []);
  assert.deepEqual(preview.counts, {});
});
