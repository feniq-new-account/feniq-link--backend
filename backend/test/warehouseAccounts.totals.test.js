// The warehouse's accounts table: per pharmacy, what it bought, what it paid,
// and the date of its last payment - all read from the ledger.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-warehouse-accounts-totals';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo, clearCollections } = require('./helpers/mongo');

const Pharmacy = require('../src/models/pharmacy.model');
const LedgerAccount = require('../src/models/ledgerAccount.model');
const LedgerEntry = require('../src/models/ledgerEntry.model');
const { listAccountsForWarehouse } = require('../src/services/accountStatement.service');
const { toWarehouseAccountsResponse } = require('../src/viewmodels/accountStatement.viewmodel');

const WAREHOUSE_ID = new mongoose.Types.ObjectId();

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-warehouse-accounts-totals-test' });
});
test.after(async () => {
  await stopMemoryMongo();
});
test.beforeEach(async () => {
  await clearCollections(Pharmacy, LedgerAccount, LedgerEntry);
});

let entryNumber = 0;
async function post(account, kind, amountSyp, effectiveAt) {
  const direction = ['charge', 'payment_reversal'].includes(kind) ? 'debit' : 'credit';
  entryNumber += 1;
  return LedgerEntry.create({
    accountId: account._id,
    pharmacyId: account.pharmacyId,
    warehouseId: WAREHOUSE_ID,
    sequence: entryNumber,
    entryNumber,
    kind,
    direction,
    amountSyp,
    effectiveAt,
  });
}

async function seed(balanceSyp) {
  const pharmacy = await Pharmacy.create({
    userId: new mongoose.Types.ObjectId(),
    nameAr: 'صيدلية',
    nameEn: 'Pharmacy',
    ownerName: 'O',
    address: 'a',
    city: 'Latakia',
    areaType: 'city',
    phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
    addedBy: 'self',
  });
  const account = await LedgerAccount.create({
    pharmacyId: pharmacy._id,
    warehouseId: WAREHOUSE_ID,
    balanceCache: { syp: balanceSyp, usd: 0, lastEntrySeq: 1 },
  });
  return account;
}

test('rows carry purchases, paid (net of reversals) and the last payment date', async () => {
  const account = await seed(70000);
  await post(account, 'charge', 100000, new Date('2026-10-01'));
  await post(account, 'charge', 50000, new Date('2026-10-02'));
  await post(account, 'payment', 60000, new Date('2026-10-03'));
  await post(account, 'payment', 30000, new Date('2026-10-05'));
  await post(account, 'payment_reversal', 10000, new Date('2026-10-06'));

  const { rows } = await listAccountsForWarehouse(WAREHOUSE_ID);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].purchasesSyp, 150000);
  assert.strictEqual(rows[0].paidSyp, 80000);
  assert.strictEqual(rows[0].lastPaymentAt.toISOString(), new Date('2026-10-05').toISOString());

  const json = toWarehouseAccountsResponse({ rows }).pharmacies[0];
  assert.strictEqual(json.purchasesSyp, 150000);
  assert.strictEqual(json.paidSyp, 80000);
});

test('an account with no entries has zero totals and no last payment', async () => {
  await seed(0);
  const { rows } = await listAccountsForWarehouse(WAREHOUSE_ID);
  assert.strictEqual(rows[0].purchasesSyp, 0);
  assert.strictEqual(rows[0].paidSyp, 0);
  assert.strictEqual(rows[0].lastPaymentAt, null);
});
