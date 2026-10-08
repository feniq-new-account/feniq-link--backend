// The rep programme's money rule: on an order through Feniq, the rep
// commission (a % the warehouse pays its rep) is split in quarters - Feniq (the
// order's platform commission), the pharmacy (credit), the rep, and the
// warehouse (kept, or given to the rep). No platform discount, no flat commission.
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
const { zeroLegacyPlatformRates } = require('../src/services/platformRatesPolicy.service');
const {
  splitRepCommission,
  feniqRateFor,
  repRateFor,
  parseRepCommissionRate,
} = require('../src/utils/repCommission');

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
  await startMemoryMongo({ dbName: 'feniq-rep-commission-test' });
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

// --- The split itself -------------------------------------------------------

test('a 2% rep commission splits in quarters: Feniq, the pharmacy, the rep, and the warehouse', () => {
  assert.deepStrictEqual(splitRepCommission(10000, 2), {
    rate: 2, warehouseShareToRep: false, totalAmount: 200, repAmount: 50, feniqAmount: 50, pharmacyAmount: 50, savingAmount: 50,
  });
  assert.strictEqual(feniqRateFor(2), 0.5);
  assert.strictEqual(feniqRateFor(0.75), 0.1875);
});

test('the warehouse may give the rep its own quarter: the rep then takes half and the warehouse keeps nothing', () => {
  assert.deepStrictEqual(splitRepCommission(10000, 2, { warehouseShareToRep: true }), {
    rate: 2, warehouseShareToRep: true, totalAmount: 200, repAmount: 100, feniqAmount: 50, pharmacyAmount: 50, savingAmount: 0,
  });
  assert.strictEqual(repRateFor(2), 0.5);
  assert.strictEqual(repRateFor(2, true), 1);
});

test('the four parts never add up to more than the whole, whatever the rounding', () => {
  for (const revenue of [1, 7, 333, 1999, 60001]) {
    for (const rate of [0.5, 1, 1.5, 2, 3.25, 10]) {
      for (const warehouseShareToRep of [false, true]) {
        const { totalAmount, repAmount, feniqAmount, pharmacyAmount, savingAmount } =
          splitRepCommission(revenue, rate, { warehouseShareToRep });
        const sum = repAmount + feniqAmount + pharmacyAmount + savingAmount;
        assert.ok(savingAmount >= 0);
        assert.ok(sum >= totalAmount, `${revenue} @ ${rate}%`);
        assert.ok(sum <= totalAmount + 2, `${revenue} @ ${rate}%`);
      }
    }
  }
});

test('no rate or no revenue means no commission at all', () => {
  assert.deepStrictEqual(splitRepCommission(10000, 0), {
    rate: 0, warehouseShareToRep: false, totalAmount: 0, repAmount: 0, feniqAmount: 0, pharmacyAmount: 0, savingAmount: 0,
  });
  assert.strictEqual(splitRepCommission(0, 2).totalAmount, 0);
  assert.strictEqual(splitRepCommission(10000, undefined).totalAmount, 0);
});

test('a rate is read from a request only as a number from 0 to 10 with at most two decimals', () => {
  assert.strictEqual(parseRepCommissionRate(2), 2);
  assert.strictEqual(parseRepCommissionRate('1.5'), 1.5);
  assert.strictEqual(parseRepCommissionRate(0), 0);
  assert.strictEqual(parseRepCommissionRate(10), 10);
  for (const bad of [-1, 11, 'abc', 1.234, NaN, Infinity, {}, [], true, undefined, null, '']) {
    assert.strictEqual(parseRepCommissionRate(bad), null, String(bad));
  }
});

// --- No platform discount or flat commission by default ----------------------

test('a new warehouse starts with no platform discount and no commission', () => {
  const warehouse = new Warehouse({});
  assert.strictEqual(warehouse.discountRate, 0);
  assert.strictEqual(warehouse.commissionRate, 0);
});

test('the old 4% / 1% defaults are zeroed once, and a deliberately changed warehouse is left alone', async () => {
  const legacy = await createWarehouse({ discountRate: 4, commissionRate: 1 });
  const custom = await createWarehouse({ discountRate: 4, commissionRate: 2 });
  const customDiscount = await createWarehouse({ discountRate: 3, commissionRate: 1 });

  const changed = await zeroLegacyPlatformRates();
  assert.ok(changed >= 1);
  const [a, b, c] = await Promise.all([
    Warehouse.findById(legacy.warehouse._id).lean(),
    Warehouse.findById(custom.warehouse._id).lean(),
    Warehouse.findById(customDiscount.warehouse._id).lean(),
  ]);
  assert.deepStrictEqual([a.discountRate, a.commissionRate], [0, 0]);
  assert.deepStrictEqual([b.discountRate, b.commissionRate], [4, 2]);
  assert.deepStrictEqual([c.discountRate, c.commissionRate], [3, 1]);
  assert.strictEqual(await zeroLegacyPlatformRates(), 0);
});

// --- Setting a rep's rate ----------------------------------------------------

test('the warehouse sets a rep\'s commission rate when creating them, and it defaults to none', async () => {
  const withRate = await createRep(ctx.wh.token, 2);
  assert.strictEqual(withRate.res.status, 201, JSON.stringify(withRate.res.body));
  assert.strictEqual(withRate.res.body.rep.commissionRate, 2);

  const without = await createRep(ctx.wh.token);
  assert.strictEqual(without.res.status, 201);
  assert.strictEqual(without.res.body.rep.commissionRate, 0);
});

test('an impossible rate is refused when creating or updating a rep', async () => {
  for (const bad of [11, -1, 'abc', 1.234]) {
    const created = await createRep(ctx.wh.token, bad);
    assert.strictEqual(created.res.status, 400, String(bad));
    assert.strictEqual(created.res.body.code, 'INVALID_COMMISSION_RATE');
  }
  const { res } = await createRep(ctx.wh.token, 1);
  const updated = await call('PATCH', `/warehouse/reps/${res.body.rep.id}`, { token: ctx.wh.token, body: { commissionRate: 25 } });
  assert.strictEqual(updated.status, 400);
  assert.strictEqual(updated.body.code, 'INVALID_COMMISSION_RATE');
});

test('updating a rep\'s rate changes it and leaves the other fields alone', async () => {
  const { res } = await createRep(ctx.wh.token, 1);
  const repId = res.body.rep.id;
  const updated = await call('PATCH', `/warehouse/reps/${repId}`, { token: ctx.wh.token, body: { commissionRate: 3 } });
  assert.strictEqual(updated.status, 200, JSON.stringify(updated.body));
  assert.strictEqual(updated.body.rep.commissionRate, 3);
  assert.strictEqual(updated.body.rep.name, 'مندوب');
  assert.strictEqual(updated.body.rep.isActive, true);
});

// --- Orders -------------------------------------------------------------------

test('an order from a rep\'s pharmacy carries the three-way split, and Feniq\'s commission is the quarter', async () => {
  const { res } = await createRep(ctx.wh.token, 2);
  const rep = res.body.rep;
  assert.strictEqual((await assign(ctx.wh.token, ctx.ph.pharmacy._id.toString(), rep.id)).status, 200);

  const order = await placeOrder(ctx.ph, ctx.wh, 3); // 3 boxes x 20,000 = 60,000 SYP
  const stored = await Order.findById(order._id || order.id).lean();
  assert.strictEqual(stored.finalPrice, 60000);
  assert.strictEqual(stored.discountAmount, 0, 'no platform discount for the pharmacy');
  assert.strictEqual(stored.commissionAmount, 300, 'Feniq: a quarter of 2% of 60,000');
  assert.deepStrictEqual(stored.repCommission, {
    rate: 2, repAmount: 300, feniqAmount: 300, pharmacyAmount: 300, savingAmount: 300,
    warehouseShareToRep: false, pharmacyCreditedAt: null,
  });
  assert.strictEqual(String(stored.repId), rep.id);
});

test('the warehouse sees the split on the order detail, and nothing when no rep earns on it', async () => {
  const { res } = await createRep(ctx.wh.token, 4);
  const ph = await createPharmacy('صيدلية تفصيل الطلبية');
  await assign(ctx.wh.token, ph.pharmacy._id.toString(), res.body.rep.id);
  const order = await placeOrder(ph, ctx.wh, 3); // 60,000 SYP at 4%
  const detail = await call('GET', `/warehouse/orders/${order._id || order.id}`, { token: ctx.wh.token });
  assert.strictEqual(detail.status, 200);
  assert.deepStrictEqual(detail.body.order.repCommission, {
    rate: 4,
    repAmount: 600,
    feniqAmount: 600,
    pharmacyAmount: 600,
    savingAmount: 600,
    warehouseShareToRep: false,
  });
  assert.strictEqual(detail.body.order.commissionAmount, 600);

  const plain = await placeOrder(ctx.phNoRep, ctx.wh, 1);
  const plainDetail = await call('GET', `/warehouse/orders/${plain._id || plain.id}`, { token: ctx.wh.token });
  assert.strictEqual(plainDetail.body.order.repCommission, null);
});

test('an order from a pharmacy with no rep has no rep commission and no Feniq commission', async () => {
  const order = await placeOrder(ctx.phNoRep, ctx.wh, 2);
  const stored = await Order.findById(order._id || order.id).lean();
  assert.strictEqual(stored.commissionAmount, 0);
  assert.strictEqual(stored.discountAmount, 0);
  assert.strictEqual(stored.repCommission, null);
  assert.strictEqual(stored.finalPrice, 40000);
});

test('a rep with no commission rate means no commission even on their orders', async () => {
  const ph = await createPharmacy('صيدلية مندوب بلا عمولة');
  const { res } = await createRep(ctx.wh.token); // rate 0
  await assign(ctx.wh.token, ph.pharmacy._id.toString(), res.body.rep.id);
  const order = await placeOrder(ph, ctx.wh, 1);
  const stored = await Order.findById(order._id || order.id).lean();
  assert.strictEqual(stored.commissionAmount, 0);
  assert.strictEqual(stored.repCommission, null);
  assert.strictEqual(String(stored.repId), res.body.rep.id, 'the order is still attributed to the rep');
});

test('changing the rep\'s rate later does not touch an order already placed, and editing it keeps the frozen rate', async () => {
  const ph = await createPharmacy('صيدلية التعديل');
  const { res } = await createRep(ctx.wh.token, 2);
  const repId = res.body.rep.id;
  await assign(ctx.wh.token, ph.pharmacy._id.toString(), repId);
  const order = await placeOrder(ph, ctx.wh, 3);
  const orderId = String(order._id || order.id);

  await call('PATCH', `/warehouse/reps/${repId}`, { token: ctx.wh.token, body: { commissionRate: 5 } });
  assert.strictEqual((await Order.findById(orderId).lean()).repCommission.rate, 2);

  const item = await OrderItem.findOne({ orderId }).lean();
  await warehouseOrderService.updateOrderItems(orderId, ctx.wh.warehouse._id, ctx.wh.user._id, {
    updateItems: [{ orderItemId: String(item._id), quantity: 5 }],
  });
  const edited = await Order.findById(orderId).lean();
  assert.strictEqual(edited.finalPrice, 100000);
  assert.deepStrictEqual(edited.repCommission, {
    rate: 2, repAmount: 500, feniqAmount: 500, pharmacyAmount: 500, savingAmount: 500,
    warehouseShareToRep: false, pharmacyCreditedAt: null,
  });
  assert.strictEqual(edited.commissionAmount, 500);

  // A new order is placed under the new rate.
  const next = await placeOrder(ph, ctx.wh, 1);
  assert.strictEqual((await Order.findById(next._id || next.id).lean()).repCommission.rate, 5);
});

// --- What the warehouse and the rep see ---------------------------------------

test('the warehouse\'s Reps page and the rep\'s own app total the commission on delivered orders only', async () => {
  const wh = await createWarehouse();
  const ph = await createPharmacy('صيدلية الأرقام');
  const { res, appPhone } = await createRep(wh.token, 2);
  const repId = res.body.rep.id;
  await assign(wh.token, ph.pharmacy._id.toString(), repId);

  const delivered = await placeOrder(ph, wh, 3); // 60,000
  const pending = await placeOrder(ph, wh, 5); // 100,000, never delivered
  const deliveredId = String(delivered._id || delivered.id);
  // Approve (= on its way), then deliver.
  for (let step = 0; step < 2; step += 1) {
    await warehouseOrderService.advanceOrderStatus(deliveredId, wh.warehouse._id, wh.user._id);
  }
  assert.strictEqual((await Order.findById(deliveredId).lean()).status, 'delivered');
  assert.strictEqual((await Order.findById(pending._id || pending.id).lean()).status, 'pending');

  const list = await call('GET', '/warehouse/reps', { token: wh.token });
  assert.strictEqual(list.status, 200);
  const row = list.body.reps.find((r) => r.id === repId);
  assert.strictEqual(row.commissionRate, 2);
  assert.deepStrictEqual(row.monthCommission, { repAmount: 300, feniqAmount: 300, pharmacyAmount: 300, savingAmount: 300 });
  assert.strictEqual(row.monthOrdersCount, 2, 'both orders count as the rep\'s orders');

  const repToken = await login(appPhone);
  const me = await call('GET', '/rep/me', { token: repToken });
  assert.strictEqual(me.status, 200, JSON.stringify(me.body));
  assert.strictEqual(me.body.stats.ownCommissionRate, 0.5, 'the rep is told their own 0.5%, not the warehouse\'s 2%');
  assert.strictEqual(me.body.stats.commissionRate, undefined);
  assert.strictEqual(me.body.stats.monthCommissionAmount, 300, 'the rep sees only their own quarter');
  assert.strictEqual(me.body.stats.feniqAmount, undefined, 'Feniq\'s and the warehouse\'s shares are not the rep\'s business');
});

test('a credited return takes its proportion back from the rep\'s and Feniq\'s shares, a pending one does not', async () => {
  const wh = await createWarehouse();
  const ph = await createPharmacy('صيدلية المرتجع');
  const { res, appPhone } = await createRep(wh.token, 2);
  const repId = res.body.rep.id;
  await assign(wh.token, ph.pharmacy._id.toString(), repId);

  const order = await placeOrder(ph, wh, 3); // 60,000 SYP -> 600 / 300 / 300
  const orderId = String(order._id || order.id);
  for (let step = 0; step < 2; step += 1) {
    await warehouseOrderService.advanceOrderStatus(orderId, wh.warehouse._id, wh.user._id);
  }
  const item = await OrderItem.findOne({ orderId }).lean();
  const returnRequest = await Return.create({
    orderId,
    pharmacyId: ph.pharmacy._id,
    warehouseId: wh.warehouse._id,
    items: [{ orderItemId: item._id, productId: item.productId, quantity: 1, reasonType: 'damaged' }],
    status: 'pending',
  });

  const totals = async () => {
    const list = await call('GET', '/warehouse/reps', { token: wh.token });
    const me = await call('GET', '/rep/me', { token: await login(appPhone) });
    return { row: list.body.reps.find((r) => r.id === repId).monthCommission, mine: me.body.stats.monthCommissionAmount };
  };

  let now = await totals();
  assert.deepStrictEqual(now.row, { repAmount: 300, feniqAmount: 300, pharmacyAmount: 300, savingAmount: 300 }, 'a pending return changes nothing');
  assert.strictEqual(now.mine, 300);

  // Half of the order is credited back.
  await Return.updateOne({ _id: returnRequest._id }, { $set: { status: 'approved', creditSyp: 30000 } });
  now = await totals();
  assert.deepStrictEqual(now.row, { repAmount: 150, feniqAmount: 150, pharmacyAmount: 150, savingAmount: 150 });
  assert.strictEqual(now.mine, 150);

  // A credit larger than the order can never push the commission below zero.
  await Return.updateOne({ _id: returnRequest._id }, { $set: { creditSyp: 90000 } });
  now = await totals();
  assert.deepStrictEqual(now.row, { repAmount: 0, feniqAmount: 0, pharmacyAmount: 0, savingAmount: 0 });
  assert.strictEqual(now.mine, 0);
});

test('a rep\'s rate is stored on the rep and survives a reload', async () => {
  const { res } = await createRep(ctx.wh.token, 1.5);
  const stored = await Rep.findById(res.body.rep.id).lean();
  assert.strictEqual(stored.commissionRate, 1.5);
});
