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
const platformSettings = require('./services/platformSettings.service');
const telegram = require('./services/telegram.service');
const { seedDemoBonuses, turnOffDemoSealPhoto, seedDemoAdminIfNone, seedDemoDataIfEmpty, seedDemoOrders } = require('./services/demoSeed.service');
const { seedDemoCatalogImages } = require('./services/demoCatalogImages.service');
const { zeroLegacyPlatformRates } = require('./services/platformRatesPolicy.service');
const { seedDemoFeatures } = require('./services/demoFeatures.service');
const { applyDemoBranding } = require('./services/demoBranding.service');
const { initializeDatabase, markInitialized, shouldSeedDemo } = require('./utils/startupReadiness');

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
    await initializeDatabase({ connectDB, supportsTransactions, ensureFinancialIndexes, ensureDiscountCodeIndexes });
    // eslint-disable-next-line no-console
    console.log('MongoDB connected.');

    const quarantined = await require('./services/demoQuarantine.service').quarantineDemoCredentials(env.nodeEnv);
    if (quarantined) console.warn(`Disabled ${quarantined} unchanged demo credential(s) before accepting production traffic.`);
    startLedgerVerifier();

    // The old 4% discount / 1% commission defaults are gone (profit policy in
    // services/platformRatesPolicy.service.js); warehouses made under them are
    // brought to zero once.
    const zeroed = await zeroLegacyPlatformRates();
    if (zeroed) {
      // eslint-disable-next-line no-console
      console.log(`Set the old platform rates to zero on ${zeroed} warehouse(s).`);
    }

    // With approval turned off, pharmacies that registered while it was on
    // would otherwise sit on the approval-pending screen forever.
    if (!(await platformSettings.isApprovalRequired())) {
      const { modifiedCount } = await User.updateMany(
        { role: 'pharmacy', status: 'pending' },
        { $set: { status: 'active', pharmacyApprovedAt: new Date() } }
      );
      if (modifiedCount) {
        // eslint-disable-next-line no-console
        console.log(`Auto-approved ${modifiedCount} pending pharmacy account(s).`);
      }
    }

    if (shouldSeedDemo(env.nodeEnv, process.env.SEED_DEMO_DATA)) {
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
      const features = await seedDemoFeatures();
      if (features) {
        // eslint-disable-next-line no-console
        console.log(`Demo features: ${JSON.stringify(features)}`);
      }
      const bonuses = await seedDemoBonuses();
      if (bonuses) {
        // eslint-disable-next-line no-console
        console.log(`Demo bonus offers on ${bonuses} products.`);
      }
      // Not fatal: an upload failure (no Cloudinary or MEDIA_DIR) leaves the old
      // logos and banners and is retried on the next boot.
      try {
        const branding = await applyDemoBranding();
        if (branding) {
          // eslint-disable-next-line no-console
          console.log(`Demo branding: ${JSON.stringify(branding)}`);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Demo branding failed:', err.message);
      }
      if (seededOrders && seededOrders.orders) {
        // eslint-disable-next-line no-console
        console.log(`Seeded ${seededOrders.orders} demo orders.`);
      }
    }

    startScheduledRefresh();
    // Points the Telegram bot at this server (if a bot is configured). Not
    // awaited: Telegram being unreachable must not hold the boot up.
    telegram.setupWebhook().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Telegram webhook setup failed:', err.message);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Database initialization failed. Refusing to accept requests.');
    // eslint-disable-next-line no-console
    console.error(err.code || err.name || 'STARTUP_FAILED');
    throw err;
  }

  // The Express app is wrapped in an explicit http.Server (instead of
  // app.listen's implicit one) purely so Socket.IO can attach to that same
  // server - one process, one port, one listener. Every existing route,
  // middleware and health check is served exactly as before.
  const server = http.createServer(app);
  initRealtime(server);
  markInitialized();

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Feniq API listening on port ${env.port} (${env.nodeEnv})`);
  });

  startKeepAlive();
  startAutoDelivery();
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

// An order on the road for a day without anyone marking it delivered is closed
// on its own (warehouseOrder.service.js's autoDeliverStaleOrders). Hourly;
// AUTO_DELIVERY=false turns it off.
const AUTO_DELIVERY_INTERVAL_MS = 60 * 60 * 1000;

function startAutoDelivery() {
  if (process.env.AUTO_DELIVERY === 'false') return;
  const { autoDeliverStaleOrders } = require('./services/warehouseOrder.service');
  const run = () =>
    autoDeliverStaleOrders().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Auto-delivery run failed.', err.message);
    });
  setInterval(run, AUTO_DELIVERY_INTERVAL_MS).unref();
  run();
}

if (require.main === module) {
  start().catch(() => process.exit(1));
}

module.exports = { start };
