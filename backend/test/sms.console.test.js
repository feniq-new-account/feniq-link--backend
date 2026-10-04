// The console SMS transport must never print a verification code outside
// development: on Render the logs are readable by anyone with dashboard
// access, and a printed code is a password reset for that pharmacy.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-console-sms-tests-0123456789';

const test = require('node:test');
const assert = require('node:assert');
const env = require('../src/config/env');
const { ConsoleSmsProvider, maskPhone } = require('../src/services/sms/consoleSmsProvider');

async function captureLogs(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines;
}

async function sendUnder(nodeEnv) {
  const previous = env.nodeEnv;
  env.nodeEnv = nodeEnv;
  try {
    return await captureLogs(() =>
      new ConsoleSmsProvider().send('0931234567', 'Your Feniq verification code is 482913. It expires in 5 minutes.')
    );
  } finally {
    env.nodeEnv = previous;
  }
}

test('production: the code and the full number never reach the log', async () => {
  const lines = await sendUnder('production');
  const output = lines.join('\n');
  assert.ok(!output.includes('482913'), `code leaked into the log: ${output}`);
  assert.ok(!output.includes('0931234567'), 'the full phone number should be masked');
  assert.match(output, /\*+4567/, 'a masked number is still logged for diagnosis');
});

test('any non-development environment (staging, test) is treated like production', async () => {
  for (const nodeEnv of ['test', 'staging', '']) {
    const output = (await sendUnder(nodeEnv)).join('\n');
    assert.ok(!output.includes('482913'), `code leaked under NODE_ENV=${nodeEnv}`);
  }
});

test('development: the message is printed so the flow works locally', async () => {
  const output = (await sendUnder('development')).join('\n');
  assert.ok(output.includes('482913'));
  assert.ok(output.includes('0931234567'));
});

test('maskPhone keeps only the last four digits', () => {
  assert.strictEqual(maskPhone('0931234567'), '******4567');
  assert.strictEqual(maskPhone('12'), '****');
  assert.strictEqual(maskPhone(undefined), '****');
});
