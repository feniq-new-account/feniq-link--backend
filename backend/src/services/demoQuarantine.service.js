const bcrypt = require('bcrypt');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const RefreshToken = require('../models/refreshToken.model');
const { DEMO_ADMIN, WAREHOUSES, DEMO_WAREHOUSE_PASSWORD } = require('./demoSeed.service');

// Existing deployments may already contain the old default seed. Only the
// exact known demo identity AND unchanged public demo password qualify; never
// delete accounts, orders or financial history, or block a changed credential.
async function quarantineDemoCredentials(nodeEnv) {
  if (nodeEnv !== 'production') return 0;
  let quarantined = 0;
  const candidates = [
    { phone: DEMO_ADMIN.phone, role: 'admin', password: DEMO_ADMIN.password },
    ...WAREHOUSES.map(w => ({ phone: w.phone, role: 'warehouse', password: DEMO_WAREHOUSE_PASSWORD })),
  ];
  for (const candidate of candidates) {
    const user = await User.findOne({ phone: candidate.phone, role: candidate.role }).select('+password status tokenVersion');
    if (!user?.password || ['blocked', 'deleted'].includes(user.status) || !(await bcrypt.compare(candidate.password, user.password))) continue;
    const result = await User.updateOne({ _id: user._id, password: user.password }, {
      $set: { status: 'blocked' }, $inc: { tokenVersion: 1 },
    });
    if (!result.matchedCount) continue;
    await RefreshToken.deleteMany({ userId: user._id });
    if (candidate.role === 'warehouse') await Warehouse.updateMany({ userId: user._id }, { $set: { isActive: false } });
    quarantined++;
  }
  return quarantined;
}
module.exports = { quarantineDemoCredentials };
