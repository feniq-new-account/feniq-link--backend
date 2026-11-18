// The whole order cycle before the Dec 1 opening, over real HTTP routes and a
// temporary replica set: order -> confirm -> out for delivery -> delivered,
// then what the manager or accountant does with the money, the way the phone
// does it (advance with expected/target status, then POST /warehouse/payments).
//
// Owner decisions 2026-11-18 this pins:
// - every warehouse starts cash only; the admin switches credit on per warehouse;
// - "the rep collected it" delivers without recording a payment, so the amount
//   stays a debt on the pharmacy until someone records it;
// - manager and accountant both record payments, and today's receipts shows who.
// No production data, credentials, external messages or payment providers.
//
// The tests run in order and build on each other (node:test runs a file's
// tests one after another): the receipts test counts the payments of the
// three before it, so run the file whole, not one test alone.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
process.env.JWT_SECRET ||= 'feniq-order-cycle-tests-at-least-32-characters';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Product = require('../src/models/product.model');
const Order = require('../src/models/order.model');
const Payment = require('../src/models/payment.model');
const Credit = require('../src/models/pharmacyCredit.model');
const Account = require('../src/models/ledgerAccount.model');
const Entry = require('../src/models/ledgerEntry.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const { businessDateOf } = require('../src/utils/businessTime');

let server, base, admin, owner, accountant, pharmacist, warehouse, pharmacy, product;
let orderSeq = 0;
// The Damascus business day the run started on: receipts are read for it.
let runDay;

const token = (u) => jwt.sign({ sub: String(u._id || u.id), role: u.role, tokenVersion: 0 }, process.env.JWT_SECRET);
async function call(user, path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${token(user)}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

// 100 boxes at 1 USD and 1000 SYP/USD: 100,000 SYP, out for delivery.
async function orderOnTheRoad() {
  orderSeq += 1;
  const created = (await call(pharmacist, '/orders', 'POST', {
    warehouseId: warehouse.id, rateUsed: 1000, idempotencyKey: `cycle-order-${orderSeq}`,
    items: [{ productId: product.id, quantity: 100, displayedUnitPriceUsd: 1 }],
  }, 201)).order;
  let order = await Order.findById(created.id);
  for (let i = 0; i < 3 && order.status !== 'out_for_delivery'; i++) {
    await call(owner, `/warehouse/orders/${order.id}/advance-status`, 'POST', {});
    order = await Order.findById(order.id);
  }
  assert.equal(order.status, 'out_for_delivery');
  assert.equal(order.finalPrice, 100000);
  return order;
}

// What the phone sends when "delivered" is tapped.
const deliver = (user, order) => call(user, `/warehouse/orders/${order.id}/advance-status`, 'POST',
  { expectedStatus: 'out_for_delivery', targetStatus: 'delivered' });
const pay = (user, amount, key, expected = 201) => call(user, '/warehouse/payments', 'POST',
  { pharmacyId: pharmacy.id, amount, currency: 'SYP', method: 'cash', idempotencyKey: key }, expected);
const debt = async () => (await call(accountant, `/warehouse/balances/${pharmacy.id}`)).statement.outstandingDebtSyp;
const allowsCredit = async (user) => (await call(user, '/warehouse/settings')).settings.allowsCredit;

test.before(async () => {
  runDay = businessDateOf(new Date());
  await startMemoryMongo({ dbName: 'feniq-order-cycle' });
  await Promise.all([Account.init(), Entry.init(), Order.init(), Payment.init(), Credit.init()]);
  const person = (name, role, phone, warehouseRole) => User.create({ name, role, phone, warehouseRole, status: 'active' });
  admin = await person('Admin', 'admin', '+963944200001');
  owner = await person('Manager', 'warehouse', '+963944200002', 'owner');
  pharmacist = await person('Pharmacist', 'pharmacy', '+963944200003');
  warehouse = await Warehouse.create({ userId: owner.id, nameAr: 'مستودع الدورة', nameEn: 'Cycle', city: 'Latakia', address: 'Street', phone: owner.phone });
  pharmacy = await Pharmacy.create({ userId: pharmacist.id, nameAr: 'صيدلية الدورة', nameEn: 'Cycle pharmacy', ownerName: 'Owner', city: 'Latakia', areaType: 'city', address: 'Centre', phone: pharmacist.phone, addedBy: 'self' });
  product = await Product.create({ warehouseId: warehouse.id, nameAr: 'دواء تجريبي', manufacturerAr: 'شركة', price: 1, unitAr: 'علبة', isActive: true, isAvailable: true });
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 1000, source: 'manual' });
  server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  const member = (await call(admin, `/admin/warehouses/${warehouse.id}/members`, 'POST',
    { name: 'Accountant', phone: '0944200005', password: 'Cycle-Test-2026', warehouseRole: 'accountant' }, 201)).member;
  accountant = await User.findById(member.id);
});
test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

test('cash only by default: delivered and paid in full by the manager, a lost acknowledgement is replayed safely', async () => {
  assert.equal(await allowsCredit(owner), false);
  assert.equal(await allowsCredit(accountant), false);
  const order = await orderOnTheRoad();

  await deliver(owner, order);
  assert.equal(await debt(), 100000, 'a delivered order is owed until it is paid');
  await pay(owner, 100000, 'cycle-cash-full');
  // The phone lost the answer and retries the same pair: no second delivery,
  // no second payment.
  assert.equal((await deliver(owner, order)).order.status, 'delivered');
  await pay(owner, 100000, 'cycle-cash-full', 200);
  assert.equal(await Payment.countDocuments({ warehouseId: warehouse.id }), 1);
  assert.equal(await debt(), 0);
});

test('"the rep collected it" delivers without a payment: the amount stays a debt until it is recorded', async () => {
  const order = await orderOnTheRoad();
  await deliver(owner, order);
  assert.equal(await Payment.countDocuments({ warehouseId: warehouse.id }), 1, 'nothing recorded for the rep');
  assert.equal(await debt(), 100000);
  // The money reaches the accountant later; recording it clears the debt.
  await pay(accountant, 100000, 'cycle-rep-handover');
  assert.equal(await debt(), 0);
});

test('credit switched on by the admin: part now, the rest later, and a reversed mistake leaves the balance intact', async () => {
  await call(admin, `/admin/warehouses/${warehouse.id}/credit`, 'PUT', { allowsCredit: true });
  assert.equal(await allowsCredit(owner), true);
  assert.equal(await allowsCredit(accountant), true);
  const order = await orderOnTheRoad();

  await deliver(accountant, order);
  await pay(accountant, 40000, 'cycle-credit-part');
  assert.equal(await debt(), 60000);
  const mistake = (await pay(accountant, 5000, 'cycle-credit-mistake')).payment;
  assert.equal(await debt(), 55000);
  await call(accountant, `/warehouse/payments/${mistake.id}/reverse`, 'POST',
    { reason: 'Entered twice', idempotencyKey: 'cycle-credit-mistake-reverse' }, 201);
  assert.equal(await debt(), 60000, 'the reversal puts the debt back');
  // Credit switched off again with a debt open: the debt stays as it is.
  await call(admin, `/admin/warehouses/${warehouse.id}/credit`, 'PUT', { allowsCredit: false });
  assert.equal(await allowsCredit(accountant), false);
  assert.equal(await debt(), 60000, 'switching credit off never touches an open debt');
  await pay(owner, 60000, 'cycle-credit-rest');
  assert.equal(await debt(), 0);
});

test("today's receipts match the day: received, reversed, by method and by who took it", async (t) => {
  // A run that crossed midnight in Damascus split its payments over two days.
  if (businessDateOf(new Date()) !== runDay) return t.skip('the run crossed midnight in Damascus');
  const day = (await call(accountant, `/warehouse/payments/receipts?date=${runDay}`)).receipts;
  assert.equal(day.date, runDay);
  // 100,000 + 100,000 + 40,000 + 5,000 + 60,000 received; the 5,000 reversed.
  assert.equal(day.receivedSyp, 305000);
  assert.equal(day.receivedCount, 5);
  assert.equal(day.reversedSyp, 5000);
  assert.equal(day.reversedCount, 1);
  assert.equal(day.netSyp, 300000);
  assert.deepEqual(day.byMethod, { cash: 305000 });
  const who = Object.fromEntries(day.byRecorder.map((r) => [r.role, r.amountSyp]));
  assert.deepEqual(who, { owner: 160000, accountant: 145000 });
  // The manager sees the same day.
  assert.equal((await call(owner, `/warehouse/payments/receipts?date=${runDay}`)).receipts.netSyp, 300000);

  const account = await Account.findOne({ pharmacyId: pharmacy.id, warehouseId: warehouse.id });
  assert.equal((await require('../src/services/ledger.service').verifyAccount(account.id)).ok, true);
});
