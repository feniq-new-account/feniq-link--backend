// Role permissions only. Tenant scope, feature entitlements and launch status
// remain independent server checks; clients cannot grant these permissions.
function rolePermissions(user) {
  const active = user?.status === 'active';
  const admin = active && user.role === 'admin';
  const warehouse = active && user.role === 'warehouse';
  const operator = warehouse && user.warehouseRole !== 'owner';
  return {
    platformManage: admin,
    warehouseOperate: warehouse,
    financialRead: admin || warehouse || (active && user?.role === 'pharmacy'),
    paymentRecord: operator,
    paymentReverse: operator,
    // Proof approval is a NEW action: it requires an explicit accountant,
    // never owner, admin, rep or an unspecified legacy combined login.
    paymentProofReview: warehouse && user.warehouseRole === 'accountant',
    featureConfigure: warehouse && user.warehouseRole !== 'accountant',
    featureGrant: admin,
    visitRecord: active && user?.role === 'rep',
    ownProfileEdit: user?.role === 'pharmacy' && ['active', 'pending'].includes(user.status),
  };
}
module.exports = { rolePermissions };
