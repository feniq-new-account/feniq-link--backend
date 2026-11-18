// The admin's per-warehouse credit switch (owner decision 2026-11-18): every
// warehouse starts on cash only, only the admin turns credit on, each change is
// audited, and the warehouse's own logins read it from their settings.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'warehouse-credit-test-secret-at-least-32-characters';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Audit = require('../src/models/warehouseAudit.model');

let server, base, admin, owner, accountant, warehouse;
const token = (user) => jwt.sign({ sub: String(user._id), role: user.role, tokenVersion: 0 }, process.env.JWT_SECRET);
async function request(user, path, method = 'GET', body) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { authorization: `Bearer ${token(user)}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'warehouse-credit' });
  await User.init();
  admin = await User.create({ name: 'Admin', phone: '+963944100001', role: 'admin', status: 'active' });
  owner = await User.create({ name: 'Owner', phone: '+963944100002', role: 'warehouse', warehouseRole: 'owner', status: 'active' });
  accountant = await User.create({ name: 'Acc', phone: '+963944100003', role: 'warehouse', warehouseRole: 'accountant', status: 'active' });
  warehouse = await Warehouse.create({
    userId: owner._id, memberUserIds: [accountant._id], nameAr: 'م', nameEn: 'W',
    address: 'Latakia', city: 'Latakia', phone: '+963944100002',
  });
  const app = require('../src/app');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

test('a warehouse starts on cash only, and its logins see that', async () => {
  for (const user of [owner, accountant]) {
    const settings = await request(user, '/warehouse/settings');
    assert.equal(settings.status, 200);
    assert.equal(settings.body.settings.allowsCredit, false);
  }
});

test('the admin turns credit on and off, and each real change is audited', async () => {
  const on = await request(admin, `/admin/warehouses/${warehouse.id}/credit`, 'PUT', { allowsCredit: true });
  assert.equal(on.status, 200);
  assert.equal(on.body.warehouse.allowsCredit, true);
  assert.equal((await request(owner, '/warehouse/settings')).body.settings.allowsCredit, true);

  // Same value again: nothing to record.
  await request(admin, `/admin/warehouses/${warehouse.id}/credit`, 'PUT', { allowsCredit: true });
  const off = await request(admin, `/admin/warehouses/${warehouse.id}/credit`, 'PUT', { allowsCredit: false });
  assert.equal(off.body.warehouse.allowsCredit, false);

  const audits = await Audit.find({ warehouseId: warehouse._id, action: 'credit.changed' }).sort({ createdAt: 1 }).lean();
  assert.deepEqual(audits.map((a) => a.after.allowsCredit), [true, false]);
  assert.equal(String(audits[0].actorId), String(admin._id));

  const list = await request(admin, '/admin/warehouses');
  assert.equal(list.body.warehouses.find((w) => w.id === warehouse.id).allowsCredit, false);
});

test('only the admin can change it, and only to true or false', async () => {
  assert.equal((await request(owner, `/admin/warehouses/${warehouse.id}/credit`, 'PUT', { allowsCredit: true })).status, 403);
  const bad = await request(admin, `/admin/warehouses/${warehouse.id}/credit`, 'PUT', { allowsCredit: 'yes' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code ?? bad.body.error?.code, 'INVALID_ALLOWS_CREDIT');
  // The warehouse's own settings update cannot switch it on.
  await request(owner, '/warehouse/settings', 'PATCH', { allowsCredit: true });
  assert.equal((await Warehouse.findById(warehouse._id).lean()).allowsCredit, false);
  const missing = await request(admin, '/admin/warehouses/0123456789abcdef01234567/credit', 'PUT', { allowsCredit: true });
  assert.equal(missing.status, 404);
});
