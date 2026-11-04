import { expect, it } from 'vitest';
import { hasRolePermission } from './userPermissions';
it('uses explicit backend denial and preserves legacy roles only for older servers', () => {
  const user = { role: 'warehouse', status: 'active', warehouseRole: 'accountant' };
  expect(hasRolePermission(user, 'paymentRecord')).toBe(true);
  expect(hasRolePermission({ ...user, permissions: { paymentRecord: false } }, 'paymentRecord')).toBe(false);
  expect(hasRolePermission({ ...user, warehouseRole: 'owner' }, 'paymentRecord')).toBe(false);
  expect(hasRolePermission({ ...user, status: 'blocked', permissions: { paymentRecord: true } }, 'paymentRecord')).toBe(false);
  expect(hasRolePermission({ ...user, role: 'pharmacy', permissions: { paymentRecord: true } }, 'paymentRecord')).toBe(false);
});
