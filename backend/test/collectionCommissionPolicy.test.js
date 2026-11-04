const test = require('node:test');
const assert = require('node:assert/strict');
const { snapshotTerms, previewCollection, validateManualAllocations } = require('../src/utils/collectionCommissionPolicy');
const terms = { invoiceSyp: 100000, originalCommissionSyp: 2000, areaType: 'city', contractRef: 'illustrative-test-only' };
function preview(collectedSyp, extra = {}) { return previewCollection({ terms, collectedSyp, collector: 'feniq', ...extra }); }
test('no collection earns zero; city partial collection splits the original commission 50/50', () => {
  assert.equal(preview(0).cumulative.feniqSyp, 0);
  assert.deepEqual(preview(40000).cumulative, { originalCommissionSyp: 800, feniqSyp: 400, repSyp: 400, pharmacySyp: 0 });
  assert.equal(preview(100000).cumulative.feniqSyp, 1000);
});
test('rural and owner-confirmed city_ring give the original commission to Feniq, with delivery separate', () => {
  for (const areaType of ['rural', 'city_ring']) {
    const result = preview(40000, { terms: { ...terms, areaType, deliveryFeeSyp: 500 } });
    assert.equal(result.cumulative.feniqSyp, 800); assert.equal(result.cumulative.repSyp, 0);
    assert.equal(result.deliveryFeeSyp, 500); assert.equal(result.previewOnly, true); assert.equal(result.persisted, false);
  }
  assert.equal(preview(100000).deliveryFeeSyp, null);
});
test('warehouse collection needs evidence AND settlement before a positive entitlement is shown', () => {
  for (const extra of [{}, { proofReference: 'proof' }, { settlementConfirmed: true }]) {
    const result = preview(100000, { collector: 'warehouse', ...extra });
    assert.equal(result.eligible, false); assert.equal(result.cumulative.feniqSyp, 0);
  }
  assert.equal(preview(100000, { collector: 'warehouse', proofReference: 'proof', settlementConfirmed: true }).cumulative.feniqSyp, 1000);
});
test('cumulative rounding preserves the total over many partial collections, including large safe integers', () => {
  const invoice = { ...terms, invoiceSyp: 17, originalCommissionSyp: 7 };
  let feniq = 0, rep = 0;
  for (let i = 1; i <= 17; i++) {
    const result = preview(i, { terms: invoice, previousEligibleCollectedSyp: i - 1 });
    feniq += result.increment.feniqSyp; rep += result.increment.repSyp;
  }
  assert.equal(feniq + rep, 7); assert.equal(feniq, 4); assert.equal(rep, 3);
  const n = Number.MAX_SAFE_INTEGER;
  const large = preview(n, { terms: { ...terms, invoiceSyp: n, originalCommissionSyp: n } });
  assert.equal(large.cumulative.feniqSyp + large.cumulative.repSyp, n);
});
test('missing classification, negative/overcollection, unsafe money and undecided returns fail explicitly', () => {
  assert.throws(() => snapshotTerms({ ...terms, areaType: 'unknown' }), { code: 'INVALID_COMMISSION_PREVIEW' });
  for (const amount of [-1, 100001, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => preview(amount));
  assert.throws(() => preview(1000, { returnPending: true }), { code: 'RETURN_POLICY_REVIEW_REQUIRED' });
});
test('manual allocations retain the chosen invoices and leave unapplied cash explicit; no implicit FIFO', () => {
  const allocations = [{ invoiceId: 'invoice-b', amountSyp: 400 }, { invoiceId: 'invoice-a', amountSyp: 300 }];
  const result = validateManualAllocations({ paymentSyp: 1000, allocations });
  assert.deepEqual(result.allocations, allocations); assert.equal(result.unallocatedSyp, 300);
  assert.throws(() => validateManualAllocations({ paymentSyp: 100, allocations }));
  assert.throws(() => validateManualAllocations({ paymentSyp: 1000, allocations: [allocations[0], allocations[0]] }));
  assert.throws(() => validateManualAllocations({ paymentSyp: 1000, allocations: [{ invoiceId: 'a', amountSyp: -1 }] }));
});
