'use strict';
// Time-limited pharmacist trial access, independent from the money-flow
// implementation. The global launch deadline still controls all new orders.
// A timed pilot is deny-by-default unless the admin explicitly selects
// eligible pharmacy accounts, and only known demo warehouses can receive
// such orders. No payment, stock, invoice or commission writes occur here.
const PlatformSetting = require('../models/platformSetting.model');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const Pharmacy = require('../models/pharmacy.model');
const Order = require('../models/order.model');
const launch = require('./launch.service');
const { ApiError } = require('../utils/ApiError');

const KEY = 'pilotOrderAccess';
const DEMO_WAREHOUSE_PHONES = Object.freeze(['0930000101', '0930000102', '0930000103']);
const MAX_PHARMACIES = 25;
const VALID_PHONE = /^(?:09\d{8}|\+9639\d{8})$/;

async function readPilotAccess() {
  const row = await PlatformSetting.findOne({ key: KEY }).lean();
  return row?.value || { allowedPhones: [], revision: 0 };
}

async function savePilotAccess(actorId, body) {
  if (!body || Object.keys(body).some(key => !['allowedPhones', 'revision'].includes(key)) ||
      !Array.isArray(body.allowedPhones) || body.allowedPhones.length > MAX_PHARMACIES ||
      !Number.isSafeInteger(body.revision) || body.revision < 0 ||
      body.allowedPhones.some(phone => typeof phone !== 'string' || !VALID_PHONE.test(phone))) {
    throw ApiError.badRequest('Invalid pilot pharmacy list.', undefined, 'INVALID_PILOT_ACCESS');
  }
  const allowedPhones = [...new Set(body.allowedPhones)];
  if (allowedPhones.length) {
    const active = await User.find({ role: 'pharmacy', status: 'active',
      phone: { $in: allowedPhones } }).select('phone').lean();
    if (active.length !== allowedPhones.length) {
      throw ApiError.badRequest('All pilot phones must belong to active pharmacies.',
        undefined, 'PILOT_PHARMACY_NOT_ACTIVE');
    }
  }
  await PlatformSetting.init();
  const previous = await readPilotAccess();
  if (previous.revision !== body.revision) {
    throw ApiError.conflict('Pilot access changed. Reload before saving.', 'PILOT_ACCESS_CHANGED');
  }
  const value = { allowedPhones, revision: body.revision + 1, updatedBy: actorId,
    updatedAt: new Date(), history: [...(previous.history || []), {
      allowedPhones: previous.allowedPhones || [], revision: previous.revision,
      updatedBy: previous.updatedBy, updatedAt: previous.updatedAt,
    }].slice(-20) };
  const filter = { key: KEY, ...(body.revision === 0
    ? { $or: [{ 'value.revision': 0 }, { value: { $exists: false } }] }
    : { 'value.revision': body.revision }) };
  let result;
  try {
    result = await PlatformSetting.findOneAndUpdate(filter, { $set: { value } },
      { upsert: body.revision === 0, new: true, runValidators: true }).lean();
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('Pilot access changed.', 'PILOT_ACCESS_CHANGED');
    throw err;
  }
  if (!result) throw ApiError.conflict('Pilot access changed.', 'PILOT_ACCESS_CHANGED');
  return result.value;
}

function activePilotWindow(configuration, now = Date.now()) {
  return configuration.mode === 'ordering_open' &&
    configuration.orderingClosesAt != null &&
    Date.parse(configuration.orderingClosesAt) > now;
}

async function hasCommittedReplay(userId, idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 100) return false;
  const pharmacy = await Pharmacy.findOne({ userId }).select('_id').lean();
  if (!pharmacy) return false;
  return Boolean(await Order.exists({ pharmacyId: pharmacy._id, idempotencyKey }));
}

async function assertPilotOrderAccess({ userId, warehouseId, idempotencyKey }) {
  const configuration = await launch.readLaunch();
  if (!activePilotWindow(configuration)) return;

  // Keep money-flow's existing idempotency replay behavior: a previously
  // committed order can be safely replayed even after a tester is removed.
  if (await hasCommittedReplay(userId, idempotencyKey)) return;

  const access = await readPilotAccess();
  const tester = await User.exists({ _id: userId, role: 'pharmacy',
    status: 'active', phone: { $in: access.allowedPhones || [] } });
  if (!tester) {
    throw new ApiError(403,
      'الطلبات متاحة حالياً فقط للصيدليات المشاركة في التجربة.',
      undefined, 'PILOT_ACCESS_RESTRICTED');
  }
  const warehouse = await Warehouse.findOne({ _id: warehouseId, isActive: true })
    .select('userId').lean();
  const demoOwner = warehouse && await User.exists({
    _id: warehouse.userId, role: 'warehouse', status: 'active',
    phone: { $in: DEMO_WAREHOUSE_PHONES },
  });
  if (!demoOwner) {
    throw new ApiError(403,
      'خلال التجربة يمكن إرسال الطلبات إلى المستودعات التجريبية المفعّلة فقط.',
      undefined, 'PILOT_WAREHOUSE_RESTRICTED');
  }
}

module.exports = { KEY, readPilotAccess, savePilotAccess, activePilotWindow,
  assertPilotOrderAccess, DEMO_WAREHOUSE_PHONES };
