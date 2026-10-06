// Discount codes, the money side: returns (partial = pro-rata and the use is
// kept; full = everything undone and the use handed back), the platform's
// compensation to the warehouse for ADMIN codes only (settlement report,
// commission overview netting, payouts), the invoice's discount line, and the
// order a fixed code brought to 0.
//
// The numbers, all on warehouse A (platform discount 4%, commission 1%):
//   10 x $10 at 10,000 SYP/$  -> subtotal 1,000,000
//   platform discount 4%     -> 40,000        total before the code 960,000
//   code 10%                 -> 96,000        the pharmacy pays 864,000
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-discount-code-money';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');
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
const Order = require('../src/models/order.model');
const OrderItem = require('../src/models/orderItem.model');
const Return = require('../src/models/return.model');
const LedgerAccount = require('../src/models/ledgerAccount.model');
const LedgerEntry = require('../src/models/ledgerEntry.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const CommissionCollection = require('../src/models/commissionCollection.model');
const DiscountCode = require('../src/models/discountCode.model');
const DiscountCodePharmacyUsage = require('../src/models/discountCodePharmacyUsage.model');
const orderService = require('../src/services/order.service');
const orderLedger = require('../src/services/orderLedger.service');
const warehouseOrderService = require('../src/services/warehouseOrder.service');
const returnService = require('../src/services/return.service');
const warehouseReturnService = require('../src/services/warehouseReturn.service');
const settlementService = require('../src/services/settlement.service');
const commissionService = require('../src/services/commissionCollection.service');
const warehouseCodes = require('../src/services/warehouseDiscountCode.service');
const adminCodes = require('../src/services/adminDiscountCode.service');
const invoiceViewModel = require('../src/viewmodels/invoice.viewmodel');

const DAY = 24 * 60 * 60 * 1000;
const ids = {};
let adminToken;
let server;
let baseUrl;

function terms(overrides = {}) {
  return {
    type: 'percentage',
    value: 10,
    startDate: new Date(Date.now() - DAY).toISOString(),
    endDate: new Date(Date.now() + 10 * DAY).toISOString(),
    ...overrides,
  };
}

async function warehouseCode(overrides = {}) {
  const codeDoc = await warehouseCodes.createCode(ids.warehouse, ids.whUser, terms(overrides));
  return adminCodes.approveCode(codeDoc._id, ids.admin);
}

function adminCode(overrides = {}) {
  return adminCodes.createCode(ids.admin, terms(overrides));
}

// Places the standard order (10 x $10) with `code`, and delivers it.
async function deliveredOrder(code = null) {
  const order = await orderService.createOrder({
    userId: ids.phUser,
    pharmacyId: ids.pharmacy,
    warehouseId: ids.warehouse,
    items: [{ productId: String(ids.product), quantity: 10 }],
    discountCode: code ? code.code : null,
  });
  // Two clicks: waiting for approval -> on the way -> delivered.
  for (let i = 0; i < 2; i += 1) {
    await warehouseOrderService.advanceOrderStatus(order._id, ids.warehouse, ids.whUser);
  }
  return Order.findById(order._id).lean();
}

async function returnUnits(order, quantity) {
  const [line] = await OrderItem.find({ orderId: order._id }).lean();
  const { returnRequest } = await returnService.createReturn({
    pharmacyId: ids.pharmacy,
    orderId: String(order._id),
    items: [{ orderItemId: String(line._id), quantity, reasonType: 'damaged' }],
  });
  const { creditEntry } = await warehouseReturnService.approveReturn(returnRequest._id, ids.warehouse, ids.whUser);
  return creditEntry;
}

function settlement() {
  return settlementService.getSettlementForWarehouse(ids.warehouse);
}

async function commissionRow() {
  const { rows } = await commissionService.getCommissionOverview({});
  return rows.find((row) => String(row.warehouseId) === String(ids.warehouse));
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-discount-code-money' });
  await syncIndexes(
    Order, OrderItem, Return, LedgerAccount, LedgerEntry, DiscountCode, DiscountCodePharmacyUsage, CommissionCollection
  );
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 10000, source: 'manual' });

  const [admin, whUser, phUser] = await User.create([
    { name: 'Admin', phone: '0930000970', role: 'admin', status: 'active' },
    { name: 'WH', phone: '0940000971', role: 'warehouse', status: 'active' },
    { name: 'Ph', phone: '0930000972', role: 'pharmacy', status: 'active' },
  ]);
  ids.admin = admin._id;
  ids.whUser = whUser._id;
  ids.phUser = phUser._id;
  adminToken = jwt.sign({ sub: String(admin._id) }, env.jwtSecret, { expiresIn: '1h' });

  ids.warehouse = (
    await Warehouse.create({
      userId: whUser._id, nameAr: 'مستودع', nameEn: 'Warehouse', address: 'a', city: 'Latakia', phone: '0940000971',
      deliveryType: 'self', requireDeliverySealPhoto: false, isActive: true, discountRate: 4, commissionRate: 1,
    })
  )._id;
  ids.pharmacy = (
    await Pharmacy.create({
      userId: phUser._id, nameAr: 'صيدلية', nameEn: 'Ph', ownerName: 'O', address: 'a', city: 'Latakia',
      areaType: 'city', phone: '0930000972', addedBy: 'self',
    })
  )._id;
  ids.product = (
    await Product.create({
      warehouseId: ids.warehouse, nameAr: 'دواء', nameEn: 'Drug', manufacturerAr: 'م', price: 10,
      unitAr: 'ع', unitEn: 'box', isAvailable: true, isActive: true,
    })
  )._id;

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
    Return.deleteMany({}),
    LedgerEntry.deleteMany({}),
    LedgerAccount.deleteMany({}),
    CommissionCollection.deleteMany({}),
    DiscountCode.deleteMany({}),
    DiscountCodePharmacyUsage.deleteMany({}),
  ]);
});

// ---------------------------------------------------------------------------
// Compensation: admin codes only

test('an admin code: the pharmacy is charged the discounted total, the platform owes the warehouse the discount', async () => {
  const code = await adminCode();
  const order = await deliveredOrder(code);
  assert.strictEqual(order.finalPrice, 864000);
  assert.strictEqual(order.commissionAmount, 9600, 'commission as if there were no code');

  const charge = await LedgerEntry.findOne({ 'source.orderId': order._id, kind: 'charge' }).lean();
  assert.strictEqual(charge.amountSyp, 864000, 'the pharmacy owes the warehouse what it paid');
  assert.strictEqual(charge.metadata.platformCompensationSyp, 96000);
  assert.strictEqual(charge.metadata.discountCodeFundedBy, 'platform');

  const { rows, totals } = await settlement();
  assert.strictEqual(rows[0].salesSyp, 864000);
  assert.strictEqual(rows[0].platformCompensationSyp, 96000);
  assert.strictEqual(rows[0].netCompensationSyp, 96000);
  assert.strictEqual(rows[0].warehouseNetSyp, 960000 - 9600, 'exactly what it nets with no code');
  assert.strictEqual(totals.netCompensationSyp, 96000);
  assert.strictEqual(totals.warehouseNetSyp, 950400);

  // No ledger entry was posted for the platform's side.
  assert.strictEqual(await LedgerEntry.countDocuments({ 'source.orderId': order._id }), 1);
});

test('a warehouse code: no compensation; the warehouse bears the discount and pays commission on what it earns', async () => {
  const code = await warehouseCode();
  const order = await deliveredOrder(code);
  assert.strictEqual(order.finalPrice, 864000);
  assert.strictEqual(order.commissionAmount, 8640);

  const { rows, totals } = await settlement();
  assert.strictEqual(rows[0].platformCompensationSyp, 0);
  assert.strictEqual(rows[0].warehouseNetSyp, 864000 - 8640);
  assert.strictEqual(totals.netCompensationSyp, 0);
  const row = await commissionRow();
  assert.strictEqual(row.compensationOwedSyp, 0);
  assert.strictEqual(row.outstandingSyp, 8640);
});

test('compensation accrues at delivery: an order not yet delivered owes the warehouse nothing', async () => {
  const code = await adminCode();
  await orderService.createOrder({
    userId: ids.phUser,
    pharmacyId: ids.pharmacy,
    warehouseId: ids.warehouse,
    items: [{ productId: String(ids.product), quantity: 10 }],
    discountCode: code.code,
  });
  const { totals } = await settlement();
  assert.strictEqual(totals.netCompensationSyp, 0, 'a pending (or later cancelled) order owes nothing');
});

// ---------------------------------------------------------------------------
// Returns

test('a partial return is pro-rata: the pharmacy gets its net share back, the compensation is clawed back in step, the use is kept', async () => {
  const code = await adminCode();
  const order = await deliveredOrder(code);
  const credit = await returnUnits(order, 4);

  // 4 of 10 units: 40% of what the pharmacy actually paid.
  assert.strictEqual(credit.amountSyp, 345600);
  assert.strictEqual(credit.metadata.discountCodeSyp, 96000);
  assert.strictEqual(credit.metadata.compensationClawbackSyp, 38400);
  assert.strictEqual(credit.metadata.isFinalReturn, false);

  const { rows } = await settlement();
  const row = rows[0];
  assert.strictEqual(row.creditedSyp, 345600);
  assert.strictEqual(row.compensationClawbackSyp, 38400);
  assert.strictEqual(row.netCompensationSyp, 57600);
  assert.strictEqual(row.commissionClawbackSyp, 3840);
  // The same as the no-code order after the same return: 576,000 net sales,
  // 5,760 commission.
  assert.strictEqual(row.warehouseNetSyp, 576000 - 5760);

  const stored = await DiscountCode.findById(code._id).lean();
  assert.strictEqual(stored.usedCount, 1, 'a partial return keeps the use');
  const reread = await Order.findById(order._id).lean();
  assert.strictEqual(reread.discountCode.releasedAt, null);
});

test('a partial return on a warehouse code credits the net share too (no crediting more than was paid)', async () => {
  const code = await warehouseCode({ type: 'fixed', value: 500000 });
  const order = await deliveredOrder(code);
  assert.strictEqual(order.finalPrice, 460000);
  const credit = await returnUnits(order, 9);
  // 90% of the goods back: 90% of the 460,000 actually paid, not 90% of the
  // pre-code price.
  assert.strictEqual(credit.amountSyp, 414000);
  assert.strictEqual(credit.metadata.compensationClawbackSyp, 0);
});

test('a full return undoes everything: credit = what was paid, compensation clawed back entirely, the use handed back', async () => {
  const code = await adminCode({ maxUsesPerPharmacy: 1 });
  const order = await deliveredOrder(code);
  const credit = await returnUnits(order, 10);
  assert.strictEqual(credit.amountSyp, 864000);
  assert.strictEqual(credit.metadata.isFinalReturn, true);
  assert.strictEqual(credit.metadata.compensationClawbackSyp, 96000);

  const { rows, totals } = await settlement();
  assert.strictEqual(rows[0].netCompensationSyp, 0);
  assert.strictEqual(rows[0].netCommissionSyp, 0);
  assert.strictEqual(rows[0].warehouseNetSyp, 0);
  assert.strictEqual(totals.netCompensationSyp, 0);

  const stored = await DiscountCode.findById(code._id).lean();
  assert.strictEqual(stored.usedCount, 0);
  const reread = await Order.findById(order._id).lean();
  assert.strictEqual(reread.discountCode.releaseReason, 'full_return');

  // The pharmacy can use it again.
  const again = await deliveredOrder(code);
  assert.ok(again.discountCode);
});

test('an order a fixed code brought to 0: 0 charged, the compensation still owed, and a full return undoes it', async () => {
  const code = await adminCode({ type: 'fixed', value: 5000000 });
  const order = await deliveredOrder(code);
  assert.strictEqual(order.finalPrice, 0);
  assert.strictEqual(order.discountCode.platformCompensationSyp, 960000);
  assert.strictEqual(order.commissionAmount, 9600);

  let { rows } = await settlement();
  assert.strictEqual(rows[0].warehouseNetSyp, 960000 - 9600);

  const credit = await returnUnits(order, 10);
  assert.strictEqual(credit.amountSyp, 0);
  assert.strictEqual(credit.metadata.compensationClawbackSyp, 960000);
  ({ rows } = await settlement());
  assert.strictEqual(rows[0].commissionClawbackSyp, 9600);
  assert.strictEqual(rows[0].warehouseNetSyp, 0);
});

// ---------------------------------------------------------------------------
// Commission netting and payouts

test('the commission overview nets the compensation; a payout to the warehouse settles it', async () => {
  const code = await adminCode();
  await deliveredOrder(code);
  await deliveredOrder(code);

  let row = await commissionRow();
  assert.strictEqual(row.commissionOwedSyp, 19200);
  assert.strictEqual(row.compensationOwedSyp, 192000);
  assert.strictEqual(row.outstandingSyp, 19200 - 192000, 'negative: the platform owes the warehouse');

  const periodFrom = new Date(Date.now() - 2 * DAY).toISOString();
  const periodTo = new Date(Date.now() + DAY).toISOString();
  const payout = await commissionService.recordCollection({
    warehouseId: String(ids.warehouse), periodFrom, periodTo, amountSyp: 172800, direction: 'to_warehouse', actorId: ids.admin,
  });
  assert.strictEqual(payout.direction, 'to_warehouse');

  row = await commissionRow();
  assert.strictEqual(row.paidOutSyp, 172800);
  assert.strictEqual(row.alreadyCollectedSyp, 0);
  assert.strictEqual(row.outstandingSyp, 0);

  // Reversing the payout puts the debt back.
  await commissionService.reverseCollection({ collectionId: payout._id, reason: 'typo', actorId: ids.admin });
  row = await commissionRow();
  assert.strictEqual(row.outstandingSyp, -172800);
});

test('HTTP: the admin records a payout and sees the compensation per warehouse', async () => {
  const code = await adminCode();
  await deliveredOrder(code);

  const response = await fetch(`${baseUrl}/admin/commission/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      warehouseId: String(ids.warehouse),
      periodFrom: new Date(Date.now() - DAY).toISOString(),
      periodTo: new Date(Date.now() + DAY).toISOString(),
      amountSyp: 50000,
      direction: 'to_warehouse',
    }),
  });
  assert.strictEqual(response.status, 201);
  const created = await response.json();
  assert.strictEqual(created.collection.direction, 'to_warehouse');

  const overview = await (
    await fetch(`${baseUrl}/admin/commission/overview`, { headers: { Authorization: `Bearer ${adminToken}` } })
  ).json();
  const row = overview.overview.warehouses.find((w) => String(w.warehouseId) === String(ids.warehouse));
  assert.strictEqual(row.compensationOwedSyp, 96000);
  assert.strictEqual(row.paidOutSyp, 50000);
  assert.strictEqual(row.outstandingSyp, 9600 - 96000 + 50000);
  assert.strictEqual(overview.overview.totals.compensationOwedSyp, 96000);

  const detail = await (
    await fetch(`${baseUrl}/admin/commission/warehouses/${ids.warehouse}`, { headers: { Authorization: `Bearer ${adminToken}` } })
  ).json();
  assert.strictEqual(detail.detail.orders[0].platformCompensationSyp, 96000);
  assert.strictEqual(detail.detail.collections[0].direction, 'to_warehouse');

  const bad = await fetch(`${baseUrl}/admin/commission/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      warehouseId: String(ids.warehouse), periodFrom: new Date().toISOString(), periodTo: new Date().toISOString(),
      amountSyp: 1, direction: 'sideways',
    }),
  });
  assert.strictEqual(bad.status, 400);
});

// ---------------------------------------------------------------------------
// The invoice

test('the invoice carries the discount line; only the warehouse copy shows the compensation', async () => {
  const code = await adminCode();
  const order = await deliveredOrder(code);
  const hydrated = await Order.findById(order._id);
  const built = await orderLedger.buildInvoice(hydrated);

  const pharmacyCopy = invoiceViewModel.toInvoiceResponse(built, 'pharmacy').invoice;
  assert.strictEqual(pharmacyCopy.discountCodeSyp, 96000);
  assert.strictEqual(pharmacyCopy.discountCode.code, code.code);
  assert.strictEqual(pharmacyCopy.discountCode.fundedBy, undefined);
  assert.strictEqual(pharmacyCopy.platformCompensationSyp, undefined);
  assert.strictEqual(pharmacyCopy.finalAmountSyp, 864000);

  const warehouseCopy = invoiceViewModel.toInvoiceResponse(built, 'warehouse').invoice;
  assert.strictEqual(warehouseCopy.discountCode.fundedBy, 'platform');
  assert.strictEqual(warehouseCopy.platformCompensationSyp, 96000);
  assert.strictEqual(warehouseCopy.warehouseNetSyp, 864000 + 96000 - 9600);
});
