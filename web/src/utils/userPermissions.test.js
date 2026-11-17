import { expect, it } from 'vitest';
import { hasRolePermission } from './userPermissions';
it('uses explicit backend denial and preserves legacy roles only for older servers', () => {
  const user = { role: 'warehouse', status: 'active', warehouseRole: 'accountant' };
  expect(hasRolePermission(user, 'paymentRecord')).toBe(true);
  expect(hasRolePermission({ ...user, permissions: { paymentRecord: false } }, 'paymentRecord')).toBe(false);
  expect(hasRolePermission({ ...user, warehouseRole: 'owner' }, 'paymentRecord')).toBe(true);
  expect(hasRolePermission({ ...user, warehouseRole: 'owner' }, 'paymentReverse')).toBe(false);
  expect(hasRolePermission({ ...user, status: 'blocked', permissions: { paymentRecord: true } }, 'paymentRecord')).toBe(false);
  expect(hasRolePermission({ ...user, role: 'pharmacy', permissions: { paymentRecord: true } }, 'paymentRecord')).toBe(false);
});

it('on a statement the manager records but cannot reverse; the accountant does both', async () => {
  const { debtDetailActions } = await import('./userPermissions');
  const base = { role: 'warehouse', status: 'active' };
  const owner = { ...base, warehouseRole: 'owner', permissions: { paymentRecord: true, paymentReverse: false } };
  const accountant = { ...base, warehouseRole: 'accountant', permissions: { paymentRecord: true, paymentReverse: true } };
  expect(debtDetailActions(owner, null)).toEqual({ canRecord: true, canReverse: false });
  expect(debtDetailActions(accountant, null)).toEqual({ canRecord: true, canReverse: true });
  expect(debtDetailActions(accountant, { from: '2026-01-01' })).toEqual({ canRecord: false, canReverse: false });
});
