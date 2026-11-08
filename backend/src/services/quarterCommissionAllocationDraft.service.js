'use strict';
// Admin-staged four-quarter distribution. This setting is deliberately NOT
// consulted by active collection_v2 writers. Publishing a draft must never
// revalue an existing invoice, paid receipt, credit or remittance.
const PlatformSetting = require('../models/platformSetting.model');
const User = require('../models/user.model');
const audit = require('./financialAudit.service');
const { runInTransaction } = require('../utils/transaction');
const { rolePermissions } = require('../utils/rolePermissions');
const { ApiError } = require('../utils/ApiError');
const {
  VERSION, DEFAULT_PLAN, validatePlan, incrementOnVerifiedCollection,
  correctionForReturn,
} = require('../utils/quarterCommissionAllocation');

const KEY = 'commissionQuarterAllocationDraft';
const conflict = () => ApiError.conflict(
  'This draft was changed by another administrator. Reload before saving.',
  'COMMISSION_QUARTER_DRAFT_CHANGED'
);
function readView(value) {
  // Invalid stored values must fail closed, never affect a financial run.
  if (!value) return {
    policyVersion: VERSION, revision: 0, plan: validatePlan(DEFAULT_PLAN),
    draftOnly: true, appliesToLiveAccounting: false, updatedAt: null,
  };
  return {
    policyVersion: VERSION, revision: value.revision,
    plan: validatePlan(value.plan), draftOnly: true, appliesToLiveAccounting: false,
    updatedAt: value.updatedAt ?? null,
  };
}
async function readDraft() {
  const doc = await PlatformSetting.findOne({ key: KEY }).select('value').lean();
  if (doc?.value && (!Number.isSafeInteger(doc.value.revision) || doc.value.revision < 1 ||
      doc.value.policyVersion !== VERSION)) {
    throw ApiError.conflict('Saved draft version is invalid.', 'COMMISSION_QUARTER_DRAFT_INVALID');
  }
  return readView(doc?.value);
}
async function saveDraft(actorId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['revision', 'plan', 'reason'].includes(key)) ||
      !Number.isSafeInteger(body.revision) || body.revision < 0 ||
      typeof body.reason !== 'string' || body.reason.trim().length < 5 ||
      body.reason.length > 500) {
    throw ApiError.badRequest('Draft revision and reason are required.', undefined, 'INVALID_QUARTER_DRAFT');
  }
  const plan = validatePlan(body.plan);
  const work = async session => {
    const user = await User.findById(actorId).select('role status').session(session).lean();
    if (!rolePermissions(user).platformManage) throw ApiError.forbidden('Active platform admin required.');
    const old = await PlatformSetting.findOne({ key: KEY }).session(session).lean();
    const expected = old?.value?.revision ?? 0;
    if (expected !== body.revision) throw conflict();
    const value = {
      revision: expected + 1,
      policyVersion: VERSION,
      plan,
      updatedBy: actorId,
      updatedAt: new Date(),
    };
    const filter = {
      key: KEY,
      ...(expected
        ? { 'value.revision': expected }
        : { $or: [{ value: { $exists: false } }, { 'value.revision': 0 }] }),
    };
    const changed = await PlatformSetting.findOneAndUpdate(
      filter, { $set: { value } },
      { session, new: true, upsert: expected === 0, runValidators: true }
    ).lean();
    if (!changed) throw conflict();
    await audit.record({
      action: 'commission.quarter_draft_saved', actorId, actorRole: 'admin',
      entityType: 'PlatformSetting', entityId: changed._id,
      reason: body.reason.trim(),
      before: { revision: expected, plan: old?.value?.plan ?? DEFAULT_PLAN },
      after: { policyVersion: VERSION, revision: value.revision, plan, draftOnly: true },
    }, session);
    return readView(value);
  };
  await PlatformSetting.init();
  try { return await runInTransaction(work); }
  catch (error) { if (error?.code === 11000) throw conflict(); throw error; }
}

function previewDraft(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['plan', 'invoiceSyp', 'originalCommissionSyp',
        'eligibleCollectedSyp', 'previousCollectedSyp', 'returnedCommissionSyp',
        'previousReturnedCommissionSyp'].includes(key))) {
    throw ApiError.badRequest('Invalid preview.', undefined, 'INVALID_QUARTER_DRAFT');
  }
  const plan = validatePlan(body.plan);
  const base = {
    invoiceSyp: body.invoiceSyp,
    originalCommissionSyp: body.originalCommissionSyp,
    collectedSyp: body.eligibleCollectedSyp,
    plan,
  };
  const calculate = areaType => {
    const result = incrementOnVerifiedCollection({
      ...base, areaType,
      previousCollectedSyp: body.previousCollectedSyp ?? 0,
      returnedCommissionSyp: body.returnedCommissionSyp ?? 0,
    });
    const correction = correctionForReturn({
      ...base, areaType,
      previousReturnedCommissionSyp: body.previousReturnedCommissionSyp ?? body.returnedCommissionSyp ?? 0,
      returnedCommissionSyp: body.returnedCommissionSyp ?? 0,
    });
    return {
      baseQuarters: result.cumulative.baseQuarters,
      earned: result.cumulative, increment: result.increment,
      returnCorrection: correction.correction,
    };
  };
  return {
    policyVersion: VERSION, previewOnly: true, persisted: false, noCashOrCreditPosted: true,
    city: calculate('city'), outside: calculate('rural'),
  };
}
module.exports = { KEY, readDraft, saveDraft, previewDraft };
