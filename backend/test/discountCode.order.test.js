// Discount codes, the order side: the cart preview, the discount on the order
// (after every other discount), who pays for it, the date window and the
// usage limits (including concurrent orders), the code changing between the
// preview and the submit (DISCOUNT_CODE_CHANGED), cancellation handing the use
// back, and a warehouse edit re-applying the frozen terms. Returns, the
// settlement and the commission side are in discountCode.money.test.js.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-discount-code-orders';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

function stubModule(relativePath, exportsValue) {
  const resolved = require.resolve(path.join(__dirname, '..', 'src', relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
}
stubModule('services/notification.service.js', { sendToUser: async () => {}, sendToAll: async () => {} });
const realEvents = require('../src/realtime/events');
stubModule('realtime/index.js', { EVENTS: realEvents.EVENTS, emitToAdmins: () => {}, emitToWarehouse: () => {} });

const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const Offer = require('../src/models/offer.model');
const ManufacturerDiscount = require('../src/models/manufacturerDiscount.model');
const Order = require('../src/models/order.model');
const OrderItem = require('../src/models/orderItem.model');
const LedgerAccount = require('../src/models/ledgerAccount.model');
const LedgerEntry = require('../src/models/ledgerEntry.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const DiscountCode = require('../src/models/discountCode.model');
const DiscountCodePharmacyUsage = require('../src/models/discountCodePharmacyUsage.model');
const orderService = require('../src/services/order.service');
const warehouseOrderService = require('../src/services/warehouseOrder.service');
const warehouseCodes = require('../src/services/warehouseDiscountCode.service');
const adminCodes = require('../src/services/adminDiscountCode.service');
const orderViewModel = require('../src/viewmodels/order.viewmodel');
const warehouseOrderViewModel = require('../src/viewmodels/warehouseOrder.viewmodel');
const { requestFingerprint } = require('../src/utils/idempotency');

const DAY = 24 * 60 * 60 * 1000;
const RATE = 10000;
const ids = {};
let pharmacyToken;
let server;
let baseUrl;

function withCode(expected) {
  return (err) => {
    assert.strictEqual(err.code, expected, `expected ${expected}, got ${err.code} (${err.message})`);
    return true;
  };
}

// DISCOUNT_CODE_CHANGED naming `reason`.
function changedBecause(reason) {
  return (err) => {
    assert.strictEqual(err.code, 'DISCOUNT_CODE_CHANGED', `expected DISCOUNT_CODE_CHANGED, got ${err.code} (${err.message})`);
    assert.strictEqual(err.statusCode, 409);
    assert.strictEqual(err.details.reason, reason);
    return true;
  };
}

function terms(overrides = {}) {
  return {
    type: 'percentage',
    value: 10,
    startDate: new Date(Date.now() - DAY).toISOString(),
    endDate: new Date(Date.now() + 10 * DAY).toISOString(),
    ...overrides,
  };
}

// A live warehouse code on warehouse A (created, then approved).
async function warehouseCode(overrides = {}) {
  const codeDoc = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms(overrides));
  return adminCodes.approveCode(codeDoc._id, ids.admin);
}

function adminCode(overrides = {}) {
  return adminCodes.createCode(ids.admin, terms(overrides));
}

// The standard cart on warehouse A:
//   A1 x2 at $10: offer 20% then manufacturer 10% -> 72,000 each -> 144,000
//   A2 x10 at $5: manufacturer 10%              -> 45,000 each -> 450,000
//                                                  (and 1 free unit, 10+1)
//   subtotal 594,000; platform discount 4% = 23,760; total before the code 570,240.
function standardItems() {
  return [
    { productId: String(ids.productA1), quantity: 2 },
    { productId: String(ids.productA2), quantity: 10 },
  ];
}
const PRE_CODE_A = 570240;

function submit({
  pharmacyId = ids.pharmacyA,
  warehouseId = ids.warehouseA,
  items = standardItems(),
  code = null,
  revision = null,
  key = null,
} = {}) {
  return orderService.createOrder({
    userId: ids.phUserA,
    pharmacyId,
    warehouseId,
    items,
    discountCode: code,
    discountCodeRevision: revision,
    idempotencyKey: key,
  });
}

function preview({ pharmacyId = ids.pharmacyA, warehouseId = ids.warehouseA, items = standardItems(), code }) {
  return orderService.quoteOrder({ pharmacyId, warehouseId, items, discountCode: code });
}

async function deliver(order) {
  // Two clicks: waiting for approval -> on the way -> delivered.
  for (let i = 0; i < 2; i += 1) {
    await warehouseOrderService.advanceOrderStatus(order._id, order.warehouseId, ids.whUserA);
  }
  return Order.findById(order._id).lean();
}

async function call(method, urlPath, body) {
  const response = await fetch(baseUrl + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pharmacyToken}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-discount-code-orders' });
  await syncIndexes(Order, OrderItem, LedgerAccount, LedgerEntry, DiscountCode, DiscountCodePharmacyUsage);
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: RATE, source: 'manual' });

  const [admin, whUserA, whUserB, phUserA, phUserB] = await User.create([
    { name: 'Admin', phone: '0930000950', role: 'admin', status: 'active' },
    { name: 'WHA', phone: '0940000951', role: 'warehouse', status: 'active' },
    { name: 'WHB', phone: '0940000952', role: 'warehouse', status: 'active' },
    { name: 'PhA', phone: '0930000953', role: 'pharmacy', status: 'active' },
    { name: 'PhB', phone: '0930000954', role: 'pharmacy', status: 'active' },
  ]);
  ids.admin = admin._id;
  ids.whUserA = whUserA._id;
  ids.whUserB = whUserB._id;
  ids.phUserA = phUserA._id;
  pharmacyToken = jwt.sign({ sub: String(phUserA._id) }, env.jwtSecret, { expiresIn: '1h' });

  const [warehouseA, warehouseB] = await Warehouse.create([
    {
      userId: whUserA._id, nameAr: 'مستودع أ', nameEn: 'Alpha', address: 'a', city: 'Latakia', phone: '0940000951',
      deliveryType: 'self', requireDeliverySealPhoto: false, isActive: true, discountRate: 4, commissionRate: 1,
    },
    {
      userId: whUserB._id, nameAr: 'مستودع ب', nameEn: 'Beta', address: 'b', city: 'Latakia', phone: '0940000952',
      deliveryType: 'self', requireDeliverySealPhoto: false, isActive: true, discountRate: 0, commissionRate: 0,
    },
  ]);
  ids.warehouseA = warehouseA._id;
  ids.warehouseB = warehouseB._id;

  const [pharmacyA, pharmacyB] = await Pharmacy.create([
    { userId: phUserA._id, nameAr: 'صيدلية أ', nameEn: 'Ph A', ownerName: 'O', address: 'a', city: 'Latakia', areaType: 'city', phone: '0930000953', addedBy: 'self' },
    { userId: phUserB._id, nameAr: 'صيدلية ب', nameEn: 'Ph B', ownerName: 'O', address: 'b', city: 'Latakia', areaType: 'city', phone: '0930000954', addedBy: 'self' },
  ]);
  ids.pharmacyA = pharmacyA._id;
  ids.pharmacyB = pharmacyB._id;
  // Both pharmacies are customers of warehouse A.
  await LedgerAccount.create([
    { pharmacyId: pharmacyA._id, warehouseId: warehouseA._id },
    { pharmacyId: pharmacyB._id, warehouseId: warehouseA._id },
  ]);

  const [a1, a2, b1] = await Product.create([
    { warehouseId: warehouseA._id, nameAr: 'دواء أ1', nameEn: 'A1', manufacturerAr: 'ش', price: 10, unitAr: 'ع', unitEn: 'box', isAvailable: true, isActive: true },
    { warehouseId: warehouseA._id, nameAr: 'دواء أ2', nameEn: 'A2', manufacturerAr: 'ش', price: 5, unitAr: 'ع', unitEn: 'box', isAvailable: true, isActive: true, bonuses: [{ buy: 10, free: 1 }] },
    { warehouseId: warehouseB._id, nameAr: 'دواء ب1', nameEn: 'B1', manufacturerAr: 'ش', price: 10, unitAr: 'ع', unitEn: 'box', isAvailable: true, isActive: true },
  ]);
  ids.productA1 = a1._id;
  ids.productA2 = a2._id;
  ids.productB1 = b1._id;
  await Offer.create({
    warehouseId: warehouseA._id, productId: a1._id, titleAr: 'ع', titleEn: 'o', discountPercentage: 20,
    startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + 30 * DAY), status: 'approved',
  });
  await ManufacturerDiscount.create({ warehouseId: warehouseA._id, manufacturerAr: 'ش', discountPercentage: 10 });

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

test.beforeEach(async () => {
  await Promise.all([
    Order.deleteMany({}),
    OrderItem.deleteMany({}),
    LedgerEntry.deleteMany({}),
    DiscountCode.deleteMany({}),
    DiscountCodePharmacyUsage.deleteMany({}),
  ]);
});

// ---------------------------------------------------------------------------
// The amount

test('a percentage code comes off after the offer, the manufacturer discount, the bonus and the platform discount', async () => {
  const code = await warehouseCode({ type: 'percentage', value: 10 });

  const quote = await preview({ code: code.code });
  assert.strictEqual(quote.subtotalSyp, 594000);
  assert.strictEqual(quote.platformDiscountSyp, 23760);
  assert.strictEqual(quote.preCodeSyp, PRE_CODE_A);
  assert.strictEqual(quote.discountSyp, 57024, '10% of the total after every other discount');
  assert.strictEqual(quote.finalSyp, PRE_CODE_A - 57024);
  assert.strictEqual(quote.revision, 1);
  assert.strictEqual(quote.fundedBy, 'warehouse');

  const order = await submit({ code: code.code.toLowerCase(), revision: quote.revision });
  assert.strictEqual(order.totalPrice, 594000);
  assert.strictEqual(order.discountAmount, 23760);
  assert.strictEqual(order.finalPrice, PRE_CODE_A - 57024);
  const snapshot = order.discountCode;
  assert.strictEqual(snapshot.code, code.code);
  assert.strictEqual(snapshot.type, 'percentage');
  assert.strictEqual(snapshot.value, 10);
  assert.strictEqual(snapshot.fundedBy, 'warehouse');
  assert.strictEqual(snapshot.preCodeSyp, PRE_CODE_A);
  assert.strictEqual(snapshot.discountSyp, 57024);
  assert.strictEqual(snapshot.discountUsd, 5.7, 'SYP converted through the order\'s own rate');
  assert.strictEqual(snapshot.platformCompensationSyp, 0, 'a warehouse pays for its own code');
  // The warehouse's own code: commission on what it actually receives.
  assert.strictEqual(order.commissionAmount, Math.round((PRE_CODE_A - 57024) / 100));

  // The bonus is untouched by the code.
  const a2Line = await OrderItem.findOne({ orderId: order._id, productId: ids.productA2 }).lean();
  assert.strictEqual(a2Line.freeQuantity, 1);

  const usage = await DiscountCode.findById(code._id).lean();
  assert.strictEqual(usage.usedCount, 1);
});

test('a fixed code takes its amount in lira off the total', async () => {
  const code = await warehouseCode({ type: 'fixed', value: 50000 });
  const order = await submit({ code: code.code });
  assert.strictEqual(order.discountCode.discountSyp, 50000);
  assert.strictEqual(order.finalPrice, PRE_CODE_A - 50000);
  assert.strictEqual(order.discountCode.discountUsd, 5);
});

test('a fixed code larger than the total brings it to 0, never below, and delivers a 0 charge', async () => {
  const code = await warehouseCode({ type: 'fixed', value: 5000000 });
  const quote = await preview({ code: code.code });
  assert.strictEqual(quote.discountSyp, PRE_CODE_A);
  assert.strictEqual(quote.finalSyp, 0);

  const order = await submit({ code: code.code });
  assert.strictEqual(order.finalPrice, 0);
  assert.strictEqual(order.discountCode.discountSyp, PRE_CODE_A, 'capped at the total');
  assert.strictEqual(order.commissionAmount, 0);

  const delivered = await deliver(order);
  assert.strictEqual(delivered.status, 'delivered');
  const charge = await LedgerEntry.findOne({ 'source.orderId': order._id, kind: 'charge' }).lean();
  assert.strictEqual(charge.amountSyp, 0);
  assert.strictEqual(charge.metadata.discountCodeSyp, PRE_CODE_A);
});

test('a 100% code brings the order to 0', async () => {
  const code = await warehouseCode({ type: 'percentage', value: 100 });
  const order = await submit({ code: code.code });
  assert.strictEqual(order.finalPrice, 0);
});

test('an admin code works on any warehouse, is paid by the platform, and leaves the warehouse as if there were no code', async () => {
  const code = await adminCode({ type: 'percentage', value: 10 });

  const baseline = await submit();
  const withCode = await submit({ code: code.code });
  assert.strictEqual(withCode.discountCode.fundedBy, 'platform');
  assert.strictEqual(withCode.discountCode.platformCompensationSyp, 57024);
  assert.strictEqual(withCode.finalPrice, baseline.finalPrice - 57024, 'the pharmacy pays less');
  assert.strictEqual(withCode.commissionAmount, baseline.commissionAmount, 'commission as if there were no code');

  const detail = warehouseOrderViewModel.toWarehouseOrderDetailResponse({ order: withCode, items: [], pharmacy: null });
  const baselineDetail = warehouseOrderViewModel.toWarehouseOrderDetailResponse({ order: baseline, items: [], pharmacy: null });
  assert.strictEqual(detail.order.warehouseNetSyp, baselineDetail.order.warehouseNetSyp, 'the warehouse nets the same');
  assert.strictEqual(detail.order.platformCompensationSyp, 57024);
  assert.strictEqual(detail.order.discountCode.fundedBy, 'platform');

  // Warehouse B too.
  const onB = await submit({ warehouseId: ids.warehouseB, items: [{ productId: String(ids.productB1), quantity: 1 }], code: code.code });
  assert.strictEqual(onB.discountCode.discountSyp, 10000);
  assert.strictEqual(onB.finalPrice, 90000);
});

test('the pharmacy\'s order detail shows the discount line, without the funding', async () => {
  const code = await adminCode({ type: 'fixed', value: 20000 });
  const order = await submit({ code: code.code });
  const { order: body } = orderViewModel.toOrderResponse(order);
  assert.deepStrictEqual(body.discountCode, {
    code: code.code, type: 'fixed', value: 20000, discountSyp: 20000, discountUsd: 2, released: false,
  });
});

// ---------------------------------------------------------------------------
// Who can use it

test('a warehouse code is refused on another warehouse\'s order', async () => {
  const code = await warehouseCode();
  const onB = { warehouseId: ids.warehouseB, items: [{ productId: String(ids.productB1), quantity: 1 }], code: code.code };
  await assert.rejects(preview(onB), withCode('DISCOUNT_CODE_NOT_FOR_WAREHOUSE'));
  await assert.rejects(submit(onB), withCode('DISCOUNT_CODE_NOT_FOR_WAREHOUSE'));
  assert.strictEqual(await Order.countDocuments(), 0);
});

test('a pharmacy-specific code is refused for any other pharmacy', async () => {
  const code = await adminCode({ pharmacyId: String(ids.pharmacyA) });
  await assert.rejects(preview({ pharmacyId: ids.pharmacyB, code: code.code }), withCode('DISCOUNT_CODE_NOT_FOR_PHARMACY'));
  await assert.rejects(submit({ pharmacyId: ids.pharmacyB, code: code.code }), withCode('DISCOUNT_CODE_NOT_FOR_PHARMACY'));
  const order = await submit({ pharmacyId: ids.pharmacyA, code: code.code });
  assert.ok(order.discountCode);
});

test('an unknown code, a pending code and a stopped code are each refused with their own reason', async () => {
  await assert.rejects(preview({ code: 'ZZZZ9999' }), withCode('DISCOUNT_CODE_INVALID'));
  await assert.rejects(preview({ code: 'nope' }), withCode('DISCOUNT_CODE_INVALID'));

  const pending = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms());
  await assert.rejects(preview({ code: pending.code }), withCode('DISCOUNT_CODE_PENDING_APPROVAL'));
  await assert.rejects(submit({ code: pending.code }), withCode('DISCOUNT_CODE_PENDING_APPROVAL'));

  const stopped = await warehouseCode();
  await warehouseCodes.stopCode(stopped._id, ids.warehouseA, ids.whUserA);
  await assert.rejects(submit({ code: stopped.code }), withCode('DISCOUNT_CODE_STOPPED'));
});

test('the date window: not started yet, and expired', async () => {
  const future = await adminCode({
    startDate: new Date(Date.now() + DAY).toISOString(),
    endDate: new Date(Date.now() + 5 * DAY).toISOString(),
  });
  await assert.rejects(preview({ code: future.code }), withCode('DISCOUNT_CODE_NOT_STARTED'));
  await assert.rejects(submit({ code: future.code }), withCode('DISCOUNT_CODE_NOT_STARTED'));

  const past = await adminCode({
    startDate: new Date(Date.now() - 5 * DAY).toISOString(),
    endDate: new Date(Date.now() - DAY).toISOString(),
  });
  await assert.rejects(submit({ code: past.code }), withCode('DISCOUNT_CODE_EXPIRED'));
});

// ---------------------------------------------------------------------------
// Limits

test('the total limit: once reached, the next order is refused', async () => {
  const code = await adminCode({ maxUses: 1 });
  await submit({ code: code.code });
  await assert.rejects(preview({ pharmacyId: ids.pharmacyB, code: code.code }), withCode('DISCOUNT_CODE_LIMIT_REACHED'));
  await assert.rejects(submit({ pharmacyId: ids.pharmacyB, code: code.code }), withCode('DISCOUNT_CODE_LIMIT_REACHED'));
});

test('the per-pharmacy limit: the same pharmacy is refused, another one is not', async () => {
  const code = await adminCode({ maxUsesPerPharmacy: 1 });
  await submit({ code: code.code });
  await assert.rejects(submit({ code: code.code }), withCode('DISCOUNT_CODE_PHARMACY_LIMIT_REACHED'));
  const other = await submit({ pharmacyId: ids.pharmacyB, code: code.code });
  assert.ok(other.discountCode);
  const usage = await DiscountCodePharmacyUsage.find({ codeId: code._id }).lean();
  assert.deepStrictEqual(usage.map((u) => u.count).sort(), [1, 1]);
});

test('concurrent orders never exceed the total limit', async () => {
  const code = await adminCode({ maxUses: 3 });
  const attempts = 8;
  const results = await Promise.allSettled(
    Array.from({ length: attempts }, (_, i) =>
      submit({ pharmacyId: i % 2 ? ids.pharmacyA : ids.pharmacyB, code: code.code, revision: 1 })
    )
  );
  const placed = results.filter((r) => r.status === 'fulfilled');
  const refused = results.filter((r) => r.status === 'rejected');
  assert.strictEqual(placed.length, 3, `exactly the limit got through (errors: ${refused.map((r) => r.reason.code).join(',')})`);
  for (const r of refused) {
    assert.strictEqual(r.reason.code, 'DISCOUNT_CODE_CHANGED');
    assert.strictEqual(r.reason.details.reason, 'DISCOUNT_CODE_LIMIT_REACHED');
  }
  const stored = await DiscountCode.findById(code._id).lean();
  assert.strictEqual(stored.usedCount, 3);
  assert.strictEqual(await Order.countDocuments({ 'discountCode.codeId': code._id }), 3);
});

test('concurrent orders from one pharmacy never exceed its per-pharmacy limit', async () => {
  const code = await adminCode({ maxUsesPerPharmacy: 1 });
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => submit({ code: code.code, revision: 1 }))
  );
  const placed = results.filter((r) => r.status === 'fulfilled');
  assert.strictEqual(placed.length, 1);
  for (const r of results.filter((x) => x.status === 'rejected')) {
    assert.strictEqual(r.reason.details.reason, 'DISCOUNT_CODE_PHARMACY_LIMIT_REACHED');
  }
  const usage = await DiscountCodePharmacyUsage.findOne({ codeId: code._id, pharmacyId: ids.pharmacyA }).lean();
  assert.strictEqual(usage.count, 1);
  const stored = await DiscountCode.findById(code._id).lean();
  assert.strictEqual(stored.usedCount, 1, 'the total counter rolled back with every refused order');
});

// ---------------------------------------------------------------------------
// The code changing between the cart and the submit

test('stopped after the preview: the order is refused with DISCOUNT_CODE_CHANGED (STOPPED)', async () => {
  const code = await warehouseCode();
  const quote = await preview({ code: code.code });
  await warehouseCodes.stopCode(code._id, ids.warehouseA, ids.whUserA);
  await assert.rejects(submit({ code: code.code, revision: quote.revision }), changedBecause('DISCOUNT_CODE_STOPPED'));
  assert.strictEqual(await Order.countDocuments(), 0);
});

test('edited after the preview: refused with the new terms (EDITED); resubmitting at the new revision goes through', async () => {
  const code = await adminCode({ value: 10 });
  const quote = await preview({ code: code.code });
  await adminCodes.updateCode(code._id, terms({ value: 5 }));

  await assert.rejects(submit({ code: code.code, revision: quote.revision }), (err) => {
    changedBecause('DISCOUNT_CODE_EDITED')(err);
    assert.strictEqual(err.details.value, 5);
    assert.strictEqual(err.details.revision, 2);
    return true;
  });

  const order = await submit({ code: code.code, revision: 2 });
  assert.strictEqual(order.discountCode.value, 5);
  assert.strictEqual(order.discountCode.revision, 2);
});

test('an approved warehouse edit moves the revision the cart previewed', async () => {
  const code = await warehouseCode({ value: 10 });
  const quote = await preview({ code: code.code });
  await warehouseCodes.updateCode(code._id, ids.warehouseA, terms({ value: 15 }));
  // Parked: the cart's revision is still the live one.
  const stillLive = await submit({ code: code.code, revision: quote.revision });
  assert.strictEqual(stillLive.discountCode.value, 10);

  await adminCodes.approveCode(code._id, ids.admin);
  await assert.rejects(submit({ code: code.code, revision: quote.revision }), changedBecause('DISCOUNT_CODE_EDITED'));
});

test('expired or used up after the preview: refused with the matching reason', async () => {
  const expiring = await adminCode();
  const q1 = await preview({ code: expiring.code });
  await DiscountCode.updateOne({ _id: expiring._id }, { endDate: new Date(Date.now() - 1000) });
  await assert.rejects(submit({ code: expiring.code, revision: q1.revision }), changedBecause('DISCOUNT_CODE_EXPIRED'));

  const scarce = await adminCode({ maxUses: 1 });
  const q2 = await preview({ code: scarce.code });
  await submit({ pharmacyId: ids.pharmacyB, code: scarce.code });
  await assert.rejects(submit({ code: scarce.code, revision: q2.revision }), changedBecause('DISCOUNT_CODE_LIMIT_REACHED'));
});

test('HTTP: preview and order, with the error codes the app reads', async () => {
  const code = await warehouseCode({ value: 10 });
  const cart = { warehouseId: String(ids.warehouseA), items: standardItems() };

  const quoted = await call('POST', '/discount-codes/preview', { ...cart, code: code.code });
  assert.strictEqual(quoted.status, 200);
  assert.strictEqual(quoted.body.discountCode.code, code.code);
  assert.strictEqual(quoted.body.totals.discountSyp, 57024);
  assert.strictEqual(quoted.body.totals.finalSyp, PRE_CODE_A - 57024);

  const bad = await call('POST', '/discount-codes/preview', { ...cart, code: 'ZZZZ9999' });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.body.code, 'DISCOUNT_CODE_INVALID');

  await warehouseCodes.stopCode(code._id, ids.warehouseA, ids.whUserA);
  const refused = await call('POST', '/orders', {
    ...cart,
    rateUsed: RATE,
    discountCode: code.code,
    discountCodeRevision: quoted.body.discountCode.revision,
  });
  assert.strictEqual(refused.status, 409);
  assert.strictEqual(refused.body.code, 'DISCOUNT_CODE_CHANGED');
  assert.strictEqual(refused.body.details.reason, 'DISCOUNT_CODE_STOPPED');

  const other = await adminCode({ type: 'fixed', value: 1000 });
  const placed = await call('POST', '/orders', { ...cart, discountCode: other.code, discountCodeRevision: 1 });
  assert.strictEqual(placed.status, 201);
  assert.strictEqual(placed.body.order.discountCode.discountSyp, 1000);
});

// ---------------------------------------------------------------------------
// Cancellation and edits

test('cancelling the order hands the use back; the pharmacy can use the code again', async () => {
  const code = await adminCode({ maxUses: 1, maxUsesPerPharmacy: 1 });
  const order = await submit({ code: code.code });
  await assert.rejects(submit({ code: code.code }), withCode('DISCOUNT_CODE_LIMIT_REACHED'));

  const { order: cancelled } = await orderService.cancelOrder(order._id, ids.pharmacyA, ids.phUserA);
  assert.strictEqual(cancelled.status, 'cancelled');
  assert.ok(cancelled.discountCode.releasedAt);
  assert.strictEqual(cancelled.discountCode.releaseReason, 'cancelled');

  let stored = await DiscountCode.findById(code._id).lean();
  assert.strictEqual(stored.usedCount, 0);
  const usage = await DiscountCodePharmacyUsage.findOne({ codeId: code._id, pharmacyId: ids.pharmacyA }).lean();
  assert.strictEqual(usage.count, 0);

  // A second cancel is refused and releases nothing twice.
  await assert.rejects(orderService.cancelOrder(order._id, ids.pharmacyA, ids.phUserA), withCode('ORDER_NOT_CANCELLABLE'));
  stored = await DiscountCode.findById(code._id).lean();
  assert.strictEqual(stored.usedCount, 0);

  const again = await submit({ code: code.code });
  assert.ok(again.discountCode);
});

test('a cancel that loses to the warehouse moving the order on releases nothing', async () => {
  const code = await adminCode({ maxUses: 1 });
  const order = await submit({ code: code.code });
  // cancelOrder reads the order while it is still cancellable...
  const stale = await Order.findById(order._id);
  // ...and the warehouse moves it out for delivery before the write.
  await Order.updateOne({ _id: order._id }, { status: 'out_for_delivery' });
  const realFindOne = Order.findOne;
  Order.findOne = async () => {
    Order.findOne = realFindOne;
    return stale;
  };
  try {
    await assert.rejects(
      orderService.cancelOrder(order._id, ids.pharmacyA, ids.phUserA),
      withCode('ORDER_NOT_CANCELLABLE')
    );
  } finally {
    Order.findOne = realFindOne;
  }
  const stored = await DiscountCode.findById(code._id).lean();
  assert.strictEqual(stored.usedCount, 1);
  const reread = await Order.findById(order._id).lean();
  assert.strictEqual(reread.status, 'out_for_delivery');
  assert.strictEqual(reread.discountCode.releasedAt, null);
});

test('a warehouse edit of a pending order re-applies the frozen terms, even if the code has since stopped', async () => {
  const code = await warehouseCode({ type: 'percentage', value: 10 });
  const order = await submit({ code: code.code });
  await warehouseCodes.stopCode(code._id, ids.warehouseA, ids.whUserA);

  const a2Line = await OrderItem.findOne({ orderId: order._id, productId: ids.productA2 }).lean();
  await warehouseOrderService.updateOrderItems(order._id, ids.warehouseA, ids.whUserA, {
    updateItems: [{ orderItemId: String(a2Line._id), quantity: 20 }],
  });

  const edited = await Order.findById(order._id).lean();
  // 144,000 + 20 x 45,000 = 1,044,000; less 4% = 1,002,240; 10% of that.
  assert.strictEqual(edited.totalPrice, 1044000);
  assert.strictEqual(edited.discountCode.preCodeSyp, 1002240);
  assert.strictEqual(edited.discountCode.discountSyp, 100224);
  assert.strictEqual(edited.finalPrice, 1002240 - 100224);
  assert.strictEqual(edited.discountCode.discountUsd, 10.02);
  const stored = await DiscountCode.findById(code._id).lean();
  assert.strictEqual(stored.usedCount, 1, 'an edit claims nothing new');
});

// ---------------------------------------------------------------------------
// Idempotency

test('the code is part of the idempotency fingerprint only when there is one', () => {
  const base = {
    warehouseId: ids.warehouseA,
    items: [{ productId: String(ids.productA1), quantity: 1, displayedUnitPriceUsd: 7.2 }],
    packageRequests: [],
    notes: null,
  };
  const withoutCode = orderService.computeOrderFingerprint(base);
  // Byte-identical to the fingerprint an order placed before codes existed
  // stored, so the 'order-v1' prefix did not need to move.
  const legacy = requestFingerprint('order-v1', {
    warehouseId: String(ids.warehouseA),
    items: [[String(ids.productA1), 1, 720]],
    packages: [],
    notes: null,
  });
  assert.strictEqual(withoutCode, legacy);
  assert.strictEqual(orderService.computeOrderFingerprint({ ...base, discountCode: null }), legacy);
  const withCode = orderService.computeOrderFingerprint({ ...base, discountCode: 'abc234 ' });
  assert.notStrictEqual(withCode, legacy);
  assert.strictEqual(withCode, orderService.computeOrderFingerprint({ ...base, discountCode: 'ABC234' }));
});

test('a retried submission with the same key replays the order and claims nothing twice', async () => {
  const code = await adminCode({ maxUses: 5 });
  const key = `k-${new mongoose.Types.ObjectId()}`;
  const first = await submit({ code: code.code, key });
  const replay = await submit({ code: code.code, key });
  assert.strictEqual(String(replay._id), String(first._id));
  const stored = await DiscountCode.findById(code._id).lean();
  assert.strictEqual(stored.usedCount, 1);

  // The same key with a different code is a different order.
  const other = await adminCode();
  await assert.rejects(submit({ code: other.code, key }), withCode('IDEMPOTENCY_KEY_REUSED'));
});

test('the savings summary counts the code discount', async () => {
  const code = await adminCode({ type: 'fixed', value: 30000 });
  await submit({ code: code.code });
  const summary = await orderService.getSavingsSummaryForPharmacy(ids.pharmacyA);
  assert.strictEqual(summary.discountCodeSyp, 30000);
  assert.strictEqual(
    summary.totalSavingsSyp,
    summary.offerAndManufacturerSyp + summary.advertisementSyp + summary.platformDiscountSyp + 30000
  );
});

// ---------------------------------------------------------------------------
// The quote without a code (every cart shows the server's figures)

test('a cart without a code is quoted too, and the quote is exactly what the order is charged', async () => {
  const quote = await orderService.quoteOrder({
    pharmacyId: ids.pharmacyA,
    warehouseId: ids.warehouseA,
    items: standardItems(),
  });
  assert.strictEqual(quote.code, null);
  assert.strictEqual(quote.subtotalSyp, 594000);
  assert.strictEqual(quote.platformDiscountSyp, 23760);
  assert.strictEqual(quote.discountSyp, 0);
  assert.strictEqual(quote.finalSyp, PRE_CODE_A);

  const order = await submit();
  assert.strictEqual(order.finalPrice, quote.finalSyp);
});

test('HTTP: the quote endpoint takes a cart with no code, or an empty one', async () => {
  const cart = { warehouseId: String(ids.warehouseA), items: standardItems() };
  for (const body of [cart, { ...cart, code: '' }, { ...cart, code: null }]) {
    const quoted = await call('POST', '/discount-codes/preview', body);
    assert.strictEqual(quoted.status, 200);
    assert.strictEqual(quoted.body.discountCode, null);
    assert.strictEqual(quoted.body.totals.platformDiscountSyp, 23760);
    assert.strictEqual(quoted.body.totals.discountSyp, 0);
    assert.strictEqual(quoted.body.totals.finalSyp, PRE_CODE_A);
  }
  const empty = await call('POST', '/discount-codes/preview', { warehouseId: String(ids.warehouseA), items: [] });
  assert.strictEqual(empty.status, 400);
  assert.strictEqual(empty.body.code, 'CART_EMPTY');
});

// Last: it spends this pharmacy's failed-preview budget.
test('HTTP: wrong codes are rate-limited per account; a correct preview never counts', async () => {
  const code = await adminCode();
  const cart = { warehouseId: String(ids.warehouseA), items: standardItems() };
  for (let i = 0; i < 5; i += 1) {
    const ok = await call('POST', '/discount-codes/preview', { ...cart, code: code.code });
    assert.strictEqual(ok.status, 200);
  }
  let limited = null;
  for (let i = 0; i < 40 && !limited; i += 1) {
    const bad = await call('POST', '/discount-codes/preview', { ...cart, code: 'ZZZZ9999' });
    if (bad.status === 429) limited = i;
    else assert.strictEqual(bad.status, 400);
  }
  // The test above already spent one failure.
  assert.ok(limited !== null && limited >= 28 && limited <= 30, `throttled after ${limited} wrong codes`);
});
