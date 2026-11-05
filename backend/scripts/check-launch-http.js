#!/usr/bin/env node
// Public GET/OPTIONS observations only. Never authenticates or edits a setting.
const DEFAULT_API = 'https://feniq-connect-api.onrender.com/api';
const DEFAULT_WEB = 'https://feniq-connect-web.onrender.com';
const REJECTED_ORIGIN = 'https://feniq-untrusted-origin.invalid';

function checkedUrl(value, { allowLocal = false, originOnly = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error('INVALID_PREFLIGHT_URL'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(allowLocal && local && url.protocol === 'http:')) ||
      (originOnly && url.pathname !== '/')) throw new Error('INVALID_PREFLIGHT_URL');
  return originOnly ? url.origin : url.href.replace(/\/$/, '');
}

async function inspectHttp({ api = DEFAULT_API, webOrigin = DEFAULT_WEB, allowLocal = false, timeoutMs = 10000, fetchImpl = fetch } = {}) {
  const base = checkedUrl(api, { allowLocal });
  const origin = checkedUrl(webOrigin, { allowLocal, originOnly: true });
  const checks = [];
  async function observe(name, route, options, verify) {
    try {
      const response = await fetchImpl(base + route, { ...options, redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      checks.push({ name, ...(await verify(response)) });
    } catch (error) {
      checks.push({ name, passed: false, code: ['AbortError', 'TimeoutError'].includes(error.name) ? 'REQUEST_TIMEOUT' : 'REQUEST_FAILED' });
    }
  }
  await observe('api_health', '/health', { method: 'GET', headers: { accept: 'application/json' } }, async response => {
    if (response.status !== 200) return { passed: false, code: 'HEALTH_HTTP_ERROR', httpStatus: response.status };
    const body = await response.json();
    const passed = body.success === true && body.db === 'connected';
    return { passed, code: passed ? 'HEALTH_READY' : 'HEALTH_NOT_READY' };
  });
  await observe('registration_only', '/app/status', { method: 'GET', headers: { accept: 'application/json' } }, async response => {
    if (response.status !== 200) return { passed: false, code: 'LAUNCH_HTTP_ERROR', httpStatus: response.status };
    const body = await response.json();
    const status = body.status;
    const passed = status?.mode === 'registration_only' && status.orderingEnabled === false;
    return { passed, code: passed ? 'REGISTRATION_ONLY' : 'LAUNCH_SETTING_REVIEW_REQUIRED' };
  });
  function corsOptions(requestOrigin) {
    return { method: 'OPTIONS', headers: { origin: requestOrigin,
      'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } };
  }
  await observe('warehouse_web_cors', '/auth/login-password', corsOptions(origin), async response => {
    const methods = (response.headers.get('access-control-allow-methods') || '').toUpperCase().split(',').map(x => x.trim());
    const headers = (response.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map(x => x.trim());
    const passed = [200, 204].includes(response.status) && response.headers.get('access-control-allow-origin') === origin &&
      (methods.includes('POST') || methods.includes('*')) && (headers.includes('content-type') || headers.includes('*'));
    return { passed, code: passed ? 'WAREHOUSE_WEB_ALLOWED' : 'WAREHOUSE_WEB_CORS_REVIEW_REQUIRED' };
  });
  await observe('untrusted_origin_cors', '/auth/login-password', corsOptions(REJECTED_ORIGIN), async response => {
    const value = response.headers.get('access-control-allow-origin');
    const passed = value !== REJECTED_ORIGIN && value !== '*';
    return { passed, code: passed ? 'UNTRUSTED_ORIGIN_NOT_ALLOWED' : 'UNTRUSTED_ORIGIN_ALLOWED' };
  });
  return { readOnly: true, scope: ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname) ? 'local' : 'remote',
    apiChecksPassed: checks.every(check => check.passed), checks,
    notVerified: ['registration_unique_index', 'approval_setting', 'signed_apk_public_download', 'real_phone_upgrade', 'target_network_download'] };
}

async function cli(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node backend/scripts/check-launch-http.js [--api URL] [--web-origin ORIGIN] [--allow-local]\nReads health, launch status and CORS only; success is not full production acceptance.');
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--allow-local') options.allowLocal = true;
    else if (['--api', '--web-origin'].includes(args[i]) && args[i + 1]) {
      const key = args[i] === '--api' ? 'api' : 'webOrigin';
      options[key] = args[++i];
    }
    else throw new Error('INVALID_PREFLIGHT_ARGUMENT');
  }
  const result = await inspectHttp(options);
  console.log(JSON.stringify(result));
  if (!result.apiChecksPassed) process.exitCode = 1;
}
if (require.main === module) cli(process.argv.slice(2)).catch(() => {
  console.error('HTTP preflight could not complete. No setting was changed.'); process.exitCode = 1;
});
module.exports = { inspectHttp, checkedUrl };
