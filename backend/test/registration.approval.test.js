// Registration approval end to end, over HTTP against the real app: the
// syndicate list upload, the check every new pharmacy goes through, the
// approval switch, and the admins' Telegram bot (with Telegram itself faked
// at telegram.service.js's transport).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-registration-approval-tests';
process.env.NODE_ENV = 'test';
process.env.PUBLIC_API_URL = 'https://api.example.test';
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.REQUIRE_ACCOUNT_APPROVAL;

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const telegram = require('../src/services/telegram.service');

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BOT_TOKEN = `123456789:${'A'.repeat(35)}`;
const ADMIN_CHAT = 5550001;

let server;
let baseUrl;
let adminToken;
let adminId;
let phoneCounter = 0;

// ------------------------------------------------------------ fake Telegram

const telegramCalls = [];
telegram._setTransport(async (botToken, method, payload) => {
  telegramCalls.push({ botToken, method, payload });
  if (method === 'getMe') return { ok: true, result: { username: 'feniq_test_bot' } };
  if (method === 'sendMessage') return { ok: true, result: { message_id: telegramCalls.length } };
  return { ok: true, result: true };
});
const callsTo = (method) => telegramCalls.filter((c) => c.method === method);

async function waitFor(predicate, ms = 3000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

// ------------------------------------------------------------------ http

async function call(method, path, { body, token, form, headers = {} } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(form ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function register(overrides = {}) {
  phoneCounter += 1;
  return call('POST', '/auth/register', {
    body: {
      name: 'سامي خوري',
      pharmacyName: 'صيدلية السلام',
      phone: `09520${String(10000 + phoneCounter).slice(-5)}`,
      address: 'شارع بغداد',
      areaType: 'city',
      password: 'Password123',
      confirmPassword: 'Password123',
      ...overrides,
    },
  });
}

async function statusOf(phone) {
  return (await User.findOne({ phone }).select('status').lean()).status;
}

// The cleaned workbook's shape: region pages (an "اسم الصيدلاني" column with
// neighbourhood heading rows in between) before the full "كل الصيدليات" table.
async function listWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  const region = workbook.addWorksheet('مدينة اللاذقية');
  region.addRow(['مدينة اللاذقية — 2 صيدلية']);
  region.addRow(['رجوع للملخص']);
  region.addRow(['#', 'اسم الصيدلاني', 'اسم الأب', 'اسم الصيدلية', 'الموبايل', 'العنوان بالتفصيل', 'ملاحظات']);
  region.addRow(['  الشيخ ضاهر', null, null, null, null, '1 صيدلية']);
  const flat = workbook.addWorksheet('كل الصيدليات');
  flat.addRow(['#', 'المنطقة', 'الحي / القرية', 'اسم الصيدلاني', 'اسم الأب', 'اسم الصيدلية', 'الموبايل', 'موبايل آخر', 'العنوان بالتفصيل', 'ملاحظات', 'رقم السطر بالملف الأصلي']);
  rows.forEach((r, i) => flat.addRow([i + 1, r.region, r.place, r.name, r.father, r.pharmacy, r.phone, r.phone2 || '', r.address || '', r.notes || '', 100 + i]));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const LIST = [
  { region: 'مدينة اللاذقية', place: 'الشيخ ضاهر', name: 'ياسمين شغري', father: 'سمير', pharmacy: 'صيدلية ياسمين', phone: '0999000111' },
  { region: 'ريف اللاذقية', place: 'مشيرفة الساموك', name: 'العصماء جابر محمد', father: 'جابر', pharmacy: 'صيدلية الاء', phone: '0944000222' },
  { region: 'مدينة اللاذقية', place: 'سقوبين', name: 'بتول مكنا', father: 'فراس', pharmacy: 'صيدلية البتول', phone: '', notes: 'مكتوب جنبه «إلغاء» بالملف' },
  { region: 'مدينة جبلة', place: 'العمارة', name: 'رامي حداد', father: 'نبيل', pharmacy: '', phone: '0933000444', phone2: '963988000555' },
];

function uploadForm(buffer, name = 'list.xlsx', type = XLSX) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), name);
  return form;
}

// ----------------------------------------------------------------- setup

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-registration-approval-test' });
  await Pharmacy.syncIndexes();
  const admin = await User.create({ name: 'Owner', phone: '0911000000', role: 'admin', status: 'active' });
  adminId = admin._id;
  adminToken = jwt.sign({ sub: String(admin._id), role: 'admin' }, env.jwtSecret, { expiresIn: '1h' });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  telegram._setTransport(null);
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

// ----------------------------------------------------------------- tests

test('starts with no list, approval off and no bot', async () => {
  const { status, body } = await call('GET', '/admin/registration', { token: adminToken });
  assert.strictEqual(status, 200);
  assert.strictEqual(body.registry.count, 0);
  assert.strictEqual(body.approvalRequired, false);
  assert.strictEqual(body.telegram.configured, false);
});

test('the registration page is admin-only', async () => {
  const pharmacist = await User.create({ name: 'p', phone: '0911000009', role: 'pharmacy', status: 'active' });
  const token = jwt.sign({ sub: String(pharmacist._id), role: 'pharmacy' }, env.jwtSecret);
  assert.strictEqual((await call('GET', '/admin/registration', { token })).status, 403);
});

test('with approval off everyone gets in, and the check is still recorded', async () => {
  const { status, body } = await register();
  assert.strictEqual(status, 201, JSON.stringify(body));
  assert.strictEqual(body.user.status, 'active');
  const pharmacy = await Pharmacy.findOne({ phone: body.user.phone }).lean();
  assert.strictEqual(pharmacy.syndicateMatch.decision, 'review');
  assert.deepStrictEqual(pharmacy.syndicateMatch.reasons, ['قائمة النقابة لسّا ما انرفعت']);
});

test('with approval on and no list yet, a registration waits', async () => {
  const on = await call('PUT', '/admin/registration/approval', { token: adminToken, body: { required: true } });
  assert.strictEqual(on.status, 200);
  const { body } = await register({ name: 'العصماء محمد', pharmacyName: 'صيدلية الاء', phone: '0955000001' });
  assert.strictEqual(body.user.status, 'pending');
});

test('a file that is not the list is refused and the old list stays', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('x').addRow(['اسم', 'هاتف']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const { status, body } = await call('POST', '/admin/registration/syndicate-list', { token: adminToken, form: uploadForm(buffer) });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.code, 'SYNDICATE_FILE_NO_NAME_COLUMN');
});

test('uploading the list reads the full table and lets in whoever was waiting and is on it', async () => {
  // A phone's file picker may send an .xlsx as a generic binary.
  const form = uploadForm(await listWorkbook(LIST), 'صيدليات.xlsx', 'application/octet-stream');
  const { status, body } = await call('POST', '/admin/registration/syndicate-list', { token: adminToken, form });
  assert.strictEqual(status, 200, JSON.stringify(body));
  assert.strictEqual(body.imported, LIST.length);
  assert.strictEqual(body.autoApproved, 1);
  assert.strictEqual(await statusOf('0955000001'), 'active');

  const page = await call('GET', '/admin/registration', { token: adminToken });
  assert.strictEqual(page.body.registry.count, LIST.length);
  assert.strictEqual(page.body.registry.lastImport.fileName, 'صيدليات.xlsx');
});

test('the admin can try a name against the list', async () => {
  const { body } = await call('POST', '/admin/registration/check', {
    token: adminToken,
    body: { name: 'د. رامي نبيل حداد' },
  });
  assert.strictEqual(body.result.decision, 'approved');
  assert.strictEqual(body.result.pharmacistName, 'رامي حداد');
  assert.deepStrictEqual(body.result.phones, ['0933000444', '0988000555']);
});

test('a listed pharmacist is let in at once, typo and "صيدلية" included', async () => {
  const { body } = await register({ name: 'ياسمن شغري', pharmacyName: 'صيدلية ياسمين شغري', phone: '0966000001' });
  assert.strictEqual(body.user.status, 'active');
  const pharmacy = await Pharmacy.findOne({ phone: '0966000001' }).lean();
  assert.strictEqual(pharmacy.syndicateMatch.decision, 'approved');
  assert.strictEqual(pharmacy.syndicateMatch.pharmacistName, 'ياسمين شغري');
  assert.strictEqual(pharmacy.syndicateMatch.place, 'الشيخ ضاهر');
});

test('a second account claiming the same listed pharmacist waits', async () => {
  const { body } = await register({ name: 'ياسمين شغري', phone: '0966000002' });
  assert.strictEqual(body.user.status, 'pending');
  const pharmacy = await Pharmacy.findOne({ phone: '0966000002' }).lean();
  assert.ok(pharmacy.syndicateMatch.reasons.some((r) => r.includes('انقبل قبل هيك')));
});

test('a listed name marked "إلغاء" waits', async () => {
  const { body } = await register({ name: 'بتول مكنا', phone: '0966000003' });
  assert.strictEqual(body.user.status, 'pending');
});

test('the listed mobile number plus a close name is enough', async () => {
  const { body } = await register({ name: 'رامي', pharmacyName: 'صيدلية جديدة', phone: '0933000444' });
  assert.strictEqual(body.user.status, 'active');
});

test('someone not on the list waits, with nothing rejected automatically', async () => {
  const { body } = await register({ name: 'جورج عيسى', pharmacyName: 'صيدلية النور', phone: '0966000004' });
  assert.strictEqual(body.user.status, 'pending');
  const accounts = await call('GET', '/admin/accounts?status=pending&role=pharmacy', { token: adminToken });
  const row = accounts.body.accounts.find((a) => a.user.phone === '0966000004');
  assert.strictEqual(row.pharmacy.syndicateMatch.decision, 'review');
  assert.deepStrictEqual(row.pharmacy.syndicateMatch.reasons, ['الاسم مش موجود بقائمة النقابة']);
});

// --------------------------------------------------------------- telegram

test('a wrong bot token is refused before it is kept', async () => {
  const { status, body } = await call('PUT', '/admin/registration/telegram/bot', { token: adminToken, body: { token: 'hello' } });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.code, 'TELEGRAM_TOKEN_INVALID');
});

test('a good bot token is kept and Telegram is pointed at our webhook with a secret', async () => {
  const { status, body } = await call('PUT', '/admin/registration/telegram/bot', { token: adminToken, body: { token: BOT_TOKEN } });
  assert.strictEqual(status, 200, JSON.stringify(body));
  assert.strictEqual(body.username, 'feniq_test_bot');
  assert.strictEqual(body.webhookReady, true);
  const [hook] = callsTo('setWebhook');
  assert.strictEqual(hook.payload.url, 'https://api.example.test/api/telegram/webhook');
  assert.strictEqual(hook.payload.secret_token, telegram._webhookSecret(BOT_TOKEN));

  const page = await call('GET', '/admin/registration', { token: adminToken });
  assert.strictEqual(page.body.telegram.configured, true);
  assert.strictEqual(page.body.telegram.source, 'panel');
  assert.strictEqual(page.body.telegram.linked, false);
});

function webhook(update, secret = telegram._webhookSecret(BOT_TOKEN)) {
  return call('POST', '/telegram/webhook', {
    body: update,
    headers: secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {},
  });
}

let linkToken;

test('the webhook refuses deliveries without the secret', async () => {
  assert.strictEqual((await webhook({ message: {} }, null)).status, 401);
  assert.strictEqual((await webhook({ message: {} }, 'x'.repeat(64))).status, 401);
});

test('opening the one-time link from the panel ties the admin to that Telegram chat', async () => {
  const { body } = await call('POST', '/admin/registration/telegram/link', { token: adminToken });
  assert.ok(body.url.startsWith('https://t.me/feniq_test_bot?start='), body.url);
  linkToken = body.url.split('start=')[1];

  const res = await webhook({ message: { chat: { id: ADMIN_CHAT, type: 'private' }, from: { id: ADMIN_CHAT }, text: `/start ${linkToken}` } });
  assert.strictEqual(res.status, 200);
  const admin = await User.findById(adminId).select('telegramChatId').lean();
  assert.strictEqual(admin.telegramChatId, ADMIN_CHAT);
  assert.ok(callsTo('sendMessage').at(-1).payload.text.startsWith('تم الربط'));
});

test('the same link does not work twice', async () => {
  await webhook({ message: { chat: { id: 777, type: 'private' }, from: { id: 777 }, text: `/start ${linkToken}` } });
  assert.ok(callsTo('sendMessage').at(-1).payload.text.includes('منتهي'));
  assert.strictEqual(await User.countDocuments({ telegramChatId: 777 }), 0);
});

let waitingUserId;

test('a waiting registration reaches the admin with approve / reject buttons', async () => {
  const before = callsTo('sendMessage').length;
  const { body } = await register({ name: 'ليلى حسن', pharmacyName: 'صيدلية الياسمين', phone: '0966000005' });
  waitingUserId = body.user.id;
  assert.ok(await waitFor(() => callsTo('sendMessage').length > before));
  const message = callsTo('sendMessage').at(-1).payload;
  assert.strictEqual(message.chat_id, ADMIN_CHAT);
  assert.ok(message.text.includes('بانتظار موافقتك'));
  assert.ok(message.text.includes('0966000005'));
  const buttons = message.reply_markup.inline_keyboard[0].map((b) => b.callback_data);
  assert.deepStrictEqual(buttons, [`acc:approve:${waitingUserId}`, `acc:reject:${waitingUserId}`]);
});

function press(data, fromId = ADMIN_CHAT) {
  return webhook({
    callback_query: {
      id: `cb-${Math.random()}`,
      from: { id: fromId },
      data,
      message: { message_id: 42, chat: { id: fromId }, text: 'صيدلية جديدة', entities: [{ type: 'bold', offset: 0, length: 5 }] },
    },
  });
}

test('a button pressed by someone who is not a linked admin does nothing', async () => {
  await press(`acc:approve:${waitingUserId}`, 999);
  assert.strictEqual(await statusOf('0966000005'), 'pending');
  assert.ok(callsTo('answerCallbackQuery').at(-1).payload.text.includes('خاص بإدارة'));
});

test('the admin approves from Telegram and the message shows who did it', async () => {
  await press(`acc:approve:${waitingUserId}`);
  assert.strictEqual(await statusOf('0966000005'), 'active');
  const edit = callsTo('editMessageText').at(-1).payload;
  assert.ok(edit.text.endsWith('✅ انقبل — Owner'), edit.text);
  assert.deepStrictEqual(edit.entities, [{ type: 'bold', offset: 0, length: 5 }]);
  assert.strictEqual(edit.reply_markup.inline_keyboard[0][0].callback_data, `acc:block:${waitingUserId}`);
});

test('pressing again after a decision changes nothing and says so', async () => {
  await press(`acc:reject:${waitingUserId}`);
  assert.strictEqual(await statusOf('0966000005'), 'active');
  assert.ok(callsTo('answerCallbackQuery').at(-1).payload.text.includes('ما تغيّر شي'));
});

test('/pending lists who is still waiting', async () => {
  const before = callsTo('sendMessage').length;
  await webhook({ message: { chat: { id: ADMIN_CHAT, type: 'private' }, from: { id: ADMIN_CHAT }, text: '/pending' } });
  const sent = callsTo('sendMessage').slice(before);
  const waiting = await User.countDocuments({ role: 'pharmacy', status: 'pending' });
  assert.strictEqual(sent.length, waiting);
  assert.ok(sent.every((m) => m.payload.reply_markup.inline_keyboard[0][0].text === '✅ قبول'));
});

test('a stranger messaging the bot is told it is private', async () => {
  await webhook({ message: { chat: { id: 31337, type: 'private' }, from: { id: 31337 }, text: '/pending' } });
  assert.strictEqual(callsTo('sendMessage').at(-1).payload.text, 'هالبوت خاص بإدارة فينيق.');
});

test('switching approval off lets in everyone still waiting', async () => {
  const waiting = await User.countDocuments({ role: 'pharmacy', status: 'pending' });
  assert.ok(waiting > 0);
  const { body } = await call('PUT', '/admin/registration/approval', { token: adminToken, body: { required: false } });
  assert.strictEqual(body.released, waiting);
  assert.strictEqual(await User.countDocuments({ role: 'pharmacy', status: 'pending' }), 0);
});
