'use strict';
// Deletes the known demo/pilot warehouses and everything scoped to them, so
// real ordering starts with the first real warehouse on a clean page (owner's
// call, 2026-11-17: every warehouse in the system today is a demo; Asfoura is
// the first real one).
//
// What goes: each demo warehouse, its own logins (owner/members, its reps),
// and every record that names it - products, offers, orders and their items,
// returns, payments, the pharmacy<->warehouse ledger accounts with their
// entries, credits, loyalty, discount codes, complaints, reviews, imports,
// collection/remittance records, audits - plus the pharmacists' notifications
// about those orders.
//
// What NEVER goes: pharmacy accounts (users with role 'pharmacy' and their
// Pharmacy profiles), admin accounts, drivers and delivery trips (admin-level,
// not tied to a warehouse), the global catalog, and the financial audit log
// (kept as the trail, with one 'maintenance.demo_purge' row per warehouse).
//
// Only the three pilot phones qualify - a real warehouse can never be
// selected. The write needs the exact plan the admin previewed (planToken)
// and a typed confirmation, and runs in one transaction: all or nothing.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const financialAudit = require('./financialAudit.service');

// The demo warehouses' owner logins (same list as the maintenance preview).
const PILOT_PHONES = Object.freeze(['0930000101', '0930000102', '0930000103']);
const CONFIRM_PHRASE = 'احذف المستودعات التجريبية';

// Models that must never be swept even if they carry a warehouseId-like path.
const NEVER_SWEEP = new Set(['User', 'Pharmacy', 'FinancialAuditLog', 'Warehouse']);

let modelsLoaded = false;
function loadAllModels() {
  if (modelsLoaded) return;
  const dir = path.join(__dirname, '..', 'models');
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.model.js')) require(path.join(dir, file));
  }
  modelsLoaded = true;
}

// Every registered model with a warehouseId path, sorted for a stable plan.
function warehouseScopedModels() {
  loadAllModels();
  return mongoose.modelNames()
    .filter((name) => !NEVER_SWEEP.has(name))
    .map((name) => mongoose.model(name))
    .filter((model) => model.schema.path('warehouseId'))
    .sort((a, b) => a.modelName.localeCompare(b.modelName));
}

function optionalModel(name) {
  loadAllModels();
  return mongoose.modelNames().includes(name) ? mongoose.model(name) : null;
}

async function findDemoWarehouses(session = null) {
  const owners = await User.find({ phone: { $in: PILOT_PHONES }, role: 'warehouse' })
    .select('_id phone').session(session).lean();
  const warehouses = await Warehouse.find({ userId: { $in: owners.map((u) => u._id) } })
    .select('_id userId memberUserIds nameAr nameEn city').session(session).lean();
  return warehouses;
}

// The logins that belong only to these warehouses: the owner, its members and
// its reps - and only with a warehouse or rep role. A pharmacy or admin user
// can never end up here, whatever the data says.
async function warehouseLogins(warehouses, session = null) {
  const ids = new Set();
  for (const w of warehouses) {
    ids.add(String(w.userId));
    for (const m of w.memberUserIds || []) ids.add(String(m));
  }
  const Rep = optionalModel('Rep');
  if (Rep) {
    const reps = await Rep.find({ warehouseId: { $in: warehouses.map((w) => w._id) } })
      .select('userId').session(session).lean();
    for (const r of reps) if (r.userId) ids.add(String(r.userId));
  }
  if (ids.size === 0) return [];
  return User.find({ _id: { $in: [...ids] }, role: { $in: ['warehouse', 'rep'] } })
    .select('_id name phone role warehouseRole').session(session).lean();
}

// Everything the purge would delete, as { label, model, filter } steps.
async function buildSteps(warehouses, logins, session = null) {
  const warehouseIds = warehouses.map((w) => w._id);
  const inWarehouses = { warehouseId: { $in: warehouseIds } };
  const steps = [];

  const Order = mongoose.model('Order');
  const orderIds = (await Order.find(inWarehouses).select('_id').session(session).lean()).map((o) => o._id);
  const LedgerAccount = optionalModel('LedgerAccount');
  const accountIds = LedgerAccount
    ? (await LedgerAccount.find(inWarehouses).select('_id').session(session).lean()).map((a) => a._id)
    : [];
  const DiscountCode = optionalModel('DiscountCode');
  const codeIds = DiscountCode
    ? (await DiscountCode.find(inWarehouses).select('_id').session(session).lean()).map((c) => c._id)
    : [];

  // Records hanging off orders, ledger accounts and the warehouses' own codes
  // that do not carry a warehouseId themselves.
  const OrderItem = optionalModel('OrderItem');
  if (OrderItem) steps.push({ label: 'OrderItem', model: OrderItem, filter: { orderId: { $in: orderIds } } });
  const Notification = optionalModel('Notification');
  if (Notification) {
    steps.push({ label: 'Notification', model: Notification, filter: { $or: [
      { relatedOrderId: { $in: orderIds } }, { relatedWarehouseId: { $in: warehouseIds } },
      { userId: { $in: logins.map((u) => u._id) } },
    ] } });
  }
  const LedgerEntry = optionalModel('LedgerEntry');
  if (LedgerEntry) {
    steps.push({ label: 'LedgerEntry (by account)', model: LedgerEntry, filter: { accountId: { $in: accountIds } } });
  }
  const Usage = optionalModel('DiscountCodePharmacyUsage');
  if (Usage) steps.push({ label: 'DiscountCodePharmacyUsage', model: Usage, filter: { codeId: { $in: codeIds } } });

  for (const model of warehouseScopedModels()) {
    steps.push({ label: model.modelName, model, filter: inWarehouses });
  }
  return steps;
}

function planToken(summary) {
  return crypto.createHash('sha256').update(JSON.stringify(summary)).digest('hex').slice(0, 16);
}

async function plan(session = null) {
  const warehouses = await findDemoWarehouses(session);
  const logins = await warehouseLogins(warehouses, session);
  const steps = warehouses.length ? await buildSteps(warehouses, logins, session) : [];
  const counts = {};
  for (const step of steps) {
    const n = await step.model.countDocuments(step.filter).session(session);
    if (n > 0) counts[step.label] = (counts[step.label] || 0) + n;
  }
  const summary = {
    warehouses: warehouses.map((w) => ({ id: String(w._id), nameAr: w.nameAr, nameEn: w.nameEn, city: w.city })),
    logins: logins.map((u) => ({ id: String(u._id), name: u.name, phone: u.phone, role: u.role })),
    counts,
  };
  return { summary, steps, warehouses, logins };
}

// Read-only: what would be deleted, and the token the delete must echo.
async function previewDemoPurge() {
  const { summary } = await plan();
  const pharmacyAccounts = await User.countDocuments({ role: 'pharmacy' });
  return { ...summary, pharmacyAccountsKept: pharmacyAccounts, planToken: planToken(summary),
    confirmPhrase: CONFIRM_PHRASE };
}

async function executeDemoPurge(actorId, { planToken: token, confirm } = {}) {
  if (confirm !== CONFIRM_PHRASE) {
    throw ApiError.badRequest('Type the confirmation phrase exactly.', undefined, 'DEMO_PURGE_CONFIRM_REQUIRED');
  }
  if (typeof token !== 'string' || !token) {
    throw ApiError.badRequest('Preview first, then confirm that plan.', undefined, 'DEMO_PURGE_PLAN_REQUIRED');
  }
  const pharmacyUsersBefore = await User.countDocuments({ role: 'pharmacy' });
  const result = await runInTransaction(async (session) => {
    const current = await plan(session);
    if (planToken(current.summary) !== token) {
      throw ApiError.conflict('The data changed since the preview. Preview again.', 'DEMO_PURGE_PLAN_CHANGED');
    }
    if (current.warehouses.length === 0) return { deleted: {}, warehouses: [], logins: [] };
    const deleted = {};
    for (const step of current.steps) {
      const { deletedCount } = await step.model.deleteMany(step.filter, { session });
      if (deletedCount) deleted[step.label] = (deleted[step.label] || 0) + deletedCount;
    }
    const loginIds = current.logins.map((u) => u._id);
    const RefreshToken = optionalModel('RefreshToken');
    if (RefreshToken && loginIds.length) await RefreshToken.deleteMany({ userId: { $in: loginIds } }, { session });
    // Belt and braces: the login list is role-filtered already.
    const users = await User.deleteMany({ _id: { $in: loginIds }, role: { $in: ['warehouse', 'rep'] } }, { session });
    deleted.User = users.deletedCount;
    const warehouseDocs = await Warehouse.deleteMany({ _id: { $in: current.warehouses.map((w) => w._id) } }, { session });
    deleted.Warehouse = warehouseDocs.deletedCount;
    for (const w of current.warehouses) {
      await financialAudit.record({
        action: 'maintenance.demo_purge', actorId, actorRole: 'admin',
        entityType: 'Warehouse', entityId: w._id,
        before: { nameAr: w.nameAr, nameEn: w.nameEn, city: w.city },
        after: { deletedCounts: current.summary.counts, logins: current.summary.logins.length },
      }, session);
    }
    return { deleted, warehouses: current.summary.warehouses, logins: current.summary.logins };
  });
  // Never part of it - checked after the commit as well.
  const pharmacyUsersAfter = await User.countDocuments({ role: 'pharmacy' });
  return { ...result, pharmacyAccountsKept: pharmacyUsersAfter, pharmacyAccountsUnchanged: pharmacyUsersAfter === pharmacyUsersBefore };
}

module.exports = { previewDemoPurge, executeDemoPurge, PILOT_PHONES, CONFIRM_PHRASE };
