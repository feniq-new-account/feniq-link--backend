// The pharmacy's quarter of the rep commission as credit at the warehouse,
// the warehouse's quarter kept or given to the rep, and the warehouse's own
// loyalty tiers (owner's decision, October 2026).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-rep-commission';
process.env.NODE_ENV = 'test';
process.env.DISABLE_AUTH_RATE_LIMIT = '1';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const bcrypt = require('bcrypt');

const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');

const app = require('../src/app');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const Order = require('../src/models/order.model');
const Return = require('../src/models/return.model');
const OrderItem = require('../src/models/orderItem.model');
const Rep = require('../src/models/rep.model');
const orderService = require('../src/services/order.service');
const warehouseOrderService = require('../src/services/warehouseOrder.service');
const PharmacyCredit = require('../src/models/pharmacyCredit.model');
const CreditEntry = require('../src/models/creditEntry.model');
const { loyaltyDiscountFor, parseLoyaltyTiers } = require('../src/utils/loyalty');

const PASSWORD = 'commission-pass-1';
let server;
let baseUrl;
let phoneCounter = 0;
const ctx = {};

async function call(method, path, { body, token } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(phone, password = PASSWORD) {
  const res = await call('POST', '/auth/login-password', { body: { phone, password } });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

function nextLocalPhone() {
  phoneCounter += 1;
  return `0945${String(100000 + phoneCounter).slice(-6)}`;
}

async function createWarehouse(overrides = {}) {
  const phone = nextLocalPhone();
  const user = await User.create({
    name: 'Warehouse', phone, password: await bcrypt.hash(PASSWORD, 10), role: 'warehouse', status: 'active',
  });
  const warehouse = await Warehouse.create({
    userId: user._id, nameAr: 'مستودع', nameEn: 'Warehouse', address: 'r', city: 'Latakia', phone,
    deliveryType: 'self', requireDeliverySealPhoto: false, isActive: true, ...overrides,
  });
  const product = await Product.create({
    warehouseId: warehouse._id, nameAr: 'دواء', nameEn: 'Drug', manufacturerAr: 'شركة',
    price: 2, unitAr: 'علبة', unitEn: 'box', isAvailable: true, isActive: true,
  });
  return { user, warehouse, product, token: await login(phone) };
}

async function createPharmacy(nameAr) {
  const phone = `+963${nextLocalPhone().slice(1)}`;
  const user = await User.create({
    name: nameAr, phone, password: await bcrypt.hash(PASSWORD, 10), role: 'pharmacy', status: 'active',
  });
  const pharmacy = await Pharmacy.create({
    userId: user._id, nameAr, nameEn: 'Pharmacy', ownerName: 'د. مالك', address: 'شارع', city: 'Latakia',
    areaType: 'city', phone, addedBy: 'self',
  });
  return { user, pharmacy };
}

async function createRep(warehouseToken, commissionRate) {
  const phone = nextLocalPhone();
  const res = await call('POST', '/warehouse/reps', {
    token: warehouseToken,
    body: { name: 'مندوب', phone, password: PASSWORD, ...(commissionRate === undefined ? {} : { commissionRate }) },
  });
  return { res, appPhone: `+963${phone.slice(1)}` };
}

function assign(warehouseToken, pharmacyId, repId) {
  return call('PUT', `/warehouse/reps/pharmacies/${pharmacyId}/rep`, { token: warehouseToken, body: { repId } });
}

async function placeOrder(pharmacyCtx, warehouseCtx, quantity = 3) {
  return orderService.createOrder({
    userId: pharmacyCtx.user._id,
    pharmacyId: pharmacyCtx.pharmacy._id,
    warehouseId: warehouseCtx.warehouse._id,
    items: [{ productId: warehouseCtx.product._id.toString(), quantity }],
    notes: null,
  });
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-credit-loyalty-test' });
  // 1 USD = 10,000 SYP: the test product (2 USD) costs 20,000 SYP a box.
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 10000, source: 'manual' });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  ctx.wh = await createWarehouse();
  ctx.ph = await createPharmacy('صيدلية');
  ctx.phNoRep = await createPharmacy('صيدلية بلا مندوب');
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});


async function deliver(order, wh) {
  const id = String(order._id || order.id);
  for (let step = 0; step < 4; step += 1) {
    const current = await Order.findById(id).lean();
    if (current.status === 'delivered') break;
    await warehouseOrderService.advanceOrderStatus(id, wh.warehouse._id, wh.user._id);
  }
  return Order.findById(id).lean();
}

async function balance(ph, wh) {
  const account = await PharmacyCredit.findOne({ pharmacyId: ph.pharmacy._id, warehouseId: wh.warehouse._id }).lean();
  return account?.balanceSyp ?? 0;
}

async function setup(rate = 2, { shareToRep } = {}) {
  const wh = await createWarehouse();
  const ph = await createPharmacy('صيدلية الرصيد');
  const { res, appPhone } = await createRep(wh.token, rate);
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  const repId = res.body.rep.id;
  if (shareToRep !== undefined) {
    const patched = await call('PATCH', `/warehouse/reps/${repId}`, { token: wh.token, body: { warehouseShareToRep: shareToRep } });
    assert.strictEqual(patched.status, 200, JSON.stringify(patched.body));
  }
  await assign(wh.token, ph.pharmacy._id.toString(), repId);
  return { wh, ph, repId, appPhone };
}

// --- The pharmacy's quarter: credit at the warehouse ---------------------------

test('the pharmacy earns its quarter as credit only once the order is delivered, and only once', async () => {
  const { wh, ph } = await setup(2);
  const order = await placeOrder(ph, wh, 3); // 60,000 at 2% -> 300 to the pharmacy
  assert.strictEqual(await balance(ph, wh), 0, 'nothing before delivery');

  const delivered = await deliver(order, wh);
  assert.ok(delivered.repCommission.pharmacyCreditedAt, 'marked as credited');
  assert.strictEqual(await balance(ph, wh), 300);
  assert.strictEqual(await CreditEntry.countDocuments({ orderId: delivered._id, kind: 'earned' }), 1);

  // Crediting the same delivery again does nothing.
  const pharmacyCredit = require('../src/services/pharmacyCredit.service');
  assert.strictEqual(await pharmacyCredit.earnForDelivery(await Order.findById(delivered._id), null), 0);
  assert.strictEqual(await balance(ph, wh), 300);
});

test('the credit comes off the next order automatically, and commission is taken on what is left', async () => {
  const { wh, ph } = await setup(2);
  await deliver(await placeOrder(ph, wh, 3), wh); // +300 credit

  const next = await placeOrder(ph, wh, 1); // 20,000
  const stored = await Order.findById(next._id || next.id).lean();
  assert.strictEqual(stored.creditUsedSyp, 300);
  assert.strictEqual(stored.finalPrice, 19700, 'the pharmacy pays 300 less');
  // Every share is a quarter of 2% of 19,700 = 98.5 -> 99 (rounded per share).
  assert.strictEqual(stored.commissionAmount, Math.round((19700 * 0.5) / 100));
  assert.strictEqual(await balance(ph, wh), 0, 'the credit is spent');
  assert.strictEqual(await CreditEntry.countDocuments({ orderId: stored._id, kind: 'used', amountSyp: 300 }), 1);
});

test('credit is held at its own warehouse only', async () => {
  const { wh, ph } = await setup(2);
  await deliver(await placeOrder(ph, wh, 3), wh); // +300 at wh
  const other = await createWarehouse();
  const elsewhere = await placeOrder(ph, other, 1);
  assert.strictEqual((await Order.findById(elsewhere._id || elsewhere.id).lean()).creditUsedSyp, 0);
  assert.strictEqual(await balance(ph, wh), 300);
});

test('a cancelled order hands its credit back, once', async () => {
  const { wh, ph } = await setup(2);
  await deliver(await placeOrder(ph, wh, 3), wh); // +300
  const next = await placeOrder(ph, wh, 1);
  assert.strictEqual(await balance(ph, wh), 0);

  await orderService.cancelOrder(String(next._id || next.id), ph.pharmacy._id, ph.user._id);
  assert.strictEqual(await balance(ph, wh), 300);
  const cancelled = await Order.findById(next._id || next.id).lean();
  assert.ok(cancelled.creditReleasedAt);
  assert.strictEqual(await CreditEntry.countDocuments({ orderId: cancelled._id, kind: 'released' }), 1);
});

test('an edit that makes the order smaller than its credit hands the difference back', async () => {
  const { wh, ph } = await setup(0);
  await PharmacyCredit.updateOne(
    { pharmacyId: ph.pharmacy._id, warehouseId: wh.warehouse._id },
    { $set: { balanceSyp: 30000 } },
    { upsert: true }
  );
  const order = await placeOrder(ph, wh, 2); // 40,000 takes all 30,000
  const orderId = String(order._id || order.id);
  assert.strictEqual((await Order.findById(orderId).lean()).creditUsedSyp, 30000);
  assert.strictEqual(await balance(ph, wh), 0);

  const item = await OrderItem.findOne({ orderId }).lean();
  // Down to one box (20,000): it can hold only 20,000 of credit, 10,000 goes back.
  await warehouseOrderService.updateOrderItems(orderId, wh.warehouse._id, wh.user._id, {
    updateItems: [{ orderItemId: String(item._id), quantity: 1 }],
  });
  const smaller = await Order.findById(orderId).lean();
  assert.strictEqual(smaller.creditUsedSyp, 20000);
  assert.strictEqual(smaller.finalPrice, 0);
  assert.strictEqual(await balance(ph, wh), 10000);

  // Back up to three boxes: it never draws more than it already took.
  await warehouseOrderService.updateOrderItems(orderId, wh.warehouse._id, wh.user._id, {
    updateItems: [{ orderItemId: String(item._id), quantity: 3 }],
  });
  const grown = await Order.findById(orderId).lean();
  assert.strictEqual(grown.creditUsedSyp, 20000);
  assert.strictEqual(grown.finalPrice, 40000);
  assert.strictEqual(await balance(ph, wh), 10000);
});

test('the cart quote shows the credit and the part this order takes', async () => {
  const { wh, ph } = await setup(2);
  await deliver(await placeOrder(ph, wh, 3), wh); // +300
  const quote = await orderService.quoteOrder({
    pharmacyId: ph.pharmacy._id,
    warehouseId: wh.warehouse._id,
    items: [{ productId: wh.product._id.toString(), quantity: 1 }],
  });
  assert.strictEqual(quote.creditBalanceSyp, 300);
  assert.strictEqual(quote.creditUsedSyp, 300);
  assert.strictEqual(quote.finalSyp, 19700);
});

// --- The warehouse's quarter: kept, or given to the rep -------------------------

test('a warehouse that gives its quarter to the rep: the rep takes half, the warehouse keeps nothing', async () => {
  const { wh, ph, appPhone } = await setup(2, { shareToRep: true });
  const order = await placeOrder(ph, wh, 3); // 60,000 at 2% = 1,200
  const stored = await Order.findById(order._id || order.id).lean();
  assert.strictEqual(stored.repCommission.repAmount, 600);
  assert.strictEqual(stored.repCommission.feniqAmount, 300);
  assert.strictEqual(stored.repCommission.pharmacyAmount, 300);
  assert.strictEqual(stored.repCommission.savingAmount, 0);
  assert.strictEqual(stored.repCommission.warehouseShareToRep, true);

  const me = await call('GET', '/rep/me', { token: await login(appPhone) });
  assert.strictEqual(me.body.stats.ownCommissionRate, 1, 'half of 2%');
});

test('the choice is the warehouse\'s, per rep, and must be true or false', async () => {
  const wh = await createWarehouse();
  const { res } = await createRep(wh.token, 2);
  assert.strictEqual(res.body.rep.warehouseShareToRep, false, 'kept by the warehouse unless it says otherwise');
  const bad = await call('PATCH', `/warehouse/reps/${res.body.rep.id}`, { token: wh.token, body: { warehouseShareToRep: 'yes' } });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.body.code, 'INVALID_SHARE_TO_REP');
  const ok = await call('PATCH', `/warehouse/reps/${res.body.rep.id}`, { token: wh.token, body: { warehouseShareToRep: true } });
  assert.strictEqual(ok.body.rep.warehouseShareToRep, true);
  assert.strictEqual((await Rep.findById(res.body.rep.id).lean()).warehouseShareToRep, true);
});

// --- Loyalty: the warehouse's own tiers -----------------------------------------

test('the loyalty tier is the highest one the order reaches, never more than the order', () => {
  const tiers = [{ minSyp: 100000, discountSyp: 2000 }, { minSyp: 200000, discountSyp: 5000 }];
  assert.deepStrictEqual(loyaltyDiscountFor(99999, tiers), { discountSyp: 0, tier: null });
  assert.strictEqual(loyaltyDiscountFor(100000, tiers).discountSyp, 2000);
  assert.strictEqual(loyaltyDiscountFor(199999, tiers).discountSyp, 2000);
  assert.strictEqual(loyaltyDiscountFor(250000, tiers).discountSyp, 5000);
  assert.strictEqual(loyaltyDiscountFor(250000, []).discountSyp, 0);
});

test('tiers are read from a request only as whole liras with a discount below its minimum', () => {
  assert.deepStrictEqual(
    parseLoyaltyTiers([{ minSyp: 200000, discountSyp: 5000 }, { minSyp: 100000, discountSyp: 2000 }]),
    [{ minSyp: 100000, discountSyp: 2000 }, { minSyp: 200000, discountSyp: 5000 }],
    'sorted by minimum'
  );
  for (const bad of [
    [{ minSyp: 0, discountSyp: 1 }],
    [{ minSyp: 1000, discountSyp: 1000 }],
    [{ minSyp: 1000.5, discountSyp: 10 }],
    [{ minSyp: 1000, discountSyp: 10 }, { minSyp: 1000, discountSyp: 20 }],
    'nope',
    new Array(11).fill({ minSyp: 1000, discountSyp: 10 }).map((t, i) => ({ minSyp: t.minSyp + i, discountSyp: 10 })),
  ]) {
    assert.strictEqual(parseLoyaltyTiers(bad), null, JSON.stringify(bad).slice(0, 80));
  }
});

test('a warehouse switches loyalty on with its tiers, and orders get the discount; Feniq takes its share of what is left', async () => {
  const { wh, ph } = await setup(2);
  const refused = await call('PUT', '/warehouse/settings/loyalty', { token: wh.token, body: { enabled: true } });
  assert.strictEqual(refused.status, 400);
  assert.strictEqual(refused.body.code, 'LOYALTY_TIERS_REQUIRED');

  const saved = await call('PUT', '/warehouse/settings/loyalty', {
    token: wh.token,
    body: { enabled: true, tiers: [{ minSyp: 100000, discountSyp: 2000 }, { minSyp: 200000, discountSyp: 5000 }] },
  });
  assert.strictEqual(saved.status, 200, JSON.stringify(saved.body));
  assert.deepStrictEqual(saved.body.settings.loyalty, {
    enabled: true,
    tiers: [{ minSyp: 100000, discountSyp: 2000 }, { minSyp: 200000, discountSyp: 5000 }],
  });

  const small = await placeOrder(ph, wh, 3); // 60,000: below every tier
  assert.strictEqual((await Order.findById(small._id || small.id).lean()).loyaltyDiscountAmount, 0);

  const big = await placeOrder(ph, wh, 6); // 120,000: the 100,000 tier
  const stored = await Order.findById(big._id || big.id).lean();
  assert.strictEqual(stored.loyaltyDiscountAmount, 2000);
  assert.strictEqual(stored.finalPrice, 118000);
  assert.strictEqual(stored.commissionAmount, Math.round((118000 * 0.5) / 100), 'Feniq: a quarter of 2% of what is left');
  assert.deepStrictEqual(stored.loyaltyTiers.map((t) => t.minSyp), [100000, 200000], 'the tiers are frozen on the order');

  const bigger = await placeOrder(ph, wh, 11); // 220,000: the 200,000 tier
  assert.strictEqual((await Order.findById(bigger._id || bigger.id).lean()).loyaltyDiscountAmount, 5000);
});

test('loyalty is off by default and switching it off stops the discount', async () => {
  const wh = await createWarehouse();
  const ph = await createPharmacy('صيدلية بلا ولاء');
  const plain = await placeOrder(ph, wh, 6);
  assert.strictEqual((await Order.findById(plain._id || plain.id).lean()).loyaltyDiscountAmount, 0);

  await call('PUT', '/warehouse/settings/loyalty', {
    token: wh.token, body: { enabled: true, tiers: [{ minSyp: 100000, discountSyp: 2000 }] },
  });
  await call('PUT', '/warehouse/settings/loyalty', { token: wh.token, body: { enabled: false } });
  const after = await placeOrder(ph, wh, 6);
  assert.strictEqual((await Order.findById(after._id || after.id).lean()).loyaltyDiscountAmount, 0);
});

test('an edit re-derives the loyalty discount from the tiers frozen on the order', async () => {
  const { wh, ph } = await setup(0);
  await call('PUT', '/warehouse/settings/loyalty', {
    token: wh.token, body: { enabled: true, tiers: [{ minSyp: 100000, discountSyp: 2000 }] },
  });
  const order = await placeOrder(ph, wh, 6); // 120,000 -> 2,000 off
  const orderId = String(order._id || order.id);
  // The warehouse then changes its tiers; the order keeps its own.
  await call('PUT', '/warehouse/settings/loyalty', {
    token: wh.token, body: { tiers: [{ minSyp: 100000, discountSyp: 9000 }] },
  });
  const item = await OrderItem.findOne({ orderId }).lean();
  await warehouseOrderService.updateOrderItems(orderId, wh.warehouse._id, wh.user._id, {
    updateItems: [{ orderItemId: String(item._id), quantity: 7 }],
  });
  assert.strictEqual((await Order.findById(orderId).lean()).loyaltyDiscountAmount, 2000);
  await warehouseOrderService.updateOrderItems(orderId, wh.warehouse._id, wh.user._id, {
    updateItems: [{ orderItemId: String(item._id), quantity: 2 }],
  });
  assert.strictEqual((await Order.findById(orderId).lean()).loyaltyDiscountAmount, 0, '40,000 is below the tier');
});

test('the pharmacy sees the loyalty discount and its credit on the order, and in its savings', async () => {
  const { wh, ph } = await setup(2);
  await call('PUT', '/warehouse/settings/loyalty', {
    token: wh.token, body: { enabled: true, tiers: [{ minSyp: 100000, discountSyp: 2000 }] },
  });
  await deliver(await placeOrder(ph, wh, 3), wh); // +300 credit
  const order = await placeOrder(ph, wh, 6); // 120,000 - 2,000 - 300
  const token = await login(ph.user.phone);
  const view = await call('GET', `/orders/${order._id || order.id}`, { token });
  assert.strictEqual(view.status, 200, JSON.stringify(view.body));
  assert.strictEqual(view.body.order.loyaltyDiscountAmount, 2000);
  assert.strictEqual(view.body.order.creditUsedSyp, 300);
  assert.strictEqual(view.body.order.finalPrice, 117700);

  const savings = await orderService.getSavingsSummaryForPharmacy(ph.pharmacy._id);
  assert.strictEqual(savings.loyaltySyp, 2000);
  assert.strictEqual(savings.creditSyp, 300);
});
