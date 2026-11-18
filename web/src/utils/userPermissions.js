// UI hints from the authenticated server response. Backend authorization
// remains authoritative. Fallback supports a coordinated older server release.
export function hasRolePermission(user, name) {
  if (user?.status !== 'active' || user.role !== 'warehouse') return false;
  if (user.permissions) return user.permissions[name] === true;
  if (name === 'paymentRecord') return true;
  if (name === 'paymentReverse') return user.warehouseRole !== 'owner';
  if (name === 'featureConfigure') return user.warehouseRole !== 'accountant';
  return false;
}

// What a statement allows: recording a payment is open to every warehouse
// login (manager and accountant); reversing one stays with the accountant and
// the original login (owner's call, 2026-11-17). Neither on a past date range.
export function debtDetailActions(user, range) {
  return {
    canRecord: hasRolePermission(user, 'paymentRecord') && !range,
    canReverse: hasRolePermission(user, 'paymentReverse') && !range,
  };
}
