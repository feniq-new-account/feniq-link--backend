// Phase 5's contract, tested at the service layer: an event is emitted only
// AFTER MongoDB accepts the write, and never when it doesn't.
//
// Models and the realtime module are stubbed through require.cache before
// order.service is loaded, so this needs no database and no socket server -
// it isolates exactly one question: does a failed write stay silent?
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/feniq-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-realtime-tests-p';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const mongoose = require('mongoose');

const emitted = [];

const { modelQuery } = require('./helpers/model-query-stub');

function stubModule(relativePath, exportsValue) {
  const resolved = require.resolve(path.join(__dirname, '..', 'src', relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
}

// Records instead of transmitting, so the assertions are about *whether* an
// emit happened and with what - not about socket delivery (covered by
// realtime.test.js).
stubModule('realtime/index.js', {
  emitToWarehouse: (warehouseId, event, payload) => emitted.push({ warehouseId, event, payload }),
  EVENTS: {
    ORDER_CREATED: 'order.created',
    ORDER_CANCELLED: 'order.cancelled',
    ORDER_STATUS_UPDATED: 'order.status.updated',
    RETURN_CREATED: 'return.created',
    RETURN_STATUS_UPDATED: 'return.status.updated',
  },
});

const WAREHOUSE_ID = new mongoose.Types.ObjectId();
const PHARMACY_ID = new mongoose.Types.ObjectId();
const ORDER_ID = new mongoose.Types.ObjectId();
const USER_ID = new mongoose.Types.ObjectId();

// Cancelling is ONE path for every order (with or without a discount code): a
// compare-and-swap on a cancellable status, inside a transaction. The
// transaction helper is stubbed to hand the work a recognisable session, and
// `writeBehavior` is what each test flips to make the conditional write
// succeed, fail, or match nothing (the warehouse moved the order on first).
const FAKE_SESSION = { fake: 'session' };
const writes = [];
let writeBehavior = async () => ({ ...buildOrder(), status: 'cancelled', cancelledBy: USER_ID });

stubModule('utils/transaction.js', {
  runInTransaction: async (work) => work(FAKE_SESSION),
  supportsTransactions: async () => true,
  assertTransactionSupport: async () => {},
  TRANSIENT_LABEL: 'TransientTransactionError',
  UNKNOWN_COMMIT_LABEL: 'UnknownTransactionCommitResult',
});

function buildOrder() {
  return {
    _id: ORDER_ID,
    orderNumber: 4242,
    pharmacyId: PHARMACY_ID,
    warehouseId: WAREHOUSE_ID,
    status: 'pending',
    statusHistory: [],
    cancelledBy: null,
    discountCode: null,
  };
}

// Mutated in place, never reassigned: order.service captured this exact
// object at require time, so swapping require.cache's `exports` wholesale
// after the fact would have no effect on it.
// The order read stays a bare promise-returning stub; the sibling reads below
// ARE lean, hence modelQuery - see the note in helpers/model-query-stub.js.
const orderModelStub = {
  findOne: async () => buildOrder(),
  findOneAndUpdate: async (filter, update, options) => {
    writes.push({ filter, update, options });
    return writeBehavior();
  },
};
stubModule('models/order.model.js', orderModelStub);
stubModule('models/warehouse.model.js', { findById: modelQuery(() => ({ _id: WAREHOUSE_ID })) });
stubModule('models/orderItem.model.js', { find: modelQuery(() => []) });
stubModule('models/return.model.js', { findOne: modelQuery(() => null) });
stubModule('models/review.model.js', { findOne: modelQuery(() => null) });
// getOrderForPharmacy (called by cancelOrder) now also reads the order's
// complaints - stubbed like its siblings so this stays DB-free.
stubModule('models/complaint.model.js', { find: modelQuery(() => []) });

const orderService = require('../src/services/order.service');

test.beforeEach(() => {
  emitted.length = 0;
  writes.length = 0;
  writeBehavior = async () => ({ ...buildOrder(), status: 'cancelled', cancelledBy: USER_ID });
  orderModelStub.findOne = async () => buildOrder();
});

test('a successful cancellation emits order.cancelled to that order\'s warehouse', async () => {
  const { order } = await orderService.cancelOrder(ORDER_ID.toString(), PHARMACY_ID, USER_ID);

  assert.strictEqual(order.status, 'cancelled');
  assert.strictEqual(emitted.length, 1);
  assert.strictEqual(emitted[0].event, 'order.cancelled');
  assert.strictEqual(String(emitted[0].warehouseId), String(WAREHOUSE_ID));
  assert.strictEqual(emitted[0].payload.orderId, ORDER_ID.toString());
  assert.strictEqual(emitted[0].payload.orderNumber, 4242);
});

test('an order without a discount code takes the same compare-and-swap path, in a transaction', async () => {
  await orderService.cancelOrder(ORDER_ID.toString(), PHARMACY_ID, USER_ID);

  assert.strictEqual(writes.length, 1);
  const [{ filter, update, options }] = writes;
  assert.deepStrictEqual(filter.status, { $in: ['pending', 'confirmed', 'preparing'] });
  assert.strictEqual(update.$set.status, 'cancelled');
  assert.strictEqual(String(update.$set.cancelledBy), String(USER_ID));
  assert.strictEqual(update.$push.statusHistory.status, 'cancelled');
  assert.strictEqual(options.session, FAKE_SESSION, 'the write runs inside the transaction');
});

test('a FAILED database write emits nothing at all', async () => {
  writeBehavior = async () => {
    throw new Error('mongo write failed');
  };

  await assert.rejects(
    () => orderService.cancelOrder(ORDER_ID.toString(), PHARMACY_ID, USER_ID),
    /mongo write failed/
  );

  // The whole point of Phase 5: the dashboard must never be told an order was
  // cancelled when the database refused the change.
  assert.deepStrictEqual(emitted, [], 'no event may be emitted when persistence fails');
});

test('a cancel that loses the race to the warehouse is refused and emits nothing', async () => {
  // The read saw 'pending'; by the write the warehouse had moved it on, so the
  // conditional update matches nothing.
  writeBehavior = async () => null;

  await assert.rejects(
    () => orderService.cancelOrder(ORDER_ID.toString(), PHARMACY_ID, USER_ID),
    (err) => err.code === 'ORDER_NOT_CANCELLABLE'
  );
  assert.deepStrictEqual(emitted, []);
});

test('a rejected business rule emits nothing (order not in a cancellable state)', async () => {
  orderModelStub.findOne = async () => ({ ...buildOrder(), status: 'delivered' });

  await assert.rejects(() => orderService.cancelOrder(ORDER_ID.toString(), PHARMACY_ID, USER_ID));
  assert.deepStrictEqual(emitted, [], 'a rejected cancellation is not an event');
  assert.strictEqual(writes.length, 0, 'nothing is written for an order plainly past cancelling');
});
