const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const { AllocationRun, AllocationChunk } = require('../src/models/collectionAccounting.model');
const { persistRun, readProjection, CHUNK_SIZE } = require('../src/services/collectionAllocationStorage.service');
const { runInTransaction } = require('../src/utils/transaction');
test.before(async () => {
  await startMemoryMongo({ dbName: 'bounded-allocation-storage' });
  await AllocationRun.createIndexes(); await AllocationChunk.createIndexes();
});
test.after(stopMemoryMongo);
test('large immutable allocation snapshots remain bounded and retain every monetary row and source reference', async () => {
  const allocations = Array.from({ length: CHUNK_SIZE + 1 }, () => ({ paymentId: null,
    chargeEntryId: new mongoose.Types.ObjectId(), orderId: new mongoose.Types.ObjectId(),
    returnCreditUseId: new mongoose.Types.ObjectId(), engine: 'collection_v2', amountSyp: 1 }));
  const run = await runInTransaction(session => persistRun({ accountId: new mongoose.Types.ObjectId(),
    warehouseId: new mongoose.Types.ObjectId(), actorId: new mongoose.Types.ObjectId(),
    sourceKey: 'synthetic-large-snapshot', reason: 'Synthetic storage acceptance', at: new Date(),
    revision: 1, ledgerSequence: 1 }, { allocations, outstanding: [], unapplied: [] }, session));
  const stored = await AllocationRun.findById(run._id).lean();
  assert.equal(stored.chunked, true); assert.equal(stored.allocations.length, 0);
  assert.equal(await AllocationChunk.countDocuments({ runId: run._id }), 2);
  const recovered = await readProjection(stored);
  assert.equal(recovered.allocations.reduce((n, row) => n + row.amountSyp, 0), CHUNK_SIZE + 1);
  assert.equal(String(recovered.allocations[CHUNK_SIZE].returnCreditUseId), String(allocations[CHUNK_SIZE].returnCreditUseId));
  const chunks = await AllocationChunk.find({ runId: run._id }).lean();
  assert.ok(chunks.every(chunk => chunk.rows.length <= CHUNK_SIZE));
  await AllocationChunk.deleteOne({ runId: run._id, part: 1 });
  await assert.rejects(readProjection(stored), /do not reconcile/);
});
