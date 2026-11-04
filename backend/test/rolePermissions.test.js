const test = require('node:test');
const assert = require('node:assert/strict');
const { rolePermissions } = require('../src/utils/rolePermissions');
test('role policy keeps owner read access, accountant cash and legacy compatibility separate', () => {
  const owner = rolePermissions({ role: 'warehouse', status: 'active', warehouseRole: 'owner' });
  assert.equal(owner.financialRead, true); assert.equal(owner.paymentRecord, false); assert.equal(owner.featureConfigure, true);
  const accountant = rolePermissions({ role: 'warehouse', status: 'active', warehouseRole: 'accountant' });
  assert.equal(accountant.paymentRecord, true); assert.equal(accountant.paymentReverse, true); assert.equal(accountant.featureConfigure, false);
  const legacy = rolePermissions({ role: 'warehouse', status: 'active' });
  assert.equal(legacy.paymentRecord, true); assert.equal(legacy.featureConfigure, true);
});
test('pending, blocked and deleted accounts never receive operational or cash permissions', () => {
  for (const status of ['pending', 'blocked', 'deleted']) {
    const result = rolePermissions({ role: 'warehouse', status, warehouseRole: 'accountant' });
    for (const value of Object.values(result)) assert.equal(value, false);
  }
  const pharmacy = rolePermissions({ role: 'pharmacy', status: 'pending' });
  assert.equal(pharmacy.ownProfileEdit, true); assert.equal(pharmacy.financialRead, false);
});
test('rep and pharmacy never gain warehouse cash or platform grants; admin does not become a cashier', () => {
  for (const role of ['rep', 'pharmacy', 'admin']) {
    const result = rolePermissions({ role, status: 'active' });
    assert.equal(result.paymentRecord, false);
    assert.equal(result.featureGrant, role === 'admin');
    assert.equal(result.visitRecord, role === 'rep');
  }
});
