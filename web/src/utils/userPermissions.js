// UI hints from the authenticated server response. Backend authorization
// remains authoritative. Fallback supports a coordinated older server release.
export function hasRolePermission(user, name) {
  if (user?.status !== 'active' || user.role !== 'warehouse') return false;
  if (user.permissions) return user.permissions[name] === true;
  if (['paymentRecord', 'paymentReverse'].includes(name)) return user.warehouseRole !== 'owner';
  if (name === 'featureConfigure') return user.warehouseRole !== 'accountant';
  return false;
}
