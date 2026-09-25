// Discount codes, the code side: the generated string, the terms, and the
// moderation lifecycle (warehouse create -> admin approve / reject, the parked
// edit of an approved code, stop by the warehouse or the admin, the admin's own
// codes), plus the one notification a pharmacy-specific code sends when it
// becomes usable. The order side is in discountCode.order.test.js.
//
// notification.service and realtime are stubbed through require.cache (before
// the services load) so the tests can see exactly what was sent and emitted.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-discount-code-lifecycle';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const sent = [];
const emitted = [];
function stubModule(relativePath, exportsValue) {
  const resolved = require.resolve(path.join(__dirname, '..', 'src', relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
}
stubModule('services/notification.service.js', {
  sendToUser: async (userId, payload) => {
    sent.push({ userId: String(userId), payload });
  },
  sendToAll: async () => {},
});
const realEvents = require('../src/realtime/events');
stubModule('realtime/index.js', {
  EVENTS: realEvents.EVENTS,
  emitToAdmins: (event, payload) => emitted.push({ room: 'admin', event, payload }),
  emitToWarehouse: (warehouseId, event, payload) =>
    emitted.push({ room: `warehouse:${warehouseId}`, event, payload }),
});

const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const LedgerAccount = require('../src/models/ledgerAccount.model');
const DiscountCode = require('../src/models/discountCode.model');
const DiscountCodePharmacyUsage = require('../src/models/discountCodePharmacyUsage.model');
const core = require('../src/services/discountCode.service');
const warehouseCodes = require('../src/services/warehouseDiscountCode.service');
const adminCodes = require('../src/services/adminDiscountCode.service');

const DAY = 24 * 60 * 60 * 1000;
const ids = {};
const tokens = {};
let server;
let baseUrl;

function withCode(expected) {
  return (err) => {
    assert.strictEqual(err.code, expected, `expected ${expected}, got ${err.code} (${err.message})`);
    return true;
  };
}

function terms(overrides = {}) {
  return {
    type: 'percentage',
    value: 10,
    startDate: new Date(Date.now() - DAY).toISOString(),
    endDate: new Date(Date.now() + 10 * DAY).toISOString(),
    ...overrides,
  };
}

async function call(role, method, urlPath, body) {
  const response = await fetch(baseUrl + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[role]}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-discount-code-lifecycle' });
  await syncIndexes(DiscountCode, DiscountCodePharmacyUsage, LedgerAccount);

  const [admin, whUserA, whUserB, phUserA, phUserB] = await User.create([
    { name: 'Admin', phone: '0930000900', role: 'admin', status: 'active' },
    { name: 'WHA', phone: '0940000901', role: 'warehouse', status: 'active' },
    { name: 'WHB', phone: '0940000902', role: 'warehouse', status: 'active' },
    { name: 'PhA', phone: '0930000903', role: 'pharmacy', status: 'active' },
    { name: 'PhB', phone: '0930000904', role: 'pharmacy', status: 'active' },
  ]);
  ids.admin = admin._id;
  ids.whUserA = whUserA._id;
  ids.phUserA = phUserA._id;
  tokens.admin = jwt.sign({ sub: String(admin._id) }, env.jwtSecret, { expiresIn: '1h' });
  tokens.warehouseA = jwt.sign({ sub: String(whUserA._id) }, env.jwtSecret, { expiresIn: '1h' });
  tokens.warehouseB = jwt.sign({ sub: String(whUserB._id) }, env.jwtSecret, { expiresIn: '1h' });

  const [warehouseA, warehouseB] = await Warehouse.create([
    { userId: whUserA._id, nameAr: 'مستودع أ', nameEn: 'Alpha', address: 'a', city: 'Latakia', phone: '0940000901', isActive: true },
    { userId: whUserB._id, nameAr: 'مستودع ب', nameEn: 'Beta', address: 'b', city: 'Latakia', phone: '0940000902', isActive: true },
  ]);
  ids.warehouseA = warehouseA._id;
  ids.warehouseB = warehouseB._id;

  const [pharmacyA, pharmacyB] = await Pharmacy.create([
    { userId: phUserA._id, nameAr: 'صيدلية أ', nameEn: 'Ph A', ownerName: 'O', address: 'a', city: 'Latakia', areaType: 'city', phone: '0930000903', addedBy: 'self' },
    { userId: phUserB._id, nameAr: 'صيدلية ب', nameEn: 'Ph B', ownerName: 'O', address: 'b', city: 'Latakia', areaType: 'city', phone: '0930000904', addedBy: 'self' },
  ]);
  ids.pharmacyA = pharmacyA._id;
  ids.pharmacyB = pharmacyB._id;

  // Pharmacy A is a customer of warehouse A (a delivered order opened the
  // account); pharmacy B is nobody's customer.
  await LedgerAccount.create({ pharmacyId: pharmacyA._id, warehouseId: warehouseA._id });

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

test.beforeEach(async () => {
  await DiscountCode.deleteMany({});
  sent.length = 0;
  emitted.length = 0;
});

// ---------------------------------------------------------------------------
// The code string and the terms

test('generated codes are 8 characters from the unambiguous alphabet', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const code = core.generateCodeString();
    assert.match(code, /^[A-Z2-9]{8}$/);
    assert.doesNotMatch(code, /[01OIL]/, `ambiguous character in ${code}`);
    seen.add(code);
  }
  assert.ok(seen.size > 1990, 'codes should practically never repeat');
});

test('typed codes are trimmed and upper-cased; anything outside 6-8 characters is not a code', () => {
  assert.strictEqual(core.normalizeCodeInput('  abc234 '), 'ABC234');
  assert.strictEqual(core.normalizeCodeInput('ABCDE'), null);
  assert.strictEqual(core.normalizeCodeInput('ABCDEFGHJ'), null);
  assert.strictEqual(core.normalizeCodeInput('AB-C23'), null);
  assert.strictEqual(core.normalizeCodeInput(42), null);
});

test('created codes are unique platform-wide (unique index on code)', async () => {
  const a = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms());
  await assert.rejects(
    DiscountCode.create({
      code: a.code, ownerRole: 'admin', type: 'fixed', value: 1000,
      startDate: new Date(), endDate: new Date(Date.now() + DAY), status: 'approved', createdBy: ids.admin,
    }),
    (err) => err.code === 11000
  );
});

test('percentage must be above 0 and at most 100 with up to two decimals; fixed is whole lira above 0', () => {
  assert.strictEqual(core.validateTerms(terms({ value: 12.5 })).value, 12.5);
  assert.strictEqual(core.validateTerms(terms({ value: 100 })).value, 100);
  assert.strictEqual(core.validateTerms(terms({ type: 'fixed', value: 25000 })).value, 25000);
  for (const bad of [0, -5, 100.01, 7.125, Number.NaN]) {
    assert.throws(() => core.validateTerms(terms({ value: bad })), withCode('INVALID_DISCOUNT_CODE_VALUE'));
  }
  for (const bad of [0, -1000, 1000.5]) {
    assert.throws(
      () => core.validateTerms(terms({ type: 'fixed', value: bad })),
      withCode('INVALID_DISCOUNT_CODE_VALUE')
    );
  }
  assert.throws(() => core.validateTerms(terms({ type: 'bogus' })), withCode('INVALID_DISCOUNT_CODE_TYPE'));
});

test('dates must make a window and limits must be whole numbers of at least 1', () => {
  const start = new Date(Date.now() + DAY).toISOString();
  assert.throws(() => core.validateTerms(terms({ startDate: start, endDate: start })), withCode('INVALID_DATE_RANGE'));
  assert.throws(() => core.validateTerms(terms({ endDate: 'not a date' })), withCode('INVALID_DATE_RANGE'));
  assert.throws(() => core.validateTerms(terms({ maxUses: 0 })), withCode('INVALID_DISCOUNT_CODE_LIMIT'));
  assert.throws(() => core.validateTerms(terms({ maxUsesPerPharmacy: 1.5 })), withCode('INVALID_DISCOUNT_CODE_LIMIT'));
  const ok = core.validateTerms(terms({ maxUses: '50', maxUsesPerPharmacy: 1 }));
  assert.strictEqual(ok.maxUses, 50);
  assert.strictEqual(ok.maxUsesPerPharmacy, 1);
  assert.strictEqual(core.validateTerms(terms({ maxUses: '' })).maxUses, null);
});

// ---------------------------------------------------------------------------
// Warehouse codes and approval

test('a warehouse code starts pending, reaches the admin queue, and does not work before approval', async () => {
  const codeDoc = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms());
  assert.strictEqual(codeDoc.status, 'pending');
  assert.strictEqual(codeDoc.ownerRole, 'warehouse');
  assert.strictEqual(core.fundedByFor(codeDoc), 'warehouse');
  assert.deepStrictEqual(emitted.map((e) => [e.room, e.event]), [['admin', 'discountCode.pending']]);

  const { reason } = await core.evaluate({
    code: codeDoc.code, pharmacyId: ids.pharmacyA, warehouseId: ids.warehouseA,
  });
  assert.strictEqual(reason, 'DISCOUNT_CODE_PENDING_APPROVAL');
});

test('a warehouse can aim a code only at its own customers', async () => {
  const forCustomer = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms({ pharmacyId: String(ids.pharmacyA) }));
  assert.strictEqual(String(forCustomer.pharmacyId), String(ids.pharmacyA));

  await assert.rejects(
    warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms({ pharmacyId: String(ids.pharmacyB) })),
    withCode('DISCOUNT_CODE_PHARMACY_NOT_CUSTOMER')
  );
  // Warehouse B has delivered to nobody.
  await assert.rejects(
    warehouseCodes.createCode(ids.warehouseB, ids.whUserA, terms({ pharmacyId: String(ids.pharmacyA) })),
    withCode('DISCOUNT_CODE_PHARMACY_NOT_CUSTOMER')
  );
});

test('approval makes the code work and notifies the pharmacy of a pharmacy-specific code, once', async () => {
  const codeDoc = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms({ pharmacyId: String(ids.pharmacyA) }));
  emitted.length = 0;

  const approved = await adminCodes.approveCode(codeDoc._id, ids.admin, { expectedVersion: codeDoc.__v });
  assert.strictEqual(approved.status, 'approved');
  const { reason } = await core.evaluate({ code: codeDoc.code, pharmacyId: ids.pharmacyA, warehouseId: ids.warehouseA });
  assert.strictEqual(reason, null);

  // Both the admins and the owning warehouse hear the decision.
  assert.deepStrictEqual(
    emitted.map((e) => [e.room, e.event, e.payload.status]).sort(),
    [
      ['admin', 'discountCode.status.updated', 'approved'],
      [`warehouse:${ids.warehouseA}`, 'discountCode.status.updated', 'approved'],
    ]
  );

  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].userId, String(ids.phUserA));
  assert.strictEqual(sent[0].payload.type, 'discount_code');
  assert.strictEqual(String(sent[0].payload.relatedWarehouseId), String(ids.warehouseA));
  assert.match(sent[0].payload.bodyAr, new RegExp(codeDoc.code));
  assert.match(sent[0].payload.bodyAr, /مستودع أ/);

  // An edit that is then approved is not a new activation.
  await warehouseCodes.updateCode(codeDoc._id, ids.warehouseA, terms({ value: 15 }));
  const fresh = await DiscountCode.findById(codeDoc._id);
  await adminCodes.approveCode(codeDoc._id, ids.admin, { expectedVersion: fresh.__v });
  assert.strictEqual(sent.length, 1);
});

test('a general code notifies nobody when it is approved', async () => {
  const codeDoc = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms());
  await adminCodes.approveCode(codeDoc._id, ids.admin);
  assert.strictEqual(sent.length, 0);
});

test('editing an approved code parks the change; the live terms stay until the admin approves', async () => {
  const codeDoc = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms({ value: 10 }));
  await adminCodes.approveCode(codeDoc._id, ids.admin);
  emitted.length = 0;

  await warehouseCodes.updateCode(codeDoc._id, ids.warehouseA, terms({ value: 20, maxUses: 5 }));
  let live = await DiscountCode.findById(codeDoc._id).lean();
  assert.strictEqual(live.status, 'approved');
  assert.strictEqual(live.value, 10, 'live terms untouched while the edit waits');
  assert.strictEqual(live.maxUses, null);
  assert.strictEqual(live.pendingUpdate.value, 20);
  assert.strictEqual(live.revision, 1);
  assert.deepStrictEqual(emitted.map((e) => e.event), ['discountCode.pending']);

  // It is still usable on the old terms meanwhile.
  const { reason } = await core.evaluate({ code: codeDoc.code, pharmacyId: ids.pharmacyA, warehouseId: ids.warehouseA });
  assert.strictEqual(reason, null);

  // A second edit replaces the parked one without a second queue signal.
  await warehouseCodes.updateCode(codeDoc._id, ids.warehouseA, terms({ value: 25, maxUses: 5 }));
  assert.deepStrictEqual(emitted.map((e) => e.event), ['discountCode.pending']);

  await adminCodes.approveCode(codeDoc._id, ids.admin);
  live = await DiscountCode.findById(codeDoc._id).lean();
  assert.strictEqual(live.value, 25);
  assert.strictEqual(live.maxUses, 5);
  assert.strictEqual(live.pendingUpdate, null);
  assert.strictEqual(live.revision, 2, 'the amount changed, so the revision moved');
});

test('re-approval of an edit that leaves the amount alone keeps the revision', async () => {
  const codeDoc = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms({ value: 10 }));
  await adminCodes.approveCode(codeDoc._id, ids.admin);
  await warehouseCodes.updateCode(
    codeDoc._id,
    ids.warehouseA,
    terms({ value: 10, endDate: new Date(Date.now() + 30 * DAY).toISOString() })
  );
  await adminCodes.approveCode(codeDoc._id, ids.admin);
  const live = await DiscountCode.findById(codeDoc._id).lean();
  assert.strictEqual(live.revision, 1);
});

test('a pending code is edited in place and stays in the queue', async () => {
  const codeDoc = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms({ value: 10 }));
  emitted.length = 0;
  await warehouseCodes.updateCode(codeDoc._id, ids.warehouseA, terms({ type: 'fixed', value: 5000 }));
  const live = await DiscountCode.findById(codeDoc._id).lean();
  assert.strictEqual(live.status, 'pending');
  assert.strictEqual(live.type, 'fixed');
  assert.strictEqual(live.value, 5000);
  assert.strictEqual(live.pendingUpdate, null);
  assert.strictEqual(emitted.length, 0);
});

test('rejecting a new code needs a reason and makes it final; rejecting an edit keeps the live code', async () => {
  const fresh = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms());
  await assert.rejects(adminCodes.rejectCode(fresh._id, { note: '  ' }), withCode('REJECTION_NOTE_REQUIRED'));

  const rejected = await adminCodes.rejectCode(fresh._id, { note: 'Too generous' });
  assert.strictEqual(rejected.status, 'rejected');
  assert.strictEqual(rejected.rejectionNote, 'Too generous');
  await assert.rejects(
    warehouseCodes.updateCode(fresh._id, ids.warehouseA, terms()),
    withCode('DISCOUNT_CODE_NOT_EDITABLE')
  );
  const { reason } = await core.evaluate({ code: fresh.code, pharmacyId: ids.pharmacyA, warehouseId: ids.warehouseA });
  assert.strictEqual(reason, 'DISCOUNT_CODE_INVALID');

  const live = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms({ value: 10 }));
  await adminCodes.approveCode(live._id, ids.admin);
  await warehouseCodes.updateCode(live._id, ids.warehouseA, terms({ value: 50 }));
  emitted.length = 0;
  await adminCodes.rejectCode(live._id, { note: 'Keep it at 10%' });
  const after = await DiscountCode.findById(live._id).lean();
  assert.strictEqual(after.status, 'approved');
  assert.strictEqual(after.value, 10);
  assert.strictEqual(after.pendingUpdate, null);
  assert.strictEqual(after.rejectionNote, 'Keep it at 10%');
  assert.ok(emitted.some((e) => e.payload.status === 'update_rejected'));
});

test('the admin cannot decide on a code that is not waiting for review', async () => {
  const codeDoc = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms());
  await adminCodes.approveCode(codeDoc._id, ids.admin);
  await assert.rejects(adminCodes.approveCode(codeDoc._id, ids.admin), withCode('DISCOUNT_CODE_NOT_IN_REVIEW'));
  await assert.rejects(adminCodes.rejectCode(codeDoc._id, { note: 'x' }), withCode('DISCOUNT_CODE_NOT_IN_REVIEW'));
});

test('a decision on a code the warehouse changed since it was displayed is refused', async () => {
  const codeDoc = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms({ value: 10 }));
  const shownVersion = codeDoc.__v;
  await warehouseCodes.updateCode(codeDoc._id, ids.warehouseA, terms({ value: 90 }));
  await assert.rejects(
    adminCodes.approveCode(codeDoc._id, ids.admin, { expectedVersion: shownVersion }),
    withCode('DISCOUNT_CODE_VERSION_CONFLICT')
  );
  const still = await DiscountCode.findById(codeDoc._id).lean();
  assert.strictEqual(still.status, 'pending');
});

// ---------------------------------------------------------------------------
// Stop

test('the warehouse stops its own code at any time, with no approval, and it stops working', async () => {
  const codeDoc = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms());
  await adminCodes.approveCode(codeDoc._id, ids.admin);
  await warehouseCodes.updateCode(codeDoc._id, ids.warehouseA, terms({ value: 30 }));
  emitted.length = 0;

  const stopped = await warehouseCodes.stopCode(codeDoc._id, ids.warehouseA, ids.whUserA);
  assert.strictEqual(stopped.status, 'stopped');
  assert.strictEqual(stopped.stoppedByRole, 'warehouse');
  assert.strictEqual(stopped.pendingUpdate, null, 'a parked edit goes with it');
  // It had an edit in the admin queue, so the admins are told; the warehouse
  // is not echoed its own action.
  assert.deepStrictEqual(emitted.map((e) => e.room), ['admin']);

  const { reason } = await core.evaluate({ code: codeDoc.code, pharmacyId: ids.pharmacyA, warehouseId: ids.warehouseA });
  assert.strictEqual(reason, 'DISCOUNT_CODE_STOPPED');
  await assert.rejects(
    warehouseCodes.updateCode(codeDoc._id, ids.warehouseA, terms()),
    withCode('DISCOUNT_CODE_NOT_EDITABLE')
  );
});

test('a warehouse cannot reach another warehouse\'s code', async () => {
  const codeDoc = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms());
  await assert.rejects(warehouseCodes.stopCode(codeDoc._id, ids.warehouseB, ids.whUserA), withCode('DISCOUNT_CODE_NOT_FOUND'));
  await assert.rejects(warehouseCodes.updateCode(codeDoc._id, ids.warehouseB, terms()), withCode('DISCOUNT_CODE_NOT_FOUND'));
});

test('the admin can stop any code, a warehouse\'s included', async () => {
  const codeDoc = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms());
  await adminCodes.approveCode(codeDoc._id, ids.admin);
  emitted.length = 0;
  const stopped = await adminCodes.stopCode(codeDoc._id, ids.admin);
  assert.strictEqual(stopped.status, 'stopped');
  assert.strictEqual(stopped.stoppedByRole, 'admin');
  assert.ok(emitted.some((e) => e.room === `warehouse:${ids.warehouseA}`), 'the owning warehouse is told');
});

// ---------------------------------------------------------------------------
// Admin codes

test('an admin code is live on creation, works on any warehouse and is paid by the platform', async () => {
  const codeDoc = await adminCodes.createCode(ids.admin, terms({ type: 'fixed', value: 20000 }));
  assert.strictEqual(codeDoc.status, 'approved');
  assert.strictEqual(codeDoc.warehouseId, null);
  assert.strictEqual(core.fundedByFor(codeDoc), 'platform');
  for (const warehouseId of [ids.warehouseA, ids.warehouseB]) {
    const { reason } = await core.evaluate({ code: codeDoc.code, pharmacyId: ids.pharmacyB, warehouseId });
    assert.strictEqual(reason, null);
  }
  assert.strictEqual(sent.length, 0, 'a general code notifies nobody');
});

test('a pharmacy-specific admin code notifies its pharmacy on creation, with no warehouse to open', async () => {
  const codeDoc = await adminCodes.createCode(ids.admin, terms({ pharmacyId: String(ids.pharmacyB) }));
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].payload.type, 'discount_code');
  assert.strictEqual(sent[0].payload.relatedWarehouseId, null);
  assert.match(sent[0].payload.bodyAr, new RegExp(codeDoc.code));

  const { reason } = await core.evaluate({ code: codeDoc.code, pharmacyId: ids.pharmacyA, warehouseId: ids.warehouseA });
  assert.strictEqual(reason, 'DISCOUNT_CODE_NOT_FOR_PHARMACY');
});

test('an admin code can target any approved pharmacy, but not an unknown one', async () => {
  await adminCodes.createCode(ids.admin, terms({ pharmacyId: String(ids.pharmacyB) }));
  await assert.rejects(
    adminCodes.createCode(ids.admin, terms({ pharmacyId: String(new mongoose.Types.ObjectId()) })),
    withCode('DISCOUNT_CODE_PHARMACY_NOT_FOUND')
  );
});

test('the admin edits its own codes directly (revision moves with the amount) but not a warehouse\'s', async () => {
  const codeDoc = await adminCodes.createCode(ids.admin, terms({ value: 10 }));
  const edited = await adminCodes.updateCode(codeDoc._id, terms({ value: 12 }), { expectedVersion: codeDoc.__v });
  assert.strictEqual(edited.value, 12);
  assert.strictEqual(edited.revision, 2);
  const datesOnly = await adminCodes.updateCode(codeDoc._id, terms({ value: 12, maxUses: 100 }));
  assert.strictEqual(datesOnly.revision, 2);

  const warehouseCode = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms());
  await assert.rejects(adminCodes.updateCode(warehouseCode._id, terms()), withCode('DISCOUNT_CODE_NOT_ADMIN_OWNED'));
});

// ---------------------------------------------------------------------------
// Lists

test('lists: the warehouse sees only its own codes; the admin has review, admin and all views', async () => {
  const pending = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms());
  const approved = await warehouseCodes.createCode(ids.warehouseA, ids.whUserA, terms());
  await adminCodes.approveCode(approved._id, ids.admin);
  const otherPending = await warehouseCodes.createCode(ids.warehouseB, ids.whUserA, terms());
  const adminCode = await adminCodes.createCode(ids.admin, terms());

  const own = await warehouseCodes.listCodes(ids.warehouseA, { limit: 20 });
  assert.strictEqual(own.rows.length, 2);
  assert.strictEqual(own.reviewCount, 1);

  const review = await adminCodes.listCodes({ view: 'review', limit: 20 });
  assert.deepStrictEqual(
    review.rows.map((r) => String(r.codeDoc._id)).sort(),
    [String(pending._id), String(otherPending._id)].sort()
  );
  assert.strictEqual(review.reviewCount, 2);

  const mine = await adminCodes.listCodes({ view: 'admin', limit: 20 });
  assert.deepStrictEqual(mine.rows.map((r) => String(r.codeDoc._id)), [String(adminCode._id)]);

  const all = await adminCodes.listCodes({ view: 'all', limit: 2 });
  assert.strictEqual(all.rows.length, 2);
  assert.strictEqual(all.hasMore, true);
  const next = await adminCodes.listCodes({ view: 'all', limit: 2, after: all.nextCursor });
  assert.strictEqual(next.rows.length, 2);
  assert.strictEqual(next.hasMore, false);

  const active = await adminCodes.listCodes({ view: 'all', status: 'active', limit: 20 });
  assert.strictEqual(active.rows.length, 2);
  const bySearch = await adminCodes.listCodes({ view: 'all', search: adminCode.code.slice(0, 5).toLowerCase(), limit: 20 });
  assert.ok(bySearch.rows.some((r) => r.codeDoc.code === adminCode.code));
});

test('the display status follows the clock and the usage', () => {
  const now = new Date();
  const base = { status: 'approved', startDate: new Date(now - DAY), endDate: new Date(+now + DAY), maxUses: 2, usedCount: 0 };
  assert.strictEqual(core.displayStatusOf(base, now), 'active');
  assert.strictEqual(core.displayStatusOf({ ...base, startDate: new Date(+now + DAY / 2) }, now), 'scheduled');
  assert.strictEqual(core.displayStatusOf({ ...base, endDate: new Date(now - 1) }, now), 'expired');
  assert.strictEqual(core.displayStatusOf({ ...base, usedCount: 2 }, now), 'exhausted');
  assert.strictEqual(core.displayStatusOf({ ...base, status: 'stopped' }, now), 'stopped');
});

// ---------------------------------------------------------------------------
// HTTP

test('HTTP: a warehouse creates and stops its code; the admin approves; roles are enforced', async () => {
  const created = await call('warehouseA', 'POST', '/warehouse/discount-codes', terms({ value: 7.5 }));
  assert.strictEqual(created.status, 201);
  const { id, code, version } = created.body.discountCode;
  assert.match(code, /^[A-Z2-9]{8}$/);
  assert.strictEqual(created.body.discountCode.displayStatus, 'pending');

  const listed = await call('warehouseA', 'GET', '/warehouse/discount-codes');
  assert.strictEqual(listed.status, 200);
  assert.strictEqual(listed.body.discountCodes.length, 1);
  assert.strictEqual(listed.body.reviewCount, 1);

  assert.strictEqual((await call('warehouseA', 'POST', `/admin/discount-codes/${id}/approve`, {})).status, 403);
  assert.strictEqual((await call('warehouseB', 'POST', `/warehouse/discount-codes/${id}/stop`)).status, 404);

  const approved = await call('admin', 'POST', `/admin/discount-codes/${id}/approve`, { version });
  assert.strictEqual(approved.status, 200);
  assert.strictEqual(approved.body.discountCode.displayStatus, 'active');

  const review = await call('admin', 'GET', '/admin/discount-codes?view=review');
  assert.strictEqual(review.body.discountCodes.length, 0);

  const stopped = await call('warehouseA', 'POST', `/warehouse/discount-codes/${id}/stop`);
  assert.strictEqual(stopped.status, 200);
  assert.strictEqual(stopped.body.discountCode.status, 'stopped');

  const bad = await call('admin', 'POST', '/admin/discount-codes', terms({ value: 101 }));
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.body.code, 'INVALID_DISCOUNT_CODE_VALUE');
});
