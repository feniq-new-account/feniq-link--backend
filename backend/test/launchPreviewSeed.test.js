process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
process.env.JWT_SECRET ||= 'preview-fixture-tests-at-least-32-characters';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const { generateAccounts, assertPreviewTarget, seedLaunchPreview } = require('../scripts/seed-launch-preview');
let server, base;
const options = { nodeEnv: 'test', confirmedDatabase: 'feniq_launch_preview_test' };
test.before(async () => { await startMemoryMongo({ dbName: options.confirmedDatabase, orderingOpen: false }); });
test.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await stopMemoryMongo(); });

test('preview refuses production, unconfirmed targets and incomplete credentials before writing', async () => {
  await assert.rejects(assertPreviewTarget({ ...options, nodeEnv: 'production' }), /production/);
  await assert.rejects(assertPreviewTarget({ ...options, confirmedDatabase: 'phoenix' }), /confirm/);
  await assert.rejects(seedLaunchPreview({}, options), /credentials/);
  assert.deepEqual(await mongoose.connection.db.listCollections().toArray(), []);
});

for (const mutualRatings of [true, false]) test(`preview respects mutualRatings=${mutualRatings}, builds connected roles and consistent money examples; real password login opens each role`, async () => {
  if (server) { await new Promise(resolve => server.close(resolve)); server = null; }
  await mongoose.connection.dropDatabase();
  const accounts = generateAccounts();
  const second = generateAccounts();
  for (const key of Object.keys(accounts)) assert.notEqual(accounts[key].password, second[key].password);
  const summary = await seedLaunchPreview(accounts, { ...options, mutualRatings });
  assert.equal(summary.counts.warehouses, 3);
  assert.equal(summary.counts.pharmacies, 4);
  assert.equal(summary.counts.reps, 1);
  assert.equal(summary.counts.visits, 3);
  assert.equal(await require('../src/models/review.model').countDocuments(), mutualRatings ? 1 : 0);
  assert.equal(summary.counts.orders, 18);
  assert.equal(summary.counts.payments, 3);
  assert.equal(summary.counts.returns, 2);
  assert.equal(summary.counts.ledgerAccountsVerified, 3);
  assert.ok(summary.counts.products > 54);
  const json = JSON.stringify(summary);
  for (const account of Object.values(accounts)) assert.equal(json.includes(account.password), false);
  server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  const route = { pharmacy: '/warehouses', owner: '/warehouse/insights/report?period=today',
    accountant: '/warehouse/insights/report?period=today', rep: '/rep/me', admin: '/admin/analytics?period=today' };
  for (const [key, account] of Object.entries(accounts)) {
    const response = await fetch(`${base}/auth/login-password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: account.phone, password: account.password }) });
    const login = await response.json();
    assert.equal(response.status, 200, `${key} password login`);
    assert.equal(login.user.role, account.role);
    assert.equal(login.user.mustChangePassword, false);
    const international = `+963${account.phone.slice(1)}`;
    const fromMobile = await fetch(`${base}/auth/login-password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: international, password: account.password }) });
    const mobileLogin = await fromMobile.json();
    assert.equal(fromMobile.status, 200, `${key} international phone login`);
    assert.equal(mobileLogin.user.id, login.user.id);
    const headers = { authorization: `Bearer ${login.token}` };
    const page = await fetch(base + route[key], { headers });
    const pageBody = await page.text();
    assert.equal(page.status, 200, `${key} preview data: ${pageBody}`);
    if (key === 'pharmacy') {
      // Launch-blocking journey: the actual HTTP routes must return available
      // warehouses and their catalog, not merely documents in a seed.
      // This ran as an ordinary approved pharmacy login against the real
      // Express/Mongo stack, with ratings both ON and OFF.
      const visible = JSON.parse(pageBody);
      assert.equal(visible.success, true);
      assert.equal(visible.cityFilterApplied, false, 'legacy clients must see all warehouses');
      assert.equal(visible.warehouses.length, summary.counts.warehouses,
        'every active preview warehouse must be visible to the pharmacist');
      assert.equal(new Set(visible.warehouses.map(w => w.id)).size, summary.counts.warehouses);
      for (const warehouse of visible.warehouses) {
        assert.ok(warehouse.id && warehouse.nameAr, 'warehouse card is incomplete');
        const catalog = await fetch(`${base}/warehouses/${warehouse.id}/products?limit=5`, { headers });
        const products = await catalog.json();
        assert.equal(catalog.status, 200, JSON.stringify(products));
        assert.equal(products.success, true);
        assert.ok(products.products.length > 0,
          `visible warehouse ${warehouse.id} has an empty catalog`);
        assert.ok(products.products.every(p => p.id && (p.nameAr || p.nameEn)),
          'product cards must contain an id and a name');
      }
      const selectedCity = await fetch(`${base}/warehouses?cityScope=mine`, { headers });
      const inCity = await selectedCity.json();
      assert.equal(selectedCity.status, 200, JSON.stringify(inCity));
      assert.equal(inCity.cityFilterApplied, true);
      assert.equal(inCity.warehouses.length, summary.counts.warehouses,
        'all Latakia preview warehouses must survive the explicit city filter');
      const showAll = await fetch(`${base}/warehouses?cityScope=all`, { headers });
      const allCity = await showAll.json();
      assert.equal(showAll.status, 200, JSON.stringify(allCity));
      assert.equal(allCity.warehouses.length, summary.counts.warehouses);
    }
    if (key === 'owner') {
      const forbidden = await fetch(base + '/warehouses', { headers });
      assert.equal(forbidden.status, 403, 'warehouse owner cannot use the pharmacy catalog');
    }
    if (key === 'owner') {
      const payment = await fetch(`${base}/warehouse/payments`, { method: 'POST', headers: { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' }, body: '{}' });
      assert.equal(payment.status, 403, 'the preview owner does not gain cash-posting rights');
    }
  }
  const User = require('../src/models/user.model');
  const before = await User.find().select('_id phone +password').sort({ _id: 1 }).lean();
  await assert.rejects(seedLaunchPreview(generateAccounts(), options), /empty database/);
  assert.deepEqual(await User.find().select('_id phone +password').sort({ _id: 1 }).lean(), before, 'a rerun never resets passwords or duplicates data');
});
