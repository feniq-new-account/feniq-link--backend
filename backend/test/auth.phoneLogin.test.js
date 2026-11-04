process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
process.env.JWT_SECRET ||= 'phone-login-alias-tests-at-least-32-characters';
const test = require('node:test'), assert = require('node:assert/strict'), bcrypt = require('bcrypt');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const auth = require('../src/services/auth.service');
const secret = 'Phone-Login-Example-2026';
let hash;
test.before(async () => { await startMemoryMongo({ dbName: 'phone-login-alias' }); hash = await bcrypt.hash(secret, 10); });
test.after(stopMemoryMongo);
test('international mobile login resolves a local legacy owner and keeps its identity', async () => {
  const user = await User.create({ name: 'Legacy owner', role: 'warehouse', warehouseRole: 'owner', phone: '0944550001', password: hash, status: 'active' });
  const result = await auth.loginWithPassword({ phone: '+963944550001', password: secret });
  assert.equal(String(result.user._id), user.id);
  assert.equal(result.user.phone, '0944550001');
  assert.equal(result.user.warehouseRole, 'owner');
});
test('local login resolves an internationally stored rep without changing the password', async () => {
  const user = await User.create({ name: 'Rep', role: 'rep', phone: '+963944550002', password: hash, status: 'active' });
  const result = await auth.loginWithPassword({ phone: '0944550002', password: secret });
  assert.equal(String(result.user._id), user.id);
  assert.equal(await User.findById(user.id).select('+password').then((row) => row.password), hash);
});
test('exact historical matches win; a wrong password never falls through to another account', async () => {
  const local = await User.create({ name: 'Local identity', role: 'admin', phone: '0944550003', password: hash, status: 'active' });
  const secondPassword = 'Different-Phone-Login-2026';
  const international = await User.create({ name: 'International identity', role: 'admin', phone: '+963944550003', password: await bcrypt.hash(secondPassword, 10), status: 'active' });
  assert.equal((await auth.loginWithPassword({ phone: local.phone, password: secret })).user.id, local.id);
  assert.equal((await auth.loginWithPassword({ phone: international.phone, password: secondPassword })).user.id, international.id);
  await assert.rejects(auth.loginWithPassword({ phone: international.phone, password: secret }), (error) => error.statusCode === 401);
  assert.equal((await User.findById(international.id)).failedLoginAttempts, 1);
  assert.equal((await User.findById(local.id)).failedLoginAttempts, 0);
});
test('failed attempts through both spellings share the stored account lockout', async () => {
  const user = await User.create({ name: 'Locked rep', role: 'rep', phone: '+963944550004', password: hash, status: 'active' });
  for (let index = 0; index < 5; index++) await assert.rejects(auth.loginWithPassword({ phone: index % 2 ? user.phone : '0944550004', password: 'wrong-password' }), (error) => error.statusCode === 401);
  const stored = await User.findById(user.id);
  assert.equal(stored.failedLoginAttempts, 5);
  assert.ok(stored.lockedUntil > new Date());
  await assert.rejects(auth.loginWithPassword({ phone: '0944550004', password: secret }), (error) => error.statusCode === 429);
});
test('blocked accounts and unknown aliases preserve the normal authentication failure rules', async () => {
  await User.create({ name: 'Blocked', role: 'pharmacy', phone: '0944550005', password: hash, status: 'blocked' });
  await assert.rejects(auth.loginWithPassword({ phone: '+963944550005', password: secret }), (error) => error.code === 'ACCOUNT_BLOCKED');
  await assert.rejects(auth.loginWithPassword({ phone: '+963944559999', password: secret }), (error) => error.statusCode === 401);
});
