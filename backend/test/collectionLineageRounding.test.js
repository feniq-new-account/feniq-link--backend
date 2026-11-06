const test = require('node:test');
const assert = require('node:assert/strict');
const { eligibleFunding } = require('../src/services/collectionLedger.service');

// Independent conservation invariants over small odd amounts. Invoice amounts
// and rates are synthetic; no production contract/default is supplied here.
test('credit lineage preserves each beneficiary budget over partial/full cash and odd split values', () => {
  let cases = 0;
  for (const areaType of ['city', 'rural']) for (const rateBps of [750, 1000]) {
    for (let face = 2; face <= 31; face++) for (let returned = 1; returned <= face; returned++) {
      for (const collected of [...new Set([0, Math.floor(face / 2), face])]) {
        const potential = Math.floor((face * rateBps + 5000) / 10000);
        const returnedCommission = Math.floor((potential * returned * 2 + face) / (face * 2));
        const parts = [Math.floor(returned / 2), returned - Math.floor(returned / 2)].filter(n => n > 0);
        const parent = { _id: 'parent-invoice', orderId: 'parent-order', chargeEntryId: 'parent-charge',
          terms: { invoiceSyp: face, originalCommissionSyp: potential, originalRateBps: rateBps, areaType } };
        const children = parts.map((value, i) => ({ _id: `child-invoice-${i}`, orderId: `child-order-${i}`,
          chargeEntryId: `child-charge-${i}`, terms: { invoiceSyp: value,
            originalCommissionSyp: Math.floor((value * rateBps + 5000) / 10000), originalRateBps: rateBps, areaType } }));
        const credit = { _id: 'credit', invoiceId: parent._id, amountSyp: returned, returnedCommissionSyp: returnedCommission };
        const uses = parts.map((value, i) => ({ _id: `use-${i}`, orderId: children[i].orderId, creditId: credit._id, amountSyp: value }));
        const entries = [parent, ...children].map(invoice => ({ _id: invoice.chargeEntryId, kind: 'charge' }));
        for (let i = 0; i < parts.length; i++) entries.push({ _id: `application-${i}`, kind: 'return_credit_application',
          amountSyp: parts[i], source: { orderId: children[i].orderId, returnCreditUseId: uses[i]._id } });
        const state = eligibleFunding([parent, ...children], [{ chargeEntryId: parent.chargeEntryId,
          paymentId: 'actual-cash', amountSyp: collected }], new Set(['actual-cash']), [credit], uses, entries);
        const before = state.targets.get(parent._id)(potential);
        const after = [state.targets.get(parent._id)(potential - returnedCommission),
          ...children.map(child => state.targets.get(child._id)(child.terms.originalCommissionSyp))];
        for (const key of ['originalCommissionSyp', 'feniqSyp', 'repSyp']) {
          const total = after.reduce((n, row) => n + row[key], 0);
          assert.ok(total <= before[key], `${key} inflated: face${face},returned${returned},cash${collected},rate${rateBps},${areaType}`);
        }
        for (const child of children) {
          let prior = { originalCommissionSyp: 0, feniqSyp: 0, repSyp: 0 };
          for (let net = 0; net <= child.terms.originalCommissionSyp; net++) {
            const current = state.targets.get(child._id)(net);
            assert.equal(current.feniqSyp + current.repSyp, current.originalCommissionSyp);
            for (const key of Object.keys(prior)) assert.ok(current[key] >= prior[key], 'return budgets must remain nonnegative');
            prior = current;
          }
        }
        cases++;
      }
    }
  }
  assert.ok(cases > 5000);
});
