// The warehouse owner's summary: sales, collections, returns and outstanding
// debt, all read from the ledger and bucketed by the Syrian business day.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-warehouse-summary';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo, clearCollections } = require('./helpers/mongo');

const Pharmacy = require('../src/models/pharmacy.model');
const LedgerAccount = require('../src/models/ledgerAccount.model');
const LedgerEntry = require('../src/models/ledgerEntry.model');
const {
  getWarehouseSummary,
  resolveSummaryPeriod,
  previousWindow,
} = require('../src/services/warehouseSummary.service');
const { toWarehouseSummaryResponse } = require('../src/viewmodels/accountStatement.viewmodel');

const WAREHOUSE_ID = new mongoose.Types.ObjectId();
const OTHER_WAREHOUSE_ID = new mongoose.Types.ObjectId();

// 13:00 on 16 Oct 2026 in Damascus (UTC+3). The business day began at
// 21:00 UTC the evening before.
const NOW = new Date('2026-10-16T10:00:00Z');
const TODAY_START = new Date('2026-10-15T21:00:00Z');

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-warehouse-summary-test' });
});
test.after(async () => {
  await stopMemoryMongo();
});
test.beforeEach(async () => {
  await clearCollections(Pharmacy, LedgerAccount, LedgerEntry);
});

let entryNumber = 0;
async function post(account, kind, amountSyp, effectiveAt, warehouseId = WAREHOUSE_ID) {
  const direction = ['charge', 'payment_reversal'].includes(kind) ? 'debit' : 'credit';
  entryNumber += 1;
  return LedgerEntry.create({
    accountId: account._id,
    pharmacyId: account.pharmacyId,
    warehouseId,
    sequence: entryNumber,
    entryNumber,
    kind,
    direction,
    amountSyp,
    effectiveAt,
  });
}

async function seed(nameAr, balanceSyp, warehouseId = WAREHOUSE_ID) {
  const pharmacy = await Pharmacy.create({
    userId: new mongoose.Types.ObjectId(),
    nameAr,
    nameEn: nameAr,
    ownerName: 'O',
    address: 'a',
    city: 'Latakia',
    areaType: 'city',
    phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
    addedBy: 'self',
  });
  return LedgerAccount.create({
    pharmacyId: pharmacy._id,
    warehouseId,
    balanceCache: { syp: balanceSyp, usd: 0, lastEntrySeq: 1 },
    lastActivityAt: new Date('2026-10-14T09:00:00Z'),
  });
}

test('an empty warehouse reports zeros, not errors', async () => {
  const { current, previous, topBuyers, outstanding } = await getWarehouseSummary(
    WAREHOUSE_ID,
    { period: 'today' },
    NOW
  );
  const zero = { salesSyp: 0, collectionsSyp: 0, returnsSyp: 0, invoiceCount: 0, paymentCount: 0 };
  assert.deepStrictEqual(current, zero);
  assert.deepStrictEqual(previous, zero);
  assert.deepStrictEqual(topBuyers, []);
  assert.deepStrictEqual(
    { ...outstanding },
    { totalDebtSyp: 0, totalCreditSyp: 0, debtorCount: 0, topDebtors: [] }
  );
});

test('sales, collections and returns net out their reversals', async () => {
  const account = await seed('الأمل', 0);
  const at = new Date('2026-10-16T08:00:00Z');
  await post(account, 'charge', 100000, at);
  await post(account, 'charge', 50000, at);
  await post(account, 'charge_reversal', 30000, at);
  await post(account, 'payment', 80000, at);
  await post(account, 'payment_reversal', 20000, at);
  await post(account, 'return_credit', 15000, at);
  await post(account, 'return_credit_reversal', 5000, at);

  const { current } = await getWarehouseSummary(WAREHOUSE_ID, { period: 'today' }, NOW);
  assert.strictEqual(current.salesSyp, 120000);
  assert.strictEqual(current.collectionsSyp, 60000);
  assert.strictEqual(current.returnsSyp, 10000);
  assert.strictEqual(current.invoiceCount, 1); // 2 charges - 1 reversal
  assert.strictEqual(current.paymentCount, 0); // 1 payment - 1 reversal
});

test('"today" starts at midnight Damascus time, not midnight UTC', async () => {
  const account = await seed('الأمل', 0);
  await post(account, 'charge', 1000, new Date('2026-10-15T20:59:59Z')); // yesterday 23:59:59 local
  await post(account, 'charge', 2000, TODAY_START); // today 00:00:00 local
  await post(account, 'charge', 4000, new Date('2026-10-16T09:00:00Z'));

  const { current, previous } = await getWarehouseSummary(WAREHOUSE_ID, { period: 'today' }, NOW);
  assert.strictEqual(current.salesSyp, 6000);
  // The previous window is the equal-length stretch just before - it holds
  // the entry from the last second of yesterday.
  assert.strictEqual(previous.salesSyp, 1000);
});

test('week covers the last 7 business days, month starts on the 1st', async () => {
  const account = await seed('الأمل', 0);
  await post(account, 'charge', 1, new Date('2026-10-09T20:59:59Z')); // 7 days ago local, last second
  await post(account, 'charge', 10, new Date('2026-10-09T21:00:00Z')); // first moment of day -6
  await post(account, 'charge', 100, new Date('2026-09-30T21:00:00Z')); // 1 Oct 00:00 local
  await post(account, 'charge', 1000, new Date('2026-09-30T20:59:59Z')); // 30 Sep local

  const week = await getWarehouseSummary(WAREHOUSE_ID, { period: 'week' }, NOW);
  assert.strictEqual(week.current.salesSyp, 10);
  const month = await getWarehouseSummary(WAREHOUSE_ID, { period: 'month' }, NOW);
  assert.strictEqual(month.current.salesSyp, 111);
});

test('custom range takes bare dates and an open end means "until now"', async () => {
  const account = await seed('الأمل', 0);
  await post(account, 'charge', 5, new Date('2026-10-02T10:00:00Z'));
  await post(account, 'charge', 50, new Date('2026-10-05T10:00:00Z'));
  await post(account, 'charge', 500, new Date('2026-10-12T10:00:00Z'));

  const closed = await getWarehouseSummary(
    WAREHOUSE_ID,
    { period: 'custom', from: '2026-10-02', to: '2026-10-05' },
    NOW
  );
  assert.strictEqual(closed.current.salesSyp, 55);

  const open = await getWarehouseSummary(
    WAREHOUSE_ID,
    { period: 'custom', from: '2026-10-05' },
    NOW
  );
  assert.strictEqual(open.current.salesSyp, 550);
});

test('invalid periods and ranges are rejected with INVALID_PERIOD', () => {
  for (const query of [
    { period: 'year' },
    { period: 'custom' },
    { period: 'custom', from: 'not-a-date' },
    { period: 'custom', from: '2026-10-10', to: '2026-10-01' },
  ]) {
    assert.throws(
      () => resolveSummaryPeriod(query, NOW),
      (err) => err.code === 'INVALID_PERIOD' || err.errorCode === 'INVALID_PERIOD',
      JSON.stringify(query)
    );
  }
});

test('previousWindow ends one millisecond before the period begins', () => {
  const window = resolveSummaryPeriod({ period: 'today' }, NOW);
  const prev = previousWindow(window);
  assert.strictEqual(prev.to.getTime(), TODAY_START.getTime() - 1);
  assert.strictEqual(
    prev.to.getTime() - prev.from.getTime(),
    window.to.getTime() - window.from.getTime()
  );
});

test('top buyers rank by net sales and drop pharmacies with nothing net', async () => {
  const a = await seed('أ', 0);
  const b = await seed('ب', 0);
  const c = await seed('ج', 0);
  const d = await seed('د', 0);
  const e = await seed('هـ', 0);
  const at = new Date('2026-10-16T08:00:00Z');
  await post(a, 'charge', 100, at);
  await post(b, 'charge', 400, at);
  await post(c, 'charge', 300, at);
  await post(d, 'charge', 200, at);
  await post(e, 'charge', 900, at);
  await post(e, 'charge_reversal', 900, at); // fully reversed - nets to zero

  const { topBuyers } = await getWarehouseSummary(WAREHOUSE_ID, { period: 'today' }, NOW);
  assert.deepStrictEqual(
    topBuyers.map((row) => [row.pharmacy.nameAr, row.salesSyp]),
    [
      ['ب', 400],
      ['ج', 300],
      ['د', 200],
    ]
  );
});

test('outstanding sums debts and credits separately and ranks the biggest debtors', async () => {
  await seed('مدين١', 500000);
  await seed('مدين٢', 300000);
  await seed('مدين٣', 100000);
  await seed('مدين٤', 50000);
  await seed('دائن', -200000);
  await seed('صفر', 0);

  const { outstanding } = await getWarehouseSummary(WAREHOUSE_ID, { period: 'today' }, NOW);
  assert.strictEqual(outstanding.totalDebtSyp, 950000);
  assert.strictEqual(outstanding.totalCreditSyp, 200000);
  assert.strictEqual(outstanding.debtorCount, 4);
  assert.deepStrictEqual(
    outstanding.topDebtors.map((row) => [row.pharmacy.nameAr, row.balanceSyp]),
    [
      ['مدين١', 500000],
      ['مدين٢', 300000],
      ['مدين٣', 100000],
    ]
  );
});

test('another warehouse\'s entries and accounts never leak in', async () => {
  const mine = await seed('لي', 7000);
  const theirs = await seed('لهم', 999000, OTHER_WAREHOUSE_ID);
  const at = new Date('2026-10-16T08:00:00Z');
  await post(mine, 'charge', 1000, at);
  await post(theirs, 'charge', 888000, at, OTHER_WAREHOUSE_ID);
  await post(theirs, 'payment', 5000, at, OTHER_WAREHOUSE_ID);

  const { current, topBuyers, outstanding } = await getWarehouseSummary(
    WAREHOUSE_ID,
    { period: 'today' },
    NOW
  );
  assert.strictEqual(current.salesSyp, 1000);
  assert.strictEqual(current.collectionsSyp, 0);
  assert.strictEqual(topBuyers.length, 1);
  assert.strictEqual(outstanding.totalDebtSyp, 7000);
  assert.strictEqual(outstanding.debtorCount, 1);
});

test('a warehouse holding only credit has no debtors and reports the credit', async () => {
  await seed('دائن١', -150000);
  await seed('دائن٢', -50000);

  const { outstanding } = await getWarehouseSummary(WAREHOUSE_ID, { period: 'today' }, NOW);
  assert.strictEqual(outstanding.totalDebtSyp, 0);
  assert.strictEqual(outstanding.totalCreditSyp, 200000);
  assert.strictEqual(outstanding.debtorCount, 0);
  assert.deepStrictEqual(outstanding.topDebtors, []);
});

test('reversing an earlier period\'s charge today nets today\'s sales below zero', async () => {
  const account = await seed('الأمل', 0);
  await post(account, 'charge', 40000, new Date('2026-10-15T08:00:00Z')); // yesterday
  await post(account, 'charge_reversal', 40000, new Date('2026-10-16T08:00:00Z')); // today

  const { current, previous, topBuyers } = await getWarehouseSummary(
    WAREHOUSE_ID,
    { period: 'today' },
    NOW
  );
  assert.strictEqual(current.salesSyp, -40000);
  assert.strictEqual(current.invoiceCount, -1);
  // The previous window is the 13h just before today began - it holds the charge.
  assert.strictEqual(previous.salesSyp, 40000);
  assert.deepStrictEqual(topBuyers, []); // nobody bought anything net today
});

test('very large amounts sum exactly', async () => {
  const big = 900_000_000_000; // 900 billion SYP per entry
  const a = await seed('كبير', 4_000_000_000_000);
  const at = new Date('2026-10-16T08:00:00Z');
  for (let i = 0; i < 5; i += 1) await post(a, 'charge', big, at);
  await post(a, 'payment', big, at);

  const { current, topBuyers, outstanding } = await getWarehouseSummary(
    WAREHOUSE_ID,
    { period: 'today' },
    NOW
  );
  assert.strictEqual(current.salesSyp, 4_500_000_000_000);
  assert.strictEqual(current.collectionsSyp, big);
  assert.strictEqual(topBuyers[0].salesSyp, 4_500_000_000_000);
  assert.strictEqual(outstanding.totalDebtSyp, 4_000_000_000_000);
});

test('the response view shapes period, comparison and standing for the clients', async () => {
  const account = await seed('الأمل', 25000);
  await post(account, 'charge', 25000, new Date('2026-10-16T08:00:00Z'));

  const data = await getWarehouseSummary(WAREHOUSE_ID, { period: 'today' }, NOW);
  const { summary } = toWarehouseSummaryResponse(data);
  assert.strictEqual(summary.period.kind, 'today');
  assert.strictEqual(summary.period.from.getTime(), TODAY_START.getTime());
  assert.strictEqual(summary.current.salesSyp, 25000);
  assert.strictEqual(summary.previous.salesSyp, 0);
  assert.strictEqual(summary.topBuyers[0].salesSyp, 25000);
  assert.strictEqual(summary.outstanding.totalDebtSyp, 25000);
  assert.strictEqual(summary.outstanding.topDebtors[0].balanceSyp, 25000);
});


test('an explicitly invalid custom end date is rejected instead of silently using now', () => {
  const { resolveSummaryPeriod } = require('../src/services/warehouseSummary.service');
  assert.throws(() => resolveSummaryPeriod({ period: 'custom', from: '2026-10-01', to: 'not-a-date' }), { code: 'INVALID_PERIOD' });
});
