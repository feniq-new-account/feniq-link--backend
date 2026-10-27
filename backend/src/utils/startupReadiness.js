const mongoose = require('mongoose');

let initialized = false;

function markInitialized() {
  initialized = true;
}

function isReady() {
  return initialized && mongoose.connection.readyState === 1;
}

// These guarantees must exist before the HTTP listener accepts traffic.
async function initializeDatabase({ connectDB, supportsTransactions, ensureFinancialIndexes, ensureDiscountCodeIndexes }) {
  initialized = false;
  await connectDB();
  if (!(await supportsTransactions())) {
    throw new Error('REPLICA_SET_REQUIRED: financial operations require a MongoDB replica set.');
  }
  await ensureFinancialIndexes();
  await ensureDiscountCodeIndexes();
}

function shouldSeedDemo(nodeEnv, optIn) {
  return nodeEnv !== 'production' && optIn === 'true';
}

module.exports = { initializeDatabase, markInitialized, isReady, shouldSeedDemo };
