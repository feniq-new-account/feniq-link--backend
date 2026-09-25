import { describe, expect, it } from 'vitest';
import {
  DISCOUNT_CODE_FILTERS,
  buildDiscountCodePayload,
  discountCodeEditSource,
  discountCodeErrorKey,
  endOfDayIso,
  formatDiscountValue,
  initialDiscountCodeForm,
  isEditable,
  isInReview,
  isStoppable,
  startOfDayIso,
  statusBadgeClass,
  toDateInputValue,
  usageText,
} from './discountCodesFilters';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';

// The discount-code pages have no jsdom harness here, so their decisions live
// in discountCodesFilters.js and are pinned directly.

function form(overrides = {}) {
  return {
    ...initialDiscountCodeForm(null),
    value: '10',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    ...overrides,
  };
}

describe('buildDiscountCodePayload', () => {
  it('builds a percentage code with whole-day dates, both included', () => {
    const { payload, error } = buildDiscountCodePayload(form({ value: '12.5' }));
    expect(error).toBeUndefined();
    expect(payload.type).toBe('percentage');
    expect(payload.value).toBe(12.5);
    expect(payload.startDate).toBe(new Date(2026, 9, 1, 0, 0, 0, 0).toISOString());
    expect(payload.endDate).toBe(new Date(2026, 9, 31, 23, 59, 59, 999).toISOString());
    expect(payload.maxUses).toBeNull();
    expect(payload.maxUsesPerPharmacy).toBeNull();
    expect(payload).not.toHaveProperty('pharmacyId');
  });

  it('accepts a one-day code', () => {
    const { payload } = buildDiscountCodePayload(form({ startDate: '2026-10-05', endDate: '2026-10-05' }));
    expect(new Date(payload.endDate) > new Date(payload.startDate)).toBe(true);
  });

  it('refuses a percentage outside (0, 100] or with more than two decimals', () => {
    for (const value of ['0', '-1', '100.5', '7.125', 'abc', '']) {
      expect(buildDiscountCodePayload(form({ value })).error, value).toBeTruthy();
    }
    expect(buildDiscountCodePayload(form({ value: '100' })).error).toBeUndefined();
  });

  it('refuses a fixed amount that is not whole lira above 0', () => {
    expect(buildDiscountCodePayload(form({ type: 'fixed', value: '2500.5' })).error).toBe(
      'discountCodes.form.errors.fixed'
    );
    expect(buildDiscountCodePayload(form({ type: 'fixed', value: '0' })).error).toBe(
      'discountCodes.form.errors.fixed'
    );
    expect(buildDiscountCodePayload(form({ type: 'fixed', value: '50000' })).payload.value).toBe(50000);
  });

  it('needs both dates, in order', () => {
    expect(buildDiscountCodePayload(form({ endDate: '' })).error).toBe('common.requiredFields');
    expect(buildDiscountCodePayload(form({ endDate: '2026-09-30' })).error).toBe('common.endAfterStart');
  });

  it('takes optional whole-number limits', () => {
    const { payload } = buildDiscountCodePayload(form({ maxUses: '100', maxUsesPerPharmacy: '1' }));
    expect(payload.maxUses).toBe(100);
    expect(payload.maxUsesPerPharmacy).toBe(1);
    expect(buildDiscountCodePayload(form({ maxUses: '0' })).error).toBe('discountCodes.form.errors.limit');
    expect(buildDiscountCodePayload(form({ maxUsesPerPharmacy: '1.5' })).error).toBe(
      'discountCodes.form.errors.limit'
    );
  });

  it('sends the pharmacy only on create, and requires one for a pharmacy-specific code', () => {
    expect(buildDiscountCodePayload(form({ scope: 'pharmacy' })).error).toBe('discountCodes.form.errors.pharmacy');
    const pharmacy = { id: 'p1', nameAr: 'ص' };
    expect(buildDiscountCodePayload(form({ scope: 'pharmacy', pharmacy })).payload.pharmacyId).toBe('p1');
    const edit = buildDiscountCodePayload(form({ scope: 'pharmacy', pharmacy }), { isEdit: true });
    expect(edit.payload).not.toHaveProperty('pharmacyId');
  });
});

describe('the edit form', () => {
  const live = {
    id: 'c1',
    code: 'ABCD2345',
    type: 'percentage',
    value: 10,
    startDate: new Date(2026, 9, 1).toISOString(),
    endDate: new Date(2026, 9, 31, 23, 59, 59, 999).toISOString(),
    maxUses: null,
    maxUsesPerPharmacy: 1,
    pharmacyId: 'p1',
    pharmacy: { id: 'p1', nameAr: 'ص', nameEn: 'P' },
    pendingUpdate: null,
  };

  it('opens on the live terms, dates as the same local days', () => {
    const f = initialDiscountCodeForm(live);
    expect(f.value).toBe('10');
    expect(f.startDate).toBe('2026-10-01');
    expect(f.endDate).toBe('2026-10-31');
    expect(f.maxUses).toBe('');
    expect(f.maxUsesPerPharmacy).toBe('1');
    expect(f.scope).toBe('pharmacy');
  });

  it('opens on a parked edit when there is one, keeping the code and who it is for', () => {
    const source = discountCodeEditSource({ ...live, pendingUpdate: { type: 'fixed', value: 5000, startDate: live.startDate, endDate: live.endDate, maxUses: 3, maxUsesPerPharmacy: null } });
    expect(source.type).toBe('fixed');
    expect(source.value).toBe(5000);
    expect(source.code).toBe('ABCD2345');
    expect(source.pharmacy.id).toBe('p1');
    expect(discountCodeEditSource(live)).toBe(live);
  });

  it('round-trips the day boundaries', () => {
    expect(toDateInputValue(startOfDayIso('2026-02-28'))).toBe('2026-02-28');
    expect(toDateInputValue(endOfDayIso('2026-02-28'))).toBe('2026-02-28');
    expect(toDateInputValue(null)).toBe('');
  });
});

describe('row decisions', () => {
  it('queues only warehouse codes that are new or carry a parked edit', () => {
    expect(isInReview({ ownerRole: 'warehouse', status: 'pending', pendingUpdate: null })).toBe(true);
    expect(isInReview({ ownerRole: 'warehouse', status: 'approved', pendingUpdate: {} })).toBe(true);
    expect(isInReview({ ownerRole: 'warehouse', status: 'approved', pendingUpdate: null })).toBe(false);
    expect(isInReview({ ownerRole: 'admin', status: 'approved', pendingUpdate: null })).toBe(false);
  });

  it('never offers edit or stop on a stopped or rejected code', () => {
    for (const status of ['stopped', 'rejected']) {
      expect(isEditable({ status })).toBe(false);
      expect(isStoppable({ status })).toBe(false);
    }
    expect(isEditable({ status: 'approved' })).toBe(true);
    expect(isStoppable({ status: 'pending' })).toBe(true);
  });

  it('formats the value and the usage', () => {
    const syp = (n) => `${n.toLocaleString('en-US')} SYP`;
    expect(formatDiscountValue({ type: 'percentage', value: 7.5 }, syp)).toBe('7.5%');
    expect(formatDiscountValue({ type: 'fixed', value: 50000 }, syp)).toBe('50,000 SYP');
    expect(usageText({ usedCount: 3, maxUses: 10 })).toBe('3 / 10');
    expect(usageText({ usedCount: 3, maxUses: null })).toBe('3');
  });

  it('gives every display status a badge colour', () => {
    expect(statusBadgeClass('active')).toBe('status-delivered');
    expect(statusBadgeClass('pending')).toBe('status-pending');
    expect(statusBadgeClass('stopped')).toBe('status-cancelled');
  });

  it('maps the server\'s error codes to panel text', () => {
    expect(discountCodeErrorKey('DISCOUNT_CODE_PHARMACY_NOT_CUSTOMER')).toBe('discountCodes.errors.pharmacyNotCustomer');
    expect(discountCodeErrorKey('SOMETHING_ELSE')).toBeNull();
  });
});

// Every key the pages and the form render, in both languages.
function lookup(locale, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), locale);
}

const RENDERED_KEYS = [
  'nav.discountCodes',
  'discountCodes.newCode',
  'discountCodes.searchPlaceholder',
  'discountCodes.empty',
  'discountCodes.proposed',
  'discountCodes.updatePendingBadge',
  'discountCodes.perPharmacyLimit',
  'discountCodes.stop',
  ...DISCOUNT_CODE_FILTERS.map((f) => `discountCodes.filters.${f}`),
  ...['pending', 'active', 'scheduled', 'expired', 'exhausted', 'stopped', 'rejected'].map(
    (s) => `discountCodes.status.${s}`
  ),
  'discountCodes.type.percentage',
  'discountCodes.type.fixed',
  'discountCodes.scope.general',
  'discountCodes.scope.pharmacy',
  'discountCodes.fundedBy.warehouse',
  'discountCodes.fundedBy.platform',
  ...['code', 'owner', 'discount', 'scope', 'period', 'usage'].map((c) => `discountCodes.columns.${c}`),
  'discountCodes.warehouse.notice',
  'discountCodes.warehouse.confirmStop',
  ...['review', 'admin', 'all'].map((v) => `discountCodes.admin.views.${v}`),
  'discountCodes.admin.fundingHint',
  'discountCodes.admin.allWarehouses',
  'discountCodes.admin.confirmApprove',
  'discountCodes.admin.rejectPrompt',
  'discountCodes.admin.rejectUpdatePrompt',
  'discountCodes.admin.confirmStop',
  'discountCodes.admin.reviewEmpty',
  ...[
    'createTitle', 'editTitle', 'codeGeneratedHint', 'editNeedsApproval', 'percentValue', 'fixedValue',
    'fixedHint', 'maxUses', 'maxUsesPerPharmacy', 'unlimited', 'scopeLabel', 'pharmacy', 'searchCustomers',
    'searchPharmacies', 'pharmacyNotifiedHint', 'saving', 'save', 'submitForApproval', 'create',
  ].map((k) => `discountCodes.form.${k}`),
  ...['value', 'percentage', 'fixed', 'limit', 'pharmacy'].map((k) => `discountCodes.form.errors.${k}`),
  ...[
    'limitBelowUsed', 'pharmacyNotCustomer', 'pharmacyNotFound', 'notEditable', 'versionConflict',
    'notInReview', 'rejectionNoteRequired',
  ].map((k) => `discountCodes.errors.${k}`),
  'commission.platformOwes',
  'commission.platformOwesHint',
  'commission.direction',
  'commission.direction_from_warehouse',
  'commission.direction_to_warehouse',
  'commission.recordPayoutButton',
  'commission.compensation',
  'commission.compensationHint',
  'commission.compensationForCode',
  'commission.paidOut',
  'commission.settledSoFar',
  'settlement.compensation',
  'settlement.compensationHint',
  'settlement.orderCompensation',
  'orderDetail.discountCodeLabel',
  'orderDetail.discountCodeFundedBy_warehouse',
  'orderDetail.discountCodeFundedBy_platform',
  'orderDetail.platformCompensationLabel',
];

function placeholders(text) {
  return [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

describe('the discount-code strings', () => {
  it('exist in both languages with the same placeholders', () => {
    for (const key of RENDERED_KEYS) {
      const enText = lookup(en, key);
      const arText = lookup(ar, key);
      expect(typeof enText, `en: ${key}`).toBe('string');
      expect(typeof arText, `ar: ${key}`).toBe('string');
      expect(placeholders(arText), key).toEqual(placeholders(enText));
    }
  });

  it('cover every error key the helpers can return', () => {
    for (const code of [
      'INVALID_DISCOUNT_CODE_VALUE', 'INVALID_DISCOUNT_CODE_LIMIT', 'DISCOUNT_CODE_LIMIT_BELOW_USED',
      'DISCOUNT_CODE_PHARMACY_NOT_CUSTOMER', 'DISCOUNT_CODE_PHARMACY_NOT_FOUND', 'DISCOUNT_CODE_NOT_EDITABLE',
      'DISCOUNT_CODE_VERSION_CONFLICT', 'DISCOUNT_CODE_NOT_IN_REVIEW', 'REJECTION_NOTE_REQUIRED', 'INVALID_DATE_RANGE',
    ]) {
      const key = discountCodeErrorKey(code);
      expect(typeof lookup(en, key), `${code} -> ${key}`).toBe('string');
      expect(typeof lookup(ar, key), `${code} -> ${key}`).toBe('string');
    }
  });
});
