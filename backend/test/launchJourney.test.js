// One integrated launch journey across real HTTP routes and a temporary replica
// set. No production data, credentials, external messages or payment providers.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
process.env.JWT_SECRET ||= 'feniq-launch-journey-tests-at-least-32-characters';
const test = require('node:test'), assert = require('node:assert/strict'), jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model'), Warehouse = require('../src/models/warehouse.model');
const Pharmacy = require('../src/models/pharmacy.model'), Product = require('../src/models/product.model');
const Order = require('../src/models/order.model'), Item = require('../src/models/orderItem.model');
const Rep = require('../src/models/rep.model'), Credit = require('../src/models/pharmacyCredit.model');
const Account = require('../src/models/ledgerAccount.model'), Entry = require('../src/models/ledgerEntry.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
let server, base, admin, owner, pharmacist, outsider, warehouse, pharmacy, product;
const token = (u) => jwt.sign({ sub: String(u._id || u.id), role: u.role, tokenVersion: 0 }, process.env.JWT_SECRET);
async function call(user, path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, { method, headers: { authorization: `Bearer ${token(user)}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`); return data;
}
test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-launch-journey' });
  await Promise.all([Account.init(), Entry.init(), Order.init(), Credit.init()]);
  const person = (name, role, phone, warehouseRole) => User.create({ name, role, phone, warehouseRole, status: 'active' });
  admin = await person('Admin', 'admin', '+963944100001'); owner = await person('Owner', 'warehouse', '+963944100002', 'owner');
  pharmacist = await person('Pharmacist', 'pharmacy', '+963944100003'); outsider = await person('Other warehouse', 'warehouse', '+963944100004', 'owner');
  warehouse = await Warehouse.create({ userId: owner.id, nameAr: 'مستودع النجاح', nameEn: 'Al Najah', city: 'Latakia', address: 'Street', phone: owner.phone });
  await Warehouse.create({ userId: outsider.id, nameAr: 'Other', nameEn: 'Other', city: 'Jableh', address: 'Other street', phone: outsider.phone });
  pharmacy = await Pharmacy.create({ userId: pharmacist.id, nameAr: 'صيدلية الريف', nameEn: 'Countryside pharmacy', ownerName: 'Owner', city: 'Latakia', areaType: 'rural', address: 'North countryside', phone: pharmacist.phone, addedBy: 'self' });
  product = await Product.create({ warehouseId: warehouse.id, nameAr: 'دواء تجريبي', manufacturerAr: 'شركة', price: 1, unitAr: 'علبة', isActive: true, isAvailable: true });
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 1000, source: 'manual' });
  server = require('../src/app').listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await stopMemoryMongo(); });

test('legacy order history stays consistent while core cash survives subscription changes', async () => {
  const member = (await call(admin, `/admin/warehouses/${warehouse.id}/members`, 'POST', { name: 'Accountant', phone: '0944100005', password: 'Launch-Test-2026', warehouseRole: 'accountant' }, 201)).member;
  const accountant = await User.findById(member.id);
  const subscription = await call(accountant, '/warehouse/subscription');
  assert.equal(subscription.state, 'promotion'); assert.equal(subscription.configuration, null);
  const repCreated = (await call(accountant, '/warehouse/reps', 'POST', { name: 'مندوب الريف', phone: '0944100006', password: 'Launch-Test-2026', commissionRate: 4 }, 201)).rep;
  const rep = await Rep.findById(repCreated.id), repUser = await User.findById(rep.userId);
  await call(owner, `/warehouse/reps/pharmacies/${pharmacy.id}/rep`, 'PUT', { repId: rep.id });
  await call(admin, `/admin/visit-verification/pharmacies/${pharmacy.id}`, 'PUT', { latitude: 35.55, longitude: 35.78, approval: 'approved', version: 0 });
  const code = (await call(pharmacist, '/pharmacy/visit-code')).qrPayload;
  const visitBody = { code, latitude: 35.55, longitude: 35.78, accuracy: 20, capturedAt: new Date().toISOString(), isMocked: false };
  assert.equal((await call(repUser, '/rep/visits', 'POST', visitBody, 201)).visit.status, 'verified');
  assert.equal((await call(repUser, '/rep/visits', 'POST', visitBody)).duplicate, true);
  await call(accountant, '/warehouse/settings/loyalty', 'PUT', { enabled: true, mode: 'monthly', revision: 0, tiers: [{ minSyp: 100000, discountSyp: 1000 }] });
  const schedule = (await call(owner, '/warehouse/delivery', 'PUT', { enabled: true, revision: 0, zones: [{ name: 'الريف الشمالي', active: true, preparationHours: 0, exceptions: [], slots: Array.from({ length: 7 }, (_, weekday) => ({ weekday, departureTime: '23:59', arrivalHours: 4, cutoffHours: 0 })) }] })).settings;
  await call(accountant, `/warehouse/delivery/pharmacies/${pharmacy.id}`, 'PUT', { zoneId: schedule.zones[0]._id, revision: 0 });
  const catalog = await call(pharmacist, `/warehouses/${warehouse.id}/products?limit=100`);
  assert.ok(catalog.products.length); assert.equal(JSON.stringify(catalog).includes('stockQuantity'), false);
  const payload = { warehouseId: warehouse.id, rateUsed: 1000, idempotencyKey: 'launch-checkout-001', items: [{ productId: product.id, quantity: 100, displayedUnitPriceUsd: 1 }] };
  const first = (await call(pharmacist, '/orders', 'POST', payload, 201)).order;
  const replay = await call(pharmacist, '/orders', 'POST', payload, 200); assert.equal(replay.order.id, first.id);
  let order = await Order.findById(first.id);
  assert.equal(order.finalPrice, 100000); assert.equal(order.repId.toString(), rep.id); assert.ok(order.deliveryEstimate.expectedAt);
  const pendingWallet = await Credit.findOne({ pharmacyId: pharmacy.id, warehouseId: warehouse.id });
  assert.equal((pendingWallet?.balanceSyp || 0) + (pendingWallet?.loyaltyBalanceSyp || 0), 0, 'a pending order earns no credit');
  await call(outsider, `/warehouse/orders/${order.id}`, 'GET', undefined, 404);
  for (let i = 0; i < 4 && order.status !== 'delivered'; i++) {
    await call(accountant, `/warehouse/orders/${order.id}/advance-status`, 'POST', {}); order = await Order.findById(order.id);
  }
  assert.equal(order.status, 'delivered');
  const credit = await Credit.findOne({ pharmacyId: pharmacy.id, warehouseId: warehouse.id });
  assert.equal(credit.loyaltyBalanceSyp, 1000); assert.equal(credit.balanceSyp, 1000);
  const payment = { pharmacyId: pharmacy.id, amount: 100000, currency: 'SYP', method: 'cash', idempotencyKey: 'launch-payment-001' };
  await call(owner, '/warehouse/payments', 'POST', payment, 403);
  await call(accountant, '/warehouse/payments', 'POST', payment, 201);
  await call(admin, `/admin/warehouses/${warehouse.id}/subscription`, 'PUT', { revision: 0, features: { accounting: false, loyalty: false, repTracking: false, deliverySchedule: false } });
  await call(accountant, '/warehouse/payments', 'POST', payment, 200); // Lost acknowledgement survives feature expiry.
  // Core receipt and its documented reversal both remain available while
  // advanced accounting is off; they must leave the original balance intact.
  const extra = await call(accountant, '/warehouse/payments', 'POST', { ...payment, amount: 1000, idempotencyKey: 'new-core-payment' }, 201);
  await call(accountant, `/warehouse/payments/${extra.payment.id}/reverse`, 'POST', {
    reason: 'Acceptance correction', idempotencyKey: 'reverse-core-payment',
  }, 201);
  await call(repUser, '/rep/visits', 'POST', visitBody, 403);
  await call(owner, '/warehouse/reps/visits', 'GET', undefined, 403);
  const retained = (await call(pharmacist, `/orders/${order.id}`)).order;
  assert.equal(new Date(retained.deliveryEstimate.to).getTime(), new Date(order.deliveryEstimate.to).getTime());
  const line = await Item.findOne({ orderId: order.id });
  const returned = (await call(pharmacist, '/returns', 'POST', { orderId: order.id, items: JSON.stringify([{ orderItemId: line.id, quantity: line.quantity, reasonType: 'damaged' }]) }, 201)).return;
  await call(accountant, `/warehouse/returns/${returned.id}/approve`, 'POST', {});
  const statement = (await call(owner, `/warehouse/balances/${pharmacy.id}`)).statement;
  assert.equal(statement.outstandingDebtSyp, 0); assert.equal(statement.creditBalanceSyp, 100000);
  assert.equal((await Credit.findById(credit.id)).loyaltyBalanceSyp, 0, 'old monthly promise reverses after return even when the feature is off');
  const report = await call(owner, '/warehouse/insights/report?period=today&force=1');
  assert.equal(report.totals.netSalesSyp, 0); assert.equal(report.totals.collectionsSyp, 100000);
  const platform = await call(admin, '/admin/analytics?period=today&force=1'); assert.equal(platform.totals.netSalesSyp, 0);
  const account = await Account.findOne({ pharmacyId: pharmacy.id, warehouseId: warehouse.id });
  assert.equal((await require('../src/services/ledger.service').verifyAccount(account.id)).ok, true);
});
