const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { initializeDatabase, markInitialized, isReady, shouldSeedDemo } = require('../src/utils/startupReadiness');
const health = require('../src/routes/health.routes');

test('database and financial-index failures reject startup before readiness', async () => {
  const steps = [];
  const dependencies = {
    connectDB: async () => steps.push('connect'),
    supportsTransactions: async () => false,
    ensureFinancialIndexes: async () => steps.push('financial'),
    ensureDiscountCodeIndexes: async () => steps.push('discount'),
  };
  await assert.rejects(initializeDatabase(dependencies), /REPLICA_SET_REQUIRED/);
  assert.deepEqual(steps, ['connect']);
  assert.equal(isReady(), false);

  await assert.rejects(initializeDatabase({
    ...dependencies,
    supportsTransactions: async () => true,
    ensureFinancialIndexes: async () => { throw new Error('index failed'); },
  }), /index failed/);
  assert.equal(isReady(), false);

  await assert.rejects(initializeDatabase({
    ...dependencies,
    connectDB: async () => { throw new Error('offline'); },
  }), /offline/);
});

test('health fails until startup completes and after a database disconnection', async () => {
  const originalState = mongoose.connection.readyState;
  const handler = health.stack.find((layer) => layer.route).route.stack[0].handle;
  const response = () => ({ status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
  try {
    await initializeDatabase({
      connectDB: async () => {}, supportsTransactions: async () => true,
      ensureFinancialIndexes: async () => {}, ensureDiscountCodeIndexes: async () => {},
    });
    mongoose.connection.readyState = 1;
    const booting = response();
    handler({}, booting);
    assert.equal(booting.statusCode, 503);
    markInitialized();
    const ready = response();
    handler({}, ready);
    assert.equal(ready.statusCode, 200);
    mongoose.connection.readyState = 0;
    const disconnected = response();
    handler({}, disconnected);
    assert.equal(disconnected.statusCode, 503);
    assert.equal(disconnected.body.success, false);
  } finally {
    mongoose.connection.readyState = originalState;
  }
});

test('demo accounts require explicit opt-in and are forbidden in production', () => {
  assert.equal(shouldSeedDemo('development', undefined), false);
  assert.equal(shouldSeedDemo('development', 'false'), false);
  assert.equal(shouldSeedDemo('development', 'true'), true);
  assert.equal(shouldSeedDemo('production', 'true'), false);
});
