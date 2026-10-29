const bcrypt = require('bcrypt');
const Warehouse = require('../models/warehouse.model');
const User = require('../models/user.model');
const Audit = require('../models/warehouseAudit.model');
const { normalizePhone, isValidPhone } = require('../utils/phone');
const { assertPasswordPolicy } = require('../utils/password');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');

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
      return { id: user._id, name: user.name, phone: user.phone, role: user.role, warehouseRole };
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
    .select('name phone role warehouseRole status').lean();
  return users.map((user) => ({ id: user._id, name: user.name, phone: user.phone,
    role: user.role, warehouseRole: user.warehouseRole || 'legacy', status: user.status }));
}

async function setWarehouseMemberRole(warehouseId, userId, actorId, warehouseRole) {
  if (!['owner', 'accountant'].includes(warehouseRole)) throw ApiError.badRequest('Invalid account role.', undefined, 'INVALID_WAREHOUSE_MEMBER');
  await runInTransaction(async (session) => {
    const warehouse = await Warehouse.findOne({ _id: warehouseId, $or: [{ userId }, { memberUserIds: userId }] }).session(session);
    if (!warehouse) throw ApiError.notFound('Member not found in this warehouse.', 'WAREHOUSE_MEMBER_NOT_FOUND');
    const user = await User.findOne({ _id: userId, role: 'warehouse' }).session(session);
    if (!user) throw ApiError.notFound('Member not found.', 'WAREHOUSE_MEMBER_NOT_FOUND');
    const before = user.warehouseRole || 'legacy';
    if (before === warehouseRole) return;
    user.warehouseRole = warehouseRole;
    user.tokenVersion += 1;
    await user.save({ session });
    await Audit.create([{ warehouseId, actorId, action: 'member.role_changed',
      before: { userId, warehouseRole: before }, after: { userId, warehouseRole },
    }], { session });
  });
  return listWarehouseMembers(warehouseId);
}

module.exports = { createWarehouseMember, listWarehouseMembers, setWarehouseMemberRole };
