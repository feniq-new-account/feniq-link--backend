const bcrypt = require('bcrypt');
const Warehouse = require('../models/warehouse.model');
const User = require('../models/user.model');
const Audit = require('../models/warehouseAudit.model');
const { normalizePhone, isValidPhone } = require('../utils/phone');
const { assertPasswordPolicy } = require('../utils/password');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const { rolePermissions } = require('../utils/rolePermissions');

async function createWarehouseMember(warehouseId, actorId, { name, phone, password, warehouseRole }) {
  if (typeof name !== 'string' || !name.trim() || name.length > 120 || !['owner', 'accountant'].includes(warehouseRole)) {
    throw ApiError.badRequest('Name and warehouse account role are required.', undefined, 'INVALID_WAREHOUSE_MEMBER');
  }
  const cleanPhone = typeof phone === 'string' ? normalizePhone(phone) : '';
  if (!isValidPhone(cleanPhone)) throw ApiError.badRequest('Invalid phone.', undefined, 'INVALID_PHONE_FORMAT');
  assertPasswordPolicy(password, { role: 'warehouse', code: 'INVALID_PASSWORD' });
  const hashed = await bcrypt.hash(password, 10);
  try {
    return await runInTransaction(async (session) => {
      const warehouse = await Warehouse.findById(warehouseId).session(session);
      if (!warehouse) throw ApiError.notFound('Warehouse not found.', 'WAREHOUSE_NOT_FOUND');
      const [user] = await User.create([{
        name: name.trim(), phone: cleanPhone, password: hashed, role: 'warehouse',
        warehouseRole, status: 'active', mustChangePassword: true,
      }], { session });
      warehouse.memberUserIds.addToSet(user._id);
      await warehouse.save({ session });
      await Audit.create([{ warehouseId, actorId, action: 'member.created',
        after: { userId: user._id, name: user.name, phone: user.phone, warehouseRole },
      }], { session });
      return { id: user._id, name: user.name, phone: user.phone, role: user.role, warehouseRole,
        status: user.status, accessRevision: user.accessRevision || 0, permissions: rolePermissions(user) };
    });
  } catch (error) {
    if (error.code === 11000) throw ApiError.conflict('This phone already has an account.', 'PHONE_ALREADY_REGISTERED');
    throw error;
  }
}

async function listWarehouseMembers(warehouseId) {
  const warehouse = await Warehouse.findById(warehouseId).select('userId memberUserIds').lean();
  if (!warehouse) throw ApiError.notFound('Warehouse not found.', 'WAREHOUSE_NOT_FOUND');
  const users = await User.find({ _id: { $in: [warehouse.userId, ...(warehouse.memberUserIds || [])] } })
    .select('name phone role warehouseRole status accessRevision').lean();
  return users.map((user) => ({ id: user._id, name: user.name, phone: user.phone,
    role: user.role, warehouseRole: user.warehouseRole || 'legacy', status: user.status,
    accessRevision: user.accessRevision || 0, permissions: rolePermissions(user) }));
}

async function setWarehouseMemberRole(warehouseId, userId, actorId, warehouseRole, { revision, reason } = {}) {
  if (!['owner', 'accountant'].includes(warehouseRole)) throw ApiError.badRequest('Invalid account role.', undefined, 'INVALID_WAREHOUSE_MEMBER');
  if (!Number.isSafeInteger(revision) || revision < 0 || typeof reason !== 'string' || !reason.trim() || reason.length > 1000) {
    throw ApiError.badRequest('Revision and reason are required for an access change.', undefined, 'INVALID_MEMBER_ACCESS');
  }
  let changed = false;
  await runInTransaction(async (session) => {
    changed = false;
    const warehouse = await Warehouse.findOne({ _id: warehouseId, $or: [{ userId }, { memberUserIds: userId }] }).session(session);
    if (!warehouse) throw ApiError.notFound('Member not found in this warehouse.', 'WAREHOUSE_MEMBER_NOT_FOUND');
    // A user-level CAS alone permits two different owners to both downgrade
    // from the same snapshot. The shared write forces a transaction retry;
    // its new snapshot then observes the remaining owner's current role.
    await Warehouse.updateOne({ _id: warehouse._id }, { $inc: { memberAccessRevision: 1 } }, { session });
    const user = await User.findOne({ _id: userId, role: 'warehouse' }).session(session);
    if (!user) throw ApiError.notFound('Member not found.', 'WAREHOUSE_MEMBER_NOT_FOUND');
    if ((user.accessRevision || 0) !== revision) throw ApiError.conflict('Account permissions changed. Reload first.', 'MEMBER_ACCESS_CHANGED');
    const before = user.warehouseRole || 'legacy';
    if (before === warehouseRole) return;
    if (warehouseRole === 'accountant' && user.status === 'active' && before !== 'accountant') {
      const anotherOwner = await User.exists({ _id: { $in: [warehouse.userId, ...(warehouse.memberUserIds || [])], $ne: user._id },
        role: 'warehouse', status: 'active', warehouseRole: { $in: ['owner', null] } }).session(session);
      if (!anotherOwner) throw ApiError.conflict('Add an active owner before changing the last owner role.', 'LAST_WAREHOUSE_OWNER');
    }
    user.warehouseRole = warehouseRole;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.accessRevision = (user.accessRevision || 0) + 1;
    await user.save({ session });
    await Audit.create([{ warehouseId, actorId, action: 'member.role_changed', reason: reason.trim(),
      before: { userId, warehouseRole: before, revision }, after: { userId, warehouseRole, revision: user.accessRevision },
    }], { session });
    changed = true;
  });
  // Revoke live connections only after the role and its audit commit.
  if (changed) require('../realtime').disconnectUser(String(userId));
  return listWarehouseMembers(warehouseId);
}

module.exports = { createWarehouseMember, listWarehouseMembers, setWarehouseMemberRole };
