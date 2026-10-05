// The forced password change after an admin reset, driven over real HTTP.
//
// An admin reset (POST /auth/admin/reset-password/:userId) hands the user a
// temporary password the admin has seen. The account is flagged
// mustChangePassword so the pharmacy app shows nothing but the change-password
// screen on the next sign-in; any password the user then sets themselves
// (change-password, or the OTP forgot/reset flow) clears it.
//
// The flag only travels on the user's OWN auth responses (login, refresh, me,
// change-password). It is not part of the shared serializeUser, so the admin
// account lists keep their shape (projection.select.test.js pins that).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-must-change-password';
process.env.NODE_ENV = 'test';
// Many logins from one address in a short time - the credential limiters are
// driven for real by ratelimit.test.js, not here.
process.env.DISABLE_AUTH_RATE_LIMIT = '1';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const bcrypt = require('bcrypt');

const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');

const app = require('../src/app');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const FinancialAuditLog = require('../src/models/financialAuditLog.model');
const { registerSmsProvider, _resetSmsProviders } = require('../src/services/sms');
const { SmsProvider } = require('../src/services/sms/smsProvider');

const ADMIN_PASSWORD = 'admin-password-123';
const ADMIN_PHONE = '0933000001';

let server;
let baseUrl;
let phoneCounter = 0;
let adminToken;

const sent = [];
class RecordingSmsProvider extends SmsProvider {
  get name() {
    return 'test-recorder';
  }
  async send(phone, message) {
    sent.push({ phone, message });
  }
}

function lastCodeFor(phone) {
  const entry = [...sent].reverse().find((m) => m.phone === phone);
  const match = entry && entry.message.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

async function call(method, path, { body, token } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function login(phone, password) {
  return call('POST', '/auth/login-password', { body: { phone, password } });
}

// An active pharmacy with its profile row, as an admin-approved account looks.
async function createPharmacy(password = 'pharmacy-pass-1') {
  phoneCounter += 1;
  const phone = `09331${String(10000 + phoneCounter).slice(-5)}`;
  const user = await User.create({
    name: 'Forced Change Pharmacy',
    phone,
    password: await bcrypt.hash(password, 10),
    role: 'pharmacy',
    status: 'active',
  });
  await Pharmacy.create({
    userId: user._id,
    nameAr: 'صيدلية',
    nameEn: 'Pharmacy',
    ownerName: 'Owner',
    address: 'Street',
    city: 'Latakia',
    areaType: 'city',
    phone,
    addedBy: 'self',
  });
  return { user, phone, password };
}

async function adminReset(userId, newPassword) {
  const res = await call('POST', `/auth/admin/reset-password/${userId}`, {
    token: adminToken,
    body: { newPassword },
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  return res;
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-must-change-password-test' });
  registerSmsProvider('test-recorder', () => new RecordingSmsProvider());
  require('../src/config/env').sms.provider = 'test-recorder';
  _resetSmsProviders();

  await User.create({
    name: 'Admin',
    phone: ADMIN_PHONE,
    password: await bcrypt.hash(ADMIN_PASSWORD, 10),
    role: 'admin',
    status: 'active',
  });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  adminToken = (await login(ADMIN_PHONE, ADMIN_PASSWORD)).body.token;

});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

test('a normal account signs in with mustChangePassword false', async () => {
  const { phone, password } = await createPharmacy();

  const signedIn = await login(phone, password);
  assert.strictEqual(signedIn.status, 200);
  assert.strictEqual(signedIn.body.user.mustChangePassword, false);

  const me = await call('GET', '/auth/me', { token: signedIn.body.token });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.user.mustChangePassword, false);
});

test('an account that predates the field reads as false and can sign in', async () => {
  const { user, phone, password } = await createPharmacy();
  await User.collection.updateOne({ _id: user._id }, { $unset: { mustChangePassword: '' } });
  const raw = await User.collection.findOne({ _id: user._id });
  assert.strictEqual('mustChangePassword' in raw, false);

  const signedIn = await login(phone, password);
  assert.strictEqual(signedIn.status, 200);
  assert.strictEqual(signedIn.body.user.mustChangePassword, false);
});

test('an admin reset flags the account, on login, refresh and /me', async () => {
  const { user, phone } = await createPharmacy();
  const temporary = 'TempPass7xKq';

  const reset = await adminReset(user._id, temporary);
  assert.strictEqual(reset.body.mustChangePassword, undefined, 'the admin response stays as it was');

  const signedIn = await login(phone, temporary);
  assert.strictEqual(signedIn.status, 200);
  assert.strictEqual(signedIn.body.user.mustChangePassword, true);

  const me = await call('GET', '/auth/me', { token: signedIn.body.token });
  assert.strictEqual(me.body.user.mustChangePassword, true);

  const refreshed = await call('POST', '/auth/refresh', {
    body: { refreshToken: signedIn.body.refreshToken },
  });
  assert.strictEqual(refreshed.status, 200, JSON.stringify(refreshed.body));
  assert.strictEqual(refreshed.body.user.mustChangePassword, true);

  const audit = await FinancialAuditLog.findOne({
    action: 'account.password_reset',
    entityId: user._id,
  }).lean();
  assert.strictEqual(audit.after.mustChangePassword, true);
});

test('changing the password clears the flag and returns a working session', async () => {
  const { user, phone } = await createPharmacy();
  const temporary = 'TempPass8yLm';
  const chosen = 'my-own-password-9';
  await adminReset(user._id, temporary);

  const signedIn = (await login(phone, temporary)).body;
  const changed = await call('POST', '/auth/change-password', {
    token: signedIn.token,
    body: { currentPassword: temporary, newPassword: chosen, confirmPassword: chosen },
  });
  assert.strictEqual(changed.status, 200, JSON.stringify(changed.body));
  assert.strictEqual(changed.body.user.mustChangePassword, false);
  assert.ok(changed.body.token && changed.body.refreshToken);

  const me = await call('GET', '/auth/me', { token: changed.body.token });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.user.mustChangePassword, false);

  // The temporary password is dead; the chosen one signs in unflagged.
  assert.strictEqual((await login(phone, temporary)).status, 401);
  const again = await login(phone, chosen);
  assert.strictEqual(again.status, 200);
  assert.strictEqual(again.body.user.mustChangePassword, false);
});

test('a failed change keeps the flag', async () => {
  const { user, phone } = await createPharmacy();
  const temporary = 'TempPass3zRw';
  await adminReset(user._id, temporary);
  const signedIn = (await login(phone, temporary)).body;

  const wrongCurrent = await call('POST', '/auth/change-password', {
    token: signedIn.token,
    body: { currentPassword: 'not-it-at-all', newPassword: 'my-own-password-9' },
  });
  assert.strictEqual(wrongCurrent.status, 401);

  const sameAsTemporary = await call('POST', '/auth/change-password', {
    token: signedIn.token,
    body: { currentPassword: temporary, newPassword: temporary },
  });
  assert.strictEqual(sameAsTemporary.status, 400);
  assert.strictEqual(sameAsTemporary.body.code, 'PASSWORD_UNCHANGED');

  const stored = await User.findById(user._id).select('mustChangePassword').lean();
  assert.strictEqual(stored.mustChangePassword, true);
});

test('the OTP forgot/reset flow also clears the flag', async () => {
  const { user, phone } = await createPharmacy();
  await adminReset(user._id, 'TempPass4aBc');

  await call('POST', '/auth/forgot-password', { body: { phone } });
  const code = lastCodeFor(phone);
  assert.ok(code);
  const chosen = 'otp-chosen-pass-5';
  const reset = await call('POST', '/auth/reset-password', {
    body: { phone, otpCode: code, password: chosen, confirmPassword: chosen },
  });
  assert.strictEqual(reset.status, 200, JSON.stringify(reset.body));

  const signedIn = await login(phone, chosen);
  assert.strictEqual(signedIn.status, 200);
  assert.strictEqual(signedIn.body.user.mustChangePassword, false);
});

test('the admin account list does not carry the flag', async () => {
  const { user } = await createPharmacy();
  await adminReset(user._id, 'TempPass6dEf');

  const authViewModel = require('../src/viewmodels/auth.viewmodel');
  const stored = await User.findById(user._id).lean();
  assert.strictEqual(stored.mustChangePassword, true);
  assert.strictEqual('mustChangePassword' in authViewModel.serializeUser(stored), false);
});
