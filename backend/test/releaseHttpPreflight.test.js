const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { inspectHttp, checkedUrl } = require('../scripts/check-launch-http');
const ORIGIN = 'https://warehouse.example';
async function fixture(options, check) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, cookie: req.headers.cookie });
    if (req.method === 'OPTIONS') {
      if (req.headers.origin === ORIGIN || options.reflectUntrusted) {
        res.setHeader('access-control-allow-origin', req.headers.origin);
        res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
        res.setHeader('access-control-allow-headers', 'content-type');
      }
      res.writeHead(204); res.end(); return;
    }
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/health') {
      if (options.redirect) { res.writeHead(302, { location: '/should-not-be-followed' }); res.end(); return; }
      res.writeHead(options.unready ? 503 : 200);
      res.end(JSON.stringify({ success: !options.unready, db: options.unready ? 'disconnected' : 'connected' })); return;
    }
    if (req.url === '/api/app/status') {
      res.end(JSON.stringify({ status: { mode: options.ordering ? 'ordering_open' : 'registration_only', orderingEnabled: !!options.ordering } })); return;
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await check(await inspectHttp({ api: `http://127.0.0.1:${server.address().port}/api`, webOrigin: ORIGIN, allowLocal: true }), requests);
  } finally { await new Promise(resolve => server.close(resolve)); }
}
test('healthy registration-only API passes public checks using unauthenticated GET/OPTIONS only', async () => {
  await fixture({}, async (report, requests) => {
    assert.equal(report.apiChecksPassed, true);
    assert.equal(report.readOnly, true); assert.equal(report.scope, 'local');
    assert.equal(requests.length, 4);
    assert.ok(requests.every(row => ['GET', 'OPTIONS'].includes(row.method) && !row.authorization && !row.cookie));
    assert.ok(report.notVerified.includes('real_phone_upgrade'));
    assert.ok(report.notVerified.includes('registration_unique_index'));
  });
});
test('a 503 startup failure or open ordering cannot be mistaken for launch readiness', async () => {
  for (const options of [{ unready: true }, { ordering: true }]) await fixture(options, async report => {
    assert.equal(report.apiChecksPassed, false);
  });
});
test('reflecting an untrusted origin fails the CORS observation', async () => {
  await fixture({ reflectUntrusted: true }, async report => {
    assert.equal(report.apiChecksPassed, false);
    assert.equal(report.checks.find(row => row.name === 'untrusted_origin_cors').code, 'UNTRUSTED_ORIGIN_ALLOWED');
  });
});
test('health redirects are not followed', async () => {
  await fixture({ redirect: true }, async (report, requests) => {
    assert.equal(report.apiChecksPassed, false);
    assert.equal(requests.some(row => row.url === '/should-not-be-followed'), false);
  });
});
test('credential-bearing, insecure and malformed URLs fail before making any request', async () => {
  let requests = 0;
  for (const api of ['https://user:private@example.com/api', 'https://example.com/api?token=private', 'http://example.com/api', 'not-a-url']) {
    await assert.rejects(inspectHttp({ api, fetchImpl: async () => { requests++; } }), /INVALID_PREFLIGHT_URL/);
  }
  assert.equal(requests, 0);
  assert.throws(() => checkedUrl('https://warehouse.example/path', { originOnly: true }), /INVALID_PREFLIGHT_URL/);
});
test('network errors are sanitized rather than echoing a credential-bearing exception', async () => {
  const report = await inspectHttp({ fetchImpl: async () => { throw new Error('private-token-sentinel'); } });
  assert.equal(report.apiChecksPassed, false);
  assert.equal(JSON.stringify(report).includes('private-token-sentinel'), false);
});
