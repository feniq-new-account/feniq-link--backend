// Field reps: a warehouse creates its reps, assigns pharmacies to them, orders
// carry the rep that covered the pharmacy when they were placed, and a rep
// logs a visit by scanning the pharmacy's QR - which only counts when the
// phone is actually at the pharmacy.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-reps';
process.env.NODE_ENV = 'test';
process.env.DISABLE_AUTH_RATE_LIMIT = '1';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const bcrypt = require('bcrypt');

const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');

const app = require('../src/app');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const Order = require('../src/models/order.model');
const RepAssignment = require('../src/models/repAssignment.model');
const orderService = require('../src/services/order.service');
const { judgeVisit } = require('../src/services/repPortal.service');
const { parseVisitCode } = require('../src/services/pharmacyVisitCode.service');

const WAREHOUSE_PASSWORD = 'warehouse-pass-1';
const PHARMACY_PASSWORD = 'pharmacy-pass-1';
const REP_PASSWORD = 'rep-temp-pass';
// Latakia. GeoJSON order: [longitude, latitude].
const PHARMACY_POINT = [35.7915, 35.5196];
// ~50 m north of the pharmacy, and ~1.1 km north.
const NEAR = { latitude: 35.5196 + 0.00045, longitude: 35.7915 };
const FAR = { latitude: 35.5196 + 0.01, longitude: 35.7915 };

let server;
let baseUrl;
let phoneCounter = 0;
const ctx = {};

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

async function login(phone, password) {
  const res = await call('POST', '/auth/login-password', { body: { phone, password } });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

function nextLocalPhone() {
  phoneCounter += 1;
  return `0944${String(100000 + phoneCounter).slice(-6)}`;
}

async function createWarehouse(nameEn) {
  const phone = nextLocalPhone();
  const user = await User.create({
    name: nameEn, phone, password: await bcrypt.hash(WAREHOUSE_PASSWORD, 10), role: 'warehouse', status: 'active',
  });
  const warehouse = await Warehouse.create({
    userId: user._id, nameAr: 'مستودع', nameEn, address: 'r', city: 'Latakia', phone,
    deliveryType: 'self', requireDeliverySealPhoto: false, isActive: true, discountRate: 0, commissionRate: 0,
  });
  const product = await Product.create({
    warehouseId: warehouse._id, nameAr: 'دواء', nameEn: 'Drug', manufacturerAr: 'شركة',
    price: 2, unitAr: 'علبة', unitEn: 'box', isAvailable: true, isActive: true,
  });
  return { user, warehouse, product, token: await login(phone, WAREHOUSE_PASSWORD) };
}

async function createPharmacy(nameAr, { withLocation = true } = {}) {
  const phone = `+963${nextLocalPhone().slice(1)}`;
  const user = await User.create({
    name: nameAr, phone, password: await bcrypt.hash(PHARMACY_PASSWORD, 10), role: 'pharmacy', status: 'active',
  });
  const pharmacy = await Pharmacy.create({
    userId: user._id, nameAr, nameEn: 'Pharmacy', ownerName: 'د. مالك', address: 'شارع', city: 'Latakia',
    areaType: 'city', phone, addedBy: 'self',
    ...(withLocation ? { location: { type: 'Point', coordinates: PHARMACY_POINT } } : {}),
  });
  return { user, pharmacy, token: await login(phone, PHARMACY_PASSWORD) };
}

async function createRep(warehouseToken, name = 'مندوب') {
  const phone = nextLocalPhone();
  const res = await call('POST', '/warehouse/reps', {
    token: warehouseToken,
    body: { name, phone, password: REP_PASSWORD },
  });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  return { rep: res.body.rep, appPhone: `+963${phone.slice(1)}` };
}

async function repToken(appPhone) {
  return login(appPhone, REP_PASSWORD);
}

function assign(warehouseToken, pharmacyId, repId) {
  return call('PUT', `/warehouse/reps/pharmacies/${pharmacyId}/rep`, { token: warehouseToken, body: { repId } });
}

async function placeOrder(pharmacyCtx, warehouseCtx) {
  return orderService.createOrder({
    userId: pharmacyCtx.user._id,
    pharmacyId: pharmacyCtx.pharmacy._id,
    warehouseId: warehouseCtx.warehouse._id,
    items: [{ productId: warehouseCtx.product._id.toString(), quantity: 3 }],
    notes: null,
  });
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-reps-test' });
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 10000, source: 'manual' });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  ctx.whA = await createWarehouse('Warehouse A');
  ctx.whB = await createWarehouse('Warehouse B');
  ctx.ph1 = await createPharmacy('صيدلية الأولى');
  ctx.ph2 = await createPharmacy('صيدلية الثانية');
  ctx.phNoLocation = await createPharmacy('صيدلية بلا موقع', { withLocation: false });
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

test('a warehouse creates a rep who signs in from the app and must pick a password', async () => {
  const { rep, appPhone } = await createRep(ctx.whA.token, 'سامر');
  assert.strictEqual(rep.phone, appPhone, 'stored in the +963 form the app signs in with');
  assert.strictEqual(rep.isActive, true);

  const signedIn = await call('POST', '/auth/login-password', { body: { phone: appPhone, password: REP_PASSWORD } });
  assert.strictEqual(signedIn.status, 200);
  assert.strictEqual(signedIn.body.user.role, 'rep');
  assert.strictEqual(signedIn.body.user.mustChangePassword, true);
  assert.strictEqual(signedIn.body.warehouse.nameEn, 'Warehouse A', "the rep's employer comes with the session");

  const me = await call('GET', '/rep/me', { token: signedIn.body.token });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.rep.name, 'سامر');
  assert.strictEqual(me.body.warehouse.nameEn, 'Warehouse A');
  assert.deepStrictEqual(me.body.stats, {
    pharmacyCount: 0,
    visitsLast7Days: 0,
    monthOrdersCount: 0,
    monthOrdersTotal: 0,
    commissionRate: 0,
    monthCommissionAmount: 0,
  });
});

test('creating a rep refuses a taken phone (either spelling), a bad phone and a short password', async () => {
  const taken = await call('POST', '/warehouse/reps', {
    token: ctx.whA.token,
    body: { name: 'مكرر', phone: `0${ctx.ph1.user.phone.slice(4)}`, password: REP_PASSWORD },
  });
  assert.strictEqual(taken.status, 409);
  assert.strictEqual(taken.body.code, 'PHONE_ALREADY_REGISTERED');

  const badPhone = await call('POST', '/warehouse/reps', {
    token: ctx.whA.token,
    body: { name: 'خطأ', phone: '12345', password: REP_PASSWORD },
  });
  assert.strictEqual(badPhone.body.code, 'INVALID_PHONE_FORMAT');

  const shortPassword = await call('POST', '/warehouse/reps', {
    token: ctx.whA.token,
    body: { name: 'قصير', phone: nextLocalPhone(), password: 'short' },
  });
  assert.strictEqual(shortPassword.body.code, 'INVALID_PASSWORD');
});

test('roles stay apart: reps, pharmacies and warehouses only reach their own routes', async () => {
  const { appPhone } = await createRep(ctx.whA.token);
  const token = await repToken(appPhone);
  assert.strictEqual((await call('GET', '/warehouse/reps', { token })).status, 403);
  assert.strictEqual((await call('GET', '/orders', { token })).status, 403);
  assert.strictEqual((await call('GET', '/rep/me', { token: ctx.ph1.token })).status, 403);
  assert.strictEqual((await call('GET', '/rep/me', { token: ctx.whA.token })).status, 403);
  assert.strictEqual((await call('GET', '/pharmacy/visit-code', { token })).status, 403);
});

test('a warehouse assigns, moves and unassigns a pharmacy - keeping the history', async () => {
  const sami = await createRep(ctx.whA.token, 'سامي');
  const rami = await createRep(ctx.whA.token, 'رامي');

  const first = await assign(ctx.whA.token, ctx.ph2.pharmacy._id, sami.rep.id);
  assert.strictEqual(first.status, 200, JSON.stringify(first.body));
  // Assigning to the same rep again is a no-op, not a second row.
  await assign(ctx.whA.token, ctx.ph2.pharmacy._id, sami.rep.id);
  await assign(ctx.whA.token, ctx.ph2.pharmacy._id, rami.rep.id);

  const rows = await RepAssignment.find({ pharmacyId: ctx.ph2.pharmacy._id }).sort({ createdAt: 1 }).lean();
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].active, false);
  assert.ok(rows[0].endedAt);
  assert.strictEqual(rows[1].active, true);
  assert.strictEqual(rows[1].repId.toString(), rami.rep.id);

  const samiList = await call('GET', `/warehouse/reps/${sami.rep.id}/pharmacies`, { token: ctx.whA.token });
  assert.strictEqual(samiList.body.pharmacies.length, 0);
  const ramiList = await call('GET', `/warehouse/reps/${rami.rep.id}/pharmacies`, { token: ctx.whA.token });
  assert.deepStrictEqual(ramiList.body.pharmacies.map((p) => p.nameAr), ['صيدلية الثانية']);

  const cleared = await assign(ctx.whA.token, ctx.ph2.pharmacy._id, null);
  assert.strictEqual(cleared.body.assignment, null);
  assert.strictEqual(await RepAssignment.countDocuments({ pharmacyId: ctx.ph2.pharmacy._id, active: true }), 0);
});

test("a warehouse cannot use another warehouse's rep, and the same pharmacy has a rep per warehouse", async () => {
  const repB = await createRep(ctx.whB.token, 'مندوب ب');
  const crossed = await assign(ctx.whA.token, ctx.ph1.pharmacy._id, repB.rep.id);
  assert.strictEqual(crossed.status, 404);
  assert.strictEqual(crossed.body.code, 'REP_NOT_FOUND');

  const repA = await createRep(ctx.whA.token, 'مندوب أ');
  assert.strictEqual((await assign(ctx.whA.token, ctx.ph1.pharmacy._id, repA.rep.id)).status, 200);
  assert.strictEqual((await assign(ctx.whB.token, ctx.ph1.pharmacy._id, repB.rep.id)).status, 200);
  assert.strictEqual(await RepAssignment.countDocuments({ pharmacyId: ctx.ph1.pharmacy._id, active: true }), 2);

  const search = await call('GET', '/warehouse/reps/pharmacy-search?q=الأولى', { token: ctx.whB.token });
  assert.strictEqual(search.status, 200);
  assert.strictEqual(search.body.pharmacies[0].currentRep.name, 'مندوب ب', "B sees its own rep, not A's");
});

test('an order carries the rep who covered the pharmacy when it was placed', async () => {
  const pharmacy = await createPharmacy('صيدلية الطلبات');
  const first = await createRep(ctx.whA.token, 'الأول');
  const second = await createRep(ctx.whA.token, 'الثاني');

  const before = await placeOrder(pharmacy, ctx.whA);
  assert.strictEqual((await Order.findById(before._id).lean()).repId, null);

  await assign(ctx.whA.token, pharmacy.pharmacy._id, first.rep.id);
  const underFirst = await placeOrder(pharmacy, ctx.whA);
  await assign(ctx.whA.token, pharmacy.pharmacy._id, second.rep.id);
  const underSecond = await placeOrder(pharmacy, ctx.whA);
  // An order to ANOTHER warehouse never picks up warehouse A's rep.
  const elsewhere = await placeOrder(pharmacy, ctx.whB);

  const stored = await Order.find({ _id: { $in: [underFirst._id, underSecond._id, elsewhere._id] } }).lean();
  const repOf = (id) => stored.find((o) => o._id.equals(id)).repId?.toString() ?? null;
  assert.strictEqual(repOf(underFirst._id), first.rep.id, 'reassigning did not move the earlier order');
  assert.strictEqual(repOf(underSecond._id), second.rep.id);
  assert.strictEqual(repOf(elsewhere._id), null);

  const reps = await call('GET', '/warehouse/reps', { token: ctx.whA.token });
  const row = reps.body.reps.find((r) => r.id === second.rep.id);
  assert.strictEqual(row.pharmacyCount, 1);
  assert.strictEqual(row.monthOrdersCount, 1);
  assert.ok(row.monthOrdersTotal > 0);

  const token = await repToken(second.appPhone);
  const me = await call('GET', '/rep/me', { token });
  assert.strictEqual(me.body.stats.monthOrdersCount, 1);
  const detail = await call('GET', `/rep/pharmacies/${pharmacy.pharmacy._id}`, { token });
  assert.strictEqual(detail.status, 200);
  // Every order this pharmacy placed with the rep's warehouse, newest first.
  assert.strictEqual(detail.body.orders.length, 3);
  assert.strictEqual(detail.body.pharmacy.activity.monthOrdersCount, 3);
});

test('a scan at the pharmacy verifies; a repeat is the same visit; far away does not verify', async () => {
  const pharmacy = await createPharmacy('صيدلية الزيارة');
  const { rep, appPhone } = await createRep(ctx.whA.token, 'الزائر');
  await assign(ctx.whA.token, pharmacy.pharmacy._id, rep.id);
  const token = await repToken(appPhone);

  const qr = await call('GET', `/warehouse/reps/pharmacies/${pharmacy.pharmacy._id}/visit-code`, { token: ctx.whA.token });
  assert.strictEqual(qr.status, 200);
  assert.match(qr.body.qrPayload, /^FENIQ-VISIT:[A-Z2-9]{16}$/);
  // The pharmacy's own app shows the very same code.
  const own = await call('GET', '/pharmacy/visit-code', { token: pharmacy.token });
  assert.strictEqual(own.body.code, qr.body.code);

  const verified = await call('POST', '/rep/visits', {
    token,
    body: { code: qr.body.qrPayload, ...NEAR, accuracy: 15, isMocked: false },
  });
  assert.strictEqual(verified.status, 201, JSON.stringify(verified.body));
  assert.strictEqual(verified.body.visit.status, 'verified');
  assert.ok(verified.body.visit.distanceMeters >= 40 && verified.body.visit.distanceMeters <= 60);
  assert.strictEqual(verified.body.pharmacy.nameAr, 'صيدلية الزيارة');

  const repeat = await call('POST', '/rep/visits', { token, body: { code: qr.body.code, ...NEAR, accuracy: 15 } });
  assert.strictEqual(repeat.status, 200);
  assert.strictEqual(repeat.body.duplicate, true);
  assert.strictEqual(repeat.body.visit.id, verified.body.visit.id);

  const far = await call('POST', '/rep/visits', { token, body: { code: qr.body.code, ...FAR, accuracy: 15 } });
  assert.strictEqual(far.status, 201);
  assert.strictEqual(far.body.visit.status, 'out_of_range');
  assert.ok(far.body.visit.distanceMeters > 1000);

  const mocked = await call('POST', '/rep/visits', { token, body: { code: qr.body.code, ...NEAR, isMocked: true } });
  assert.strictEqual(mocked.body.visit.status, 'mock_location');

  const log = await call('GET', `/warehouse/reps/visits?repId=${rep.id}`, { token: ctx.whA.token });
  assert.deepStrictEqual(log.body.visits.map((v) => v.status), ['mock_location', 'out_of_range', 'verified']);
  assert.strictEqual(log.body.visits[0].rep.name, 'الزائر');

  const list = await call('GET', '/rep/pharmacies', { token });
  assert.ok(list.body.pharmacies[0].activity.lastVerifiedVisitAt);

  const reps = await call('GET', '/warehouse/reps', { token: ctx.whA.token });
  const row = reps.body.reps.find((r) => r.id === rep.id);
  assert.strictEqual(row.visits30d, 1);
  assert.strictEqual(row.unverifiedVisits30d, 2);
});

test('a pharmacy with no saved location records the visit as unverifiable', async () => {
  const { rep, appPhone } = await createRep(ctx.whA.token, 'بلا موقع');
  await assign(ctx.whA.token, ctx.phNoLocation.pharmacy._id, rep.id);
  const code = (await call('GET', '/pharmacy/visit-code', { token: ctx.phNoLocation.token })).body.code;
  const res = await call('POST', '/rep/visits', { token: await repToken(appPhone), body: { code, ...NEAR } });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.visit.status, 'no_pharmacy_location');
  assert.strictEqual(res.body.visit.distanceMeters, null);
});

test('scans are refused for an unassigned pharmacy, a foreign code, an unknown code and no location', async () => {
  const { appPhone } = await createRep(ctx.whA.token, 'غير معيّن');
  const token = await repToken(appPhone);
  const code = (await call('GET', '/pharmacy/visit-code', { token: ctx.ph2.token })).body.code;

  const unassigned = await call('POST', '/rep/visits', { token, body: { code, ...NEAR } });
  assert.strictEqual(unassigned.status, 403);
  assert.strictEqual(unassigned.body.code, 'PHARMACY_NOT_ASSIGNED');
  const detail = await call('GET', `/rep/pharmacies/${ctx.ph2.pharmacy._id}`, { token });
  assert.strictEqual(detail.status, 403);

  const foreign = await call('POST', '/rep/visits', { token, body: { code: 'https://example.com', ...NEAR } });
  assert.strictEqual(foreign.body.code, 'INVALID_VISIT_CODE');
  const unknown = await call('POST', '/rep/visits', { token, body: { code: 'ABCDEFGHJKMNPQRS', ...NEAR } });
  assert.strictEqual(unknown.status, 404);
  assert.strictEqual(unknown.body.code, 'VISIT_CODE_NOT_FOUND');

  const { rep: other, appPhone: otherPhone } = await createRep(ctx.whA.token, 'بلا GPS');
  await assign(ctx.whA.token, ctx.ph2.pharmacy._id, other.id);
  const noLocation = await call('POST', '/rep/visits', { token: await repToken(otherPhone), body: { code } });
  assert.strictEqual(noLocation.body.code, 'INVALID_LOCATION');
});

test('the warehouse QR endpoint only serves pharmacies its reps cover', async () => {
  const stranger = await createPharmacy('صيدلية غريبة');
  const res = await call('GET', `/warehouse/reps/pharmacies/${stranger.pharmacy._id}/visit-code`, { token: ctx.whA.token });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.code, 'PHARMACY_NOT_ASSIGNED');
});

test('switching a rep off ends their sessions and blocks new assignments; on again lets them back', async () => {
  const pharmacy = await createPharmacy('صيدلية الإيقاف');
  const { rep, appPhone } = await createRep(ctx.whA.token, 'موقوف');
  const token = await repToken(appPhone);

  const off = await call('PATCH', `/warehouse/reps/${rep.id}`, { token: ctx.whA.token, body: { isActive: false } });
  assert.strictEqual(off.status, 200);
  assert.strictEqual(off.body.rep.isActive, false);
  assert.strictEqual((await call('GET', '/rep/me', { token })).status, 401, 'the old token is revoked');
  const relogin = await call('POST', '/auth/login-password', { body: { phone: appPhone, password: REP_PASSWORD } });
  assert.strictEqual(relogin.status, 403);
  assert.strictEqual(relogin.body.code, 'ACCOUNT_BLOCKED');

  const refused = await assign(ctx.whA.token, pharmacy.pharmacy._id, rep.id);
  assert.strictEqual(refused.body.code, 'REP_INACTIVE');

  await call('PATCH', `/warehouse/reps/${rep.id}`, { token: ctx.whA.token, body: { isActive: true } });
  assert.strictEqual((await call('GET', '/rep/me', { token: await repToken(appPhone) })).status, 200);
});

test("a warehouse resets its rep's password: old sessions end and a change is forced", async () => {
  const { rep, appPhone } = await createRep(ctx.whA.token, 'نسي كلمة السر');
  const oldToken = await repToken(appPhone);
  const reset = await call('POST', `/warehouse/reps/${rep.id}/reset-password`, {
    token: ctx.whA.token,
    body: { password: 'brand-new-temp' },
  });
  assert.strictEqual(reset.status, 200);
  assert.strictEqual((await call('GET', '/rep/me', { token: oldToken })).status, 401);
  const signedIn = await call('POST', '/auth/login-password', { body: { phone: appPhone, password: 'brand-new-temp' } });
  assert.strictEqual(signedIn.status, 200);
  assert.strictEqual(signedIn.body.user.mustChangePassword, true);

  const other = await call('POST', `/warehouse/reps/${rep.id}/reset-password`, {
    token: ctx.whB.token,
    body: { password: 'brand-new-temp' },
  });
  assert.strictEqual(other.status, 404, "warehouse B cannot touch A's rep");
});

test('judgeVisit allows for GPS accuracy, but only up to a cap', () => {
  const pharmacy = { location: { coordinates: PHARMACY_POINT } };
  // ~200 m away.
  const at200 = [PHARMACY_POINT[0], PHARMACY_POINT[1] + 0.0018];
  assert.strictEqual(judgeVisit({ pharmacy, coordinates: at200, accuracyMeters: 10 }).status, 'out_of_range');
  assert.strictEqual(judgeVisit({ pharmacy, coordinates: at200, accuracyMeters: 80 }).status, 'verified');
  // 2 km of claimed uncertainty does not stretch the radius to 2 km.
  const at500 = [PHARMACY_POINT[0], PHARMACY_POINT[1] + 0.0045];
  assert.strictEqual(judgeVisit({ pharmacy, coordinates: at500, accuracyMeters: 2000 }).status, 'out_of_range');
});

test('parseVisitCode accepts the QR text or the bare code, and nothing else', () => {
  assert.strictEqual(parseVisitCode('FENIQ-VISIT:ABCDEFGHJKMNPQRS'), 'ABCDEFGHJKMNPQRS');
  assert.strictEqual(parseVisitCode(' abcdefghjkmnpqrs '), 'ABCDEFGHJKMNPQRS');
  assert.strictEqual(parseVisitCode('FENIQ-VISIT:SHORT'), null);
  assert.strictEqual(parseVisitCode('ABCDEFGHJKMNPQR0'), null, '0 is not in the alphabet');
  assert.strictEqual(parseVisitCode(null), null);
});
