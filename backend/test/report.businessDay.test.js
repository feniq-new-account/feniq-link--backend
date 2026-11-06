// Report date ranges are read in the business time zone (Asia/Damascus), so a
// bare end date covers the whole LOCAL day. Before, "2026-09-25" meant
// midnight UTC - three hours into nothing - and the default "this month to
// today" view of the settlement and commission pages left out everything
// delivered today.
//
// The fixture straddles local midnight: one order delivered at 23:30 on
// 24 September (20:30Z) and one at 00:10 on 25 September (21:10Z on the 24th
// in UTC). A UTC reading puts both on the 24th; the business reading puts them
// on different days.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-report-business-day';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Order = require('../src/models/order.model');
const LedgerEntry = require('../src/models/ledgerEntry.model');
const LedgerAccount = require('../src/models/ledgerAccount.model');
const CommissionCollection = require('../src/models/commissionCollection.model');
const ledger = require('../src/services/ledger.service');
const commissionService = require('../src/services/commissionCollection.service');
const { runInTransaction } = require('../src/utils/transaction');
const businessTime = require('../src/utils/businessTime');

const LATE_ON_24TH = new Date('2026-09-24T20:30:00Z'); // 23:30 local, 24 Sept
const EARLY_ON_25TH = new Date('2026-09-24T21:10:00Z'); // 00:10 local, 25 Sept

const ids = {};
const tokens = {};
let server;
let baseUrl;
let orderSeq = 88000;

async function deliveredOrder(deliveredAt, finalPrice) {
  const order = await Order.create({
    orderNumber: (orderSeq += 1),
    pharmacyId: ids.pharmacy,
    warehouseId: ids.warehouse,
    status: 'delivered',
    totalPrice: finalPrice,
    discountAmount: 0,
    commissionAmount: Math.round(finalPrice / 100),
    finalPrice,
    fx: { rate: 10000, source: 'manual', rateAsOf: deliveredAt },
    invoiceNumber: orderSeq,
    deliveredAt,
    statusHistory: [{ status: 'delivered', changedBy: ids.whUser, changedAt: deliveredAt }],
  });
  const account = await ledger.resolveAccount(ids.pharmacy, ids.warehouse);
  await runInTransaction((session) =>
    ledger.postEntry(
      { account, kind: 'charge', amountSyp: finalPrice, effectiveAt: deliveredAt, source: { orderId: order._id } },
      session
    )
  );
  return order;
}

async function get(role, urlPath) {
  const response = await fetch(baseUrl + urlPath, { headers: { Authorization: `Bearer ${tokens[role]}` } });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-report-business-day' });
  await syncIndexes(Order, LedgerEntry, LedgerAccount, CommissionCollection);

  const [admin, whUser, phUser] = await User.create([
    { name: 'Admin', phone: '0930000990', role: 'admin', status: 'active' },
    { name: 'WH', phone: '0940000991', role: 'warehouse', status: 'active' },
    { name: 'PH', phone: '0930000992', role: 'pharmacy', status: 'active' },
  ]);
  ids.admin = admin._id;
  ids.whUser = whUser._id;
  tokens.admin = jwt.sign({ sub: String(admin._id) }, env.jwtSecret, { expiresIn: '1h' });
  tokens.warehouse = jwt.sign({ sub: String(whUser._id) }, env.jwtSecret, { expiresIn: '1h' });
  tokens.pharmacy = jwt.sign({ sub: String(phUser._id) }, env.jwtSecret, { expiresIn: '1h' });

  ids.warehouse = (
    await Warehouse.create({
      userId: whUser._id, nameAr: 'م', nameEn: 'WH', address: 'a', city: 'Latakia', phone: '0940000991',
      deliveryType: 'self', isActive: true,
    })
  )._id;
  ids.pharmacy = (
    await Pharmacy.create({
      userId: phUser._id, nameAr: 'ص', nameEn: 'PH', ownerName: 'O', address: 'a', city: 'Latakia',
      areaType: 'city', phone: '0930000992', addedBy: 'self',
    })
  )._id;

  await deliveredOrder(LATE_ON_24TH, 100000);
  await deliveredOrder(EARLY_ON_25TH, 200000);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

// ---------------------------------------------------------------------------
// The helper

test('a bare date is the whole local business day, in Asia/Damascus', () => {
  assert.strictEqual(businessTime.startOfBusinessDay('2026-09-25').toISOString(), '2026-09-24T21:00:00.000Z');
  assert.strictEqual(businessTime.endOfBusinessDay('2026-09-25').toISOString(), '2026-09-25T20:59:59.999Z');
  assert.strictEqual(businessTime.businessDateOf(LATE_ON_24TH), '2026-09-24');
  assert.strictEqual(businessTime.businessDateOf(EARLY_ON_25TH), '2026-09-25');
});

test('a timestamp keeps its instant, and an impossible date is refused', () => {
  assert.strictEqual(businessTime.parseRangeStart('2026-09-01T05:00:00.000Z').toISOString(), '2026-09-01T05:00:00.000Z');
  assert.strictEqual(businessTime.parseRangeEnd('2026-02-30'), null);
  assert.strictEqual(businessTime.parseRangeStart('not a date'), null);
});

test('"this month" starts at local midnight on the 1st, even when UTC is still in the old month', () => {
  // 00:30 on 1 October in Damascus is 21:30 on 30 September in UTC.
  const start = businessTime.startOfBusinessMonth(new Date('2026-09-30T21:30:00Z'));
  assert.strictEqual(start.toISOString(), '2026-09-30T21:00:00.000Z');
});

test('the offsets come from the time-zone data, not a fixed +3: a day across a DST change is still whole', () => {
  // Damascus kept summer time until 2022: +2 in winter, +3 in summer.
  assert.strictEqual(businessTime.zoneOffsetMs(new Date('2021-01-15T12:00:00Z')) / 3600000, 2);
  assert.strictEqual(businessTime.zoneOffsetMs(new Date('2021-07-15T12:00:00Z')) / 3600000, 3);
  const dayLengths = new Set();
  for (let day = 0; day < 365; day += 1) {
    const date = businessTime.businessDateOf(new Date(Date.UTC(2021, 0, 1, 12) + day * 86400000));
    const length = businessTime.endOfBusinessDay(date) - businessTime.startOfBusinessDay(date) + 1;
    dayLengths.add(length / 3600000);
  }
  assert.deepStrictEqual([...dayLengths].sort((a, b) => a - b), [23, 24, 25]);
});

// ---------------------------------------------------------------------------
// The reports

test('warehouse settlement: 23:30 local belongs to the 24th, 00:10 local to the 25th', async () => {
  const on24th = await get('warehouse', '/warehouse/settlement?from=2026-09-24&to=2026-09-24');
  assert.strictEqual(on24th.status, 200);
  assert.deepStrictEqual(on24th.body.settlement.orders.map((o) => o.salesSyp), [100000]);

  const on25th = await get('warehouse', '/warehouse/settlement?from=2026-09-25&to=2026-09-25');
  assert.deepStrictEqual(on25th.body.settlement.orders.map((o) => o.salesSyp), [200000]);

  const both = await get('warehouse', '/warehouse/settlement?from=2026-09-24&to=2026-09-25');
  assert.strictEqual(both.body.settlement.totals.grossSalesSyp, 300000);
});

test('admin commission: the same local-day rule on the overview and the warehouse detail', async () => {
  const overview = await get('admin', '/admin/commission/overview?from=2026-09-25&to=2026-09-25');
  const row = overview.body.overview.warehouses.find((w) => String(w.warehouseId) === String(ids.warehouse));
  assert.strictEqual(row.orderCount, 1);
  assert.strictEqual(row.salesSyp, 200000);

  const detail = await get('admin', `/admin/commission/warehouses/${ids.warehouse}?from=2026-09-24&to=2026-09-24`);
  assert.deepStrictEqual(detail.body.detail.orders.map((o) => o.salesSyp), [100000]);
});

test('a range ending today counts what was delivered today (the reported bug)', async () => {
  const today = businessTime.businessDateOf(new Date());
  const order = await deliveredOrder(new Date(Date.now() - 60 * 1000), 50000);
  try {
    const settlement = await get('warehouse', `/warehouse/settlement?from=${today}&to=${today}`);
    assert.ok(settlement.body.settlement.orders.some((o) => o.salesSyp === 50000), 'delivered a minute ago');
    const byDefault = await get('warehouse', '/warehouse/settlement');
    assert.ok(byDefault.body.settlement.orders.some((o) => o.salesSyp === 50000));
  } finally {
    await LedgerEntry.deleteMany({ 'source.orderId': order._id });
    await Order.deleteOne({ _id: order._id });
  }
});

test('account statements: the warehouse, pharmacy and admin views read ranges the same way', async () => {
  const charges = (rows) => rows.filter((r) => r.kind === 'charge').map((r) => r.debitSyp ?? r.amountSyp);

  const warehouseView = await get('warehouse', `/warehouse/balances/${ids.pharmacy}?from=2026-09-25&to=2026-09-25`);
  assert.strictEqual(warehouseView.status, 200);
  assert.strictEqual(warehouseView.body.statement.rows.filter((r) => r.kind === 'charge').length, 1);
  assert.deepStrictEqual(charges(warehouseView.body.statement.rows), [200000]);

  const pharmacyView = await get('pharmacy', `/pharmacy/debts/${ids.warehouse}?from=2026-09-24&to=2026-09-24`);
  assert.strictEqual(pharmacyView.status, 200);
  assert.deepStrictEqual(charges(pharmacyView.body.statement.rows), [100000]);

  const adminView = await get(
    'admin',
    `/admin/ledger/accounts/${ids.pharmacy}/${ids.warehouse}/statement?from=2026-09-24&to=2026-09-25`
  );
  assert.strictEqual(adminView.status, 200);
  assert.strictEqual(adminView.body.statement.rows.filter((r) => r.kind === 'charge').length, 2);
});

test('a collection recorded for bare dates covers those whole local days', async () => {
  const collection = await commissionService.recordCollection({ idempotencyKey: require('node:crypto').randomUUID(),
    warehouseId: String(ids.warehouse),
    periodFrom: '2026-09-24',
    periodTo: '2026-09-24',
    amountSyp: 1000,
    actorId: ids.admin,
  });
  assert.strictEqual(collection.periodFrom.toISOString(), '2026-09-23T21:00:00.000Z');
  assert.strictEqual(collection.periodTo.toISOString(), '2026-09-24T20:59:59.999Z');

  // So it counts against the 24th, not the 25th.
  const on24th = await get('admin', `/admin/commission/warehouses/${ids.warehouse}?from=2026-09-24&to=2026-09-24`);
  assert.strictEqual(on24th.body.detail.summary.alreadyCollectedSyp, 1000);
  const on25th = await get('admin', `/admin/commission/warehouses/${ids.warehouse}?from=2026-09-25&to=2026-09-25`);
  assert.strictEqual(on25th.body.detail.summary.alreadyCollectedSyp, 0);
});

test('the statement refuses an impossible date instead of reading it as some other day', async () => {
  const response = await get('warehouse', `/warehouse/balances/${ids.pharmacy}?to=2026-02-30`);
  assert.strictEqual(response.status, 400);
  assert.strictEqual(response.body.code, 'INVALID_PERIOD');
});
