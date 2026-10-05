const http = require('http');
const app = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const { startScheduledRefresh } = require('./services/exchangeRate.service');
const { supportsTransactions } = require('./utils/transaction');
const { startLedgerVerifier } = require('./services/ledgerVerifier.service');
const { ensureFinancialIndexes } = require('./services/ledger.service');
const { ensureDiscountCodeIndexes } = require('./services/discountCode.service');
const { initRealtime } = require('./realtime');
const User = require('./models/user.model');
const { seedDemoBonuses, turnOffDemoSealPhoto, seedDemoAdminIfNone, seedDemoDataIfEmpty, seedDemoOrders } = require('./services/demoSeed.service');
const { seedDemoCatalogImages } = require('./services/demoCatalogImages.service');

// Audit L-5. Two behaviours branch on NODE_ENV and both get LOOSER when it is
// not 'production':
//   - errorHandler.js returns the raw internal message on a 500 instead of a
//     generic one, so a stack-level detail reaches the client;
//   - app.js (and realtime/index.js) accept any localhost origin for CORS
//     instead of the configured allowlist.
// Neither is wrong in development - they are there precisely to make local work
// possible. The failure mode is a real deployment where NODE_ENV was simply
// never set, which looks completely normal until one of those two matters.
//
// Warns rather than exits, per the same reasoning as the replica-set check
// below: refusing to boot a server that is otherwise healthy is the more
// damaging of the two outcomes. The heuristic is deliberately conservative -
// a local mongod on the default port is the overwhelmingly common dev setup,
// and anything else paired with a non-production NODE_ENV is worth a shout.
function warnIfProductionLikeButNotProduction() {
  if (env.nodeEnv === 'production') return;

  const uri = env.mongodbUri || '';
  const looksLocal = /(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(uri);
  if (looksLocal) return;

  // eslint-disable-next-line no-console
  console.warn(
    [
      '',
      '*** NODE_ENV is not "production" but MONGODB_URI points at a remote',
      `*** database (NODE_ENV=${env.nodeEnv}). While this holds:`,
      '***   - internal 500 error messages are returned to clients verbatim',
      '***   - CORS accepts any localhost origin instead of CORS_ORIGINS',
      '*** Set NODE_ENV=production on any real deployment.',
      '',
    ].join('\n')
  );
}

async function start() {
  warnIfProductionLikeButNotProduction();

  try {
    await connectDB();
    // eslint-disable-next-line no-console
    console.log('MongoDB connected.');

    // Money-Flow V2 runs every financial write inside a transaction, which
    // needs a replica set (single-node is fine). Checked once, at boot, so a
    // misconfigured deployment is obvious immediately rather than at the first
    // payment. Non-financial routes still work, so this warns rather than
    // exits - but it warns loudly.
    if (await supportsTransactions()) {
      // Built before the first request rather than lazily under one - see
      // ledger.service.js's ensureFinancialIndexes.
      await ensureFinancialIndexes();
      // The discount-code usage counters are written inside the order
      // transaction too - same reasoning.
      await ensureDiscountCodeIndexes();
      startLedgerVerifier();
    } else {
      // eslint-disable-next-line no-console
      console.error(
        [
          '',
          '*** MongoDB is a STANDALONE. Financial operations (delivery, payments,',
          '*** returns) will fail with REPLICA_SET_REQUIRED until a replica set',
          '*** is enabled. See backend/docs/LOCAL_SETUP.md.',
          '',
        ].join('\n')
      );
    }

    // With approval turned off, pharmacies that registered while it was on
    // would otherwise sit on the approval-pending screen forever.
    if (!env.requireAccountApproval) {
      const { modifiedCount } = await User.updateMany(
        { role: 'pharmacy', status: 'pending' },
        { $set: { status: 'active' } }
      );
      if (modifiedCount) {
        // eslint-disable-next-line no-console
        console.log(`Auto-approved ${modifiedCount} pending pharmacy account(s).`);
      }
    }

    if (process.env.SEED_DEMO_DATA !== 'false') {
      const admin = await seedDemoAdminIfNone();
      if (admin) {
        // eslint-disable-next-line no-console
        console.log(`Created the demo admin (${admin.phone}).`);
      }
      const seeded = await seedDemoDataIfEmpty();
      if (seeded) {
        // eslint-disable-next-line no-console
        console.log(`Seeded demo data: ${seeded.warehouses} warehouses, ${seeded.products} products.`);
      }
      const pictured = await seedDemoCatalogImages();
      if (pictured) {
        // eslint-disable-next-line no-console
        console.log(`Demo catalog: ${JSON.stringify(pictured)}`);
      }
      const seededOrders = await seedDemoOrders();
      await turnOffDemoSealPhoto();
      const bonuses = await seedDemoBonuses();
      if (bonuses) {
        // eslint-disable-next-line no-console
        console.log(`Demo bonus offers on ${bonuses} products.`);
      }
      if (seededOrders && seededOrders.orders) {
        // eslint-disable-next-line no-console
        console.log(`Seeded ${seededOrders.orders} demo orders.`);
      }
    }

    startScheduledRefresh();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('MongoDB connection failed. Starting server anyway (DB-dependent routes will fail).');
    // eslint-disable-next-line no-console
    console.error(err.message);
  }

  // The Express app is wrapped in an explicit http.Server (instead of
  // app.listen's implicit one) purely so Socket.IO can attach to that same
  // server - one process, one port, one listener. Every existing route,
  // middleware and health check is served exactly as before.
  const server = http.createServer(app);
  initRealtime(server);

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Feniq API listening on port ${env.port} (${env.nodeEnv})`);
  });

  startKeepAlive();
}

// Render's free plan puts the service to sleep after 15 minutes without
// inbound traffic, and waking it takes longer than the app's request timeout -
// so the first open after a quiet spell showed "no connection". Pinging our own
// public URL counts as inbound traffic and keeps it awake. RENDER_EXTERNAL_URL
// is set by Render itself, so this does nothing anywhere else.
const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;

function startKeepAlive() {
  const baseUrl = process.env.RENDER_EXTERNAL_URL;
  if (!baseUrl || process.env.KEEP_ALIVE === 'false') return;
  setInterval(() => {
    fetch(`${baseUrl}/api/health`).catch(() => {});
  }, KEEP_ALIVE_INTERVAL_MS).unref();
}

start();
