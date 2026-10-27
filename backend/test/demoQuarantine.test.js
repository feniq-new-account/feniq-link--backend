process.env.JWT_SECRET ||= 'test-secret-for-demo-quarantine-long-enough';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
const test = require('node:test'); const assert = require('node:assert/strict'); const bcrypt = require('bcrypt');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model'); const RefreshToken = require('../src/models/refreshToken.model');
const { DEMO_ADMIN, WAREHOUSES } = require('../src/services/demoSeed.service');
const { quarantineDemoCredentials } = require('../src/services/demoQuarantine.service');
test.before(() => startMemoryMongo({ dbName: 'demo-quarantine' })); test.after(stopMemoryMongo);
test('production blocks unchanged known demo credentials and revokes their sessions without touching changed accounts', async () => {
  const admin = await User.create({ name:'Demo', phone:DEMO_ADMIN.phone, role:'admin', status:'active', password:await bcrypt.hash(DEMO_ADMIN.password,4) });
  const changed = await User.create({ name:'Changed', phone:WAREHOUSES[0].phone, role:'warehouse', status:'active', password:await bcrypt.hash('A-private-changed-password',4) });
  await RefreshToken.create({ userId:admin._id, tokenHash:'demo-session', expiresAt:new Date(Date.now()+60000) });
  assert.equal(await quarantineDemoCredentials('development'),0);
  assert.equal((await User.findById(admin._id)).status,'active');
  assert.equal(await quarantineDemoCredentials('production'),1);
  assert.equal((await User.findById(admin._id)).status,'blocked');
  assert.equal((await User.findById(changed._id)).status,'active');
  assert.equal(await RefreshToken.countDocuments({userId:admin._id}),0);
});
