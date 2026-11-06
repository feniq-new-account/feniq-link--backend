const { AllocationRun, AllocationChunk } = require('../models/collectionAccounting.model');
const SECTIONS = ['allocations', 'unapplied', 'outstanding'];
const COUNT = { allocations: 'allocationCount', unapplied: 'unappliedCount', outstanding: 'outstandingCount' };
const CHUNK_SIZE = 500;
async function persistRun(header, projection, session) {
  if (!session?.inTransaction()) throw new Error('Allocation storage requires a transaction.');
  const chunked = SECTIONS.some(section => projection[section].length > CHUNK_SIZE);
  const counts = Object.fromEntries(SECTIONS.map(section => [COUNT[section], projection[section].length]));
  const rows = Object.fromEntries(SECTIONS.map(section => [section, chunked ? [] : projection[section]]));
  const [run] = await AllocationRun.create([{ ...header, chunked, ...counts, ...rows }], { session });
  if (chunked) for (const section of SECTIONS) {
    for (let offset = 0; offset < projection[section].length; offset += CHUNK_SIZE) {
      await AllocationChunk.create([{ runId: run._id, accountId: run.accountId, warehouseId: run.warehouseId,
        section, part: offset / CHUNK_SIZE, rows: projection[section].slice(offset, offset + CHUNK_SIZE) }], { session });
    }
  }
  return run;
}
async function readProjection(run, session = null) {
  const result = Object.fromEntries(SECTIONS.map(section => [section, []]));
  if (!run.chunked) for (const section of SECTIONS) result[section] = run[section];
  else {
    const chunks = await AllocationChunk.find({ runId: run._id, accountId: run.accountId, warehouseId: run.warehouseId })
      .sort({ section: 1, part: 1 }).session(session).lean();
    for (const section of SECTIONS) {
      const parts = chunks.filter(chunk => chunk.section === section);
      if (parts.some((part, i) => part.part !== i || part.rows.length > CHUNK_SIZE)) throw new Error('Allocation chunks do not reconcile.');
      result[section] = parts.flatMap(part => part.rows);
    }
  }
  if (SECTIONS.some(section => result[section].length !== run[COUNT[section]])) throw new Error('Allocation row counts do not reconcile.');
  return result;
}
module.exports = { persistRun, readProjection, CHUNK_SIZE };
