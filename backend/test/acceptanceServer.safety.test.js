const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const server = path.resolve(__dirname, '../scripts/acceptance/server.js');
const excluded = ['NODE_ENV', 'MONGODB_URI', 'JWT_SECRET', 'FIREBASE_SERVICE_ACCOUNT_PATH',
  'FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL', 'TELEGRAM_BOT_TOKEN',
  'SMS_PROVIDER_API_KEY', 'FENIQ_ACCEPTANCE_OUTPUT'];

function refused({ env = {}, dotenv = '', args } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'feniq-acceptance-safety-'));
  const output = path.join(directory, 'credentials.json');
  try {
    if (dotenv) fs.writeFileSync(path.join(directory, '.env'), dotenv, { mode: 0o600 });
    const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !excluded.includes(key)));
    const result = spawnSync(process.execPath, args || [server], { cwd: directory, encoding: 'utf8', timeout: 10000,
      env: { ...clean, NODE_ENV: 'test', FENIQ_ACCEPTANCE_OUTPUT: output, ...env } });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(fs.existsSync(output), false, 'refused starts never write credentials or create a fixture');
    return result.stderr;
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('acceptance refuses production before creating a fixture', () => {
  assert.match(refused({ env: { NODE_ENV: 'production' } }), /refuses production/);
});
test('acceptance refuses a configured external database without connecting to it', () => {
  assert.match(refused({ env: { MONGODB_URI: 'mongodb://invalid.example/never-connect' } }), /external database/);
});
test('dotenv notification credentials are checked before fixture creation', () => {
  assert.match(refused({ dotenv: 'TELEGRAM_BOT_TOKEN=local-safety-sentinel\n' }), /notification credentials/);
});
test('acceptance refuses an already-open Mongoose connection without cleanup', () => {
  const code = `const mongoose=require(process.argv[1]);
    Object.defineProperty(mongoose.connection,'readyState',{get:()=>1});
    mongoose.connection.dropDatabase=()=>{throw new Error('FOREIGN_CLEANUP_CALLED');};
    require(process.argv[2]).main().catch(error=>{console.error(error.message);process.exitCode=1;});`;
  const message = refused({ args: ['-e', code, require.resolve('mongoose'), server] });
  assert.match(message, /existing Mongoose connection/);
  assert.doesNotMatch(message, /FOREIGN_CLEANUP_CALLED/);
});
