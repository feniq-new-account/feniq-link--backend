#!/usr/bin/env node
// Disposable localhost acceptance only. Never accepts a database URI or boots in production.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  // Match config/env's dotenv load BEFORE inspecting safety guards. Loading it
  // later must not introduce external credentials after those guards passed.
  require('dotenv').config({ quiet: true });
  if (process.env.NODE_ENV === 'production') throw new Error('Acceptance refuses production.');
  const scenario = process.env.FENIQ_ACCEPTANCE_SCENARIO || 'standard';
  if (!['standard', 'prelaunch'].includes(scenario)) throw new Error('Unknown isolated acceptance scenario.');
  const external = ['MONGODB_URI', 'FIREBASE_SERVICE_ACCOUNT_PATH', 'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL', 'TELEGRAM_BOT_TOKEN', 'SMS_PROVIDER_API_KEY'];
  if (external.some(key => process.env[key])) throw new Error('Acceptance needs an environment without external database/notification credentials.');
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 0) {
    throw new Error('Acceptance refuses an existing Mongoose connection.');
  }
  const output = path.resolve(process.env.FENIQ_ACCEPTANCE_OUTPUT || '');
  const repository = path.resolve(__dirname, '../../..');
  if (!process.env.FENIQ_ACCEPTANCE_OUTPUT || output === repository || output.startsWith(repository + path.sep)) {
    throw new Error('Set FENIQ_ACCEPTANCE_OUTPUT to a new private JSON file outside the repository.');
  }
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1/unused-acceptance';
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  const { startMemoryMongo, stopMemoryMongo } = require('../../test/helpers/mongo');
  const { generateAccounts, seedLaunchPreview } = require('../seed-launch-preview');
  let server, io;
  const dbName = 'feniq_launch_preview_acceptance';
  let temporaryStartAttempted = false;
  let ownsOutput = false;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    if (io) await new Promise(resolve => io.close(resolve));
    else if (server) await new Promise(resolve => server.close(resolve));
    const connection = mongoose.connection;
    if (temporaryStartAttempted && (connection.readyState === 0 ||
        (connection.name === dbName && ['127.0.0.1', 'localhost'].includes(connection.host)))) {
      await stopMemoryMongo();
    } else if (temporaryStartAttempted) {
      console.error('Acceptance refused cleanup of a connection it does not own.');
    }
    if (ownsOutput) await fs.rm(output, { force: true });
  };
  process.once('SIGTERM', () => stop().then(() => process.exit(0)));
  process.once('SIGINT', () => stop().then(() => process.exit(0)));
  try {
    // Reserve the path before any fixture is created; never overwrite another run.
    await fs.writeFile(output, '{}\n', { flag: 'wx', mode: 0o600 });
    ownsOutput = true;
    temporaryStartAttempted = true;
    await startMemoryMongo({ dbName, orderingOpen: false });
    if (mongoose.connection.name !== dbName || !['127.0.0.1', 'localhost'].includes(mongoose.connection.host)) {
      throw new Error('Acceptance did not acquire its own local temporary database.');
    }
    const accounts = generateAccounts();
    const summary = await seedLaunchPreview(accounts, { nodeEnv: 'test', confirmedDatabase: dbName });
    if (scenario === 'prelaunch') {
      // Only after ownership of the fresh localhost database has been proven
      // and the normal labelled fixture has completed. Never a production flag.
      await require('../../src/services/platformSettings.service').setApprovalRequired(true);
      const launch = require('../../src/services/launch.service');
      const current = await launch.readLaunch();
      await launch.saveLaunch(summary.users.admin.id, { mode: 'registration_only',
        message: '[DEMO] التسجيل والتصفح متاحان؛ استقبال الطلبات التجريبية متوقف.',
        revision: current.revision });
    }
    const port = Number(process.env.FENIQ_ACCEPTANCE_PORT || 5085);
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid acceptance port.');
    server = require('node:http').createServer(require('../../src/app'));
    io = require('../../src/realtime').initRealtime(server);
    await fs.writeFile(output, JSON.stringify({ environment: 'isolated-local-acceptance',
      api: `http://127.0.0.1:${port}/api`, scenario, accounts, summary }) + '\n', { mode: 0o600 });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    console.log(JSON.stringify({ ready: true, host: '127.0.0.1', port, database: dbName,
      fixtureCounts: summary.counts, scenario, production: false }));
  } catch (error) {
    await stop();
    throw error;
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
