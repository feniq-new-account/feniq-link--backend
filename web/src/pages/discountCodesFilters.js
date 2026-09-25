// Pure helpers behind the discount-code pages (warehouse and admin) and their
// shared form. No React, no DOM - so they are unit-tested directly
// (discountCodesFilters.test.js); the pages only render what these decide.

// The status pills. 'review' is the moderation queue (a new warehouse code, or
// an approved one with an edit waiting for the admin); the rest follow the
// server's derived `displayStatus` (backend discountCode.service.js).
export const DISCOUNT_CODE_FILTERS = [
  'all',
  'review',
  'active',
  'scheduled',
  'expired',
  'exhausted',
  'stopped',
  'rejected',
];

// The admin page's three views (backend GET /admin/discount-codes?view=).
export const ADMIN_DISCOUNT_CODE_VIEWS = ['review', 'admin', 'all'];

// Which status-badge colour a code's displayStatus gets (index.css classes the
// other moderation pages already use).
export function statusBadgeClass(displayStatus) {
  switch (displayStatus) {
    case 'active':
      return 'status-delivered';
    case 'pending':
    case 'scheduled':
      return 'status-pending';
    case 'stopped':
    case 'rejected':
    case 'expired':
    case 'exhausted':
      return 'status-cancelled';
    default:
      return 'status-pending';
  }
}

// A code in the admin's review queue.
export function isInReview(code) {
  return code.ownerRole === 'warehouse' && (code.status === 'pending' || code.pendingUpdate != null);
}

// Whether the owner can still change it: a stopped or rejected code is a record.
export function isEditable(code) {
  return code.status === 'pending' || code.status === 'approved';
}

export function isStoppable(code) {
  return code.status === 'pending' || code.status === 'approved';
}

// "10%" or "50,000 ل.س" - `formatSyp` is utils/currency.js's.
export function formatDiscountValue(terms, formatSyp) {
  if (!terms) return '';
  return terms.type === 'percentage' ? `${terms.value}%` : formatSyp(terms.value);
}

// "3 / 10", or just "3" when there is no total limit.
export function usageText(code) {
  const used = code.usedCount ?? 0;
  return code.maxUses != null ? `${used} / ${code.maxUses}` : String(used);
}

// The values the edit form opens with: the parked edit (`pendingUpdate`) if
// there is one - so revising it replaces that proposal - otherwise the live
// terms. Same rule as offersFilters.js's offerEditSource.
export function discountCodeEditSource(code) {
  if (!code || !code.pendingUpdate) return code;
  return { ...code, ...code.pendingUpdate };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// A stored date as the <input type="date"> value, in the viewer's own time
// zone - the same day the form sent.
export function toDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The form's dates are whole days, both included: the code starts at the
// first moment of the start day and stops at the last moment of the end day,
// local time. (A bare "YYYY-MM-DD" would be parsed as UTC midnight and end the
// code three hours into its last day in Syria.)
export function startOfDayIso(dateInput) {
  const [y, m, d] = dateInput.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

export function endOfDayIso(dateInput) {
  const [y, m, d] = dateInput.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

export function initialDiscountCodeForm(code) {
  if (!code) {
    return {
      type: 'percentage',
      value: '',
      startDate: '',
      endDate: '',
      maxUses: '',
      maxUsesPerPharmacy: '',
      scope: 'general',
      pharmacy: null,
    };
  }
  return {
    type: code.type,
    value: String(code.value ?? ''),
    startDate: toDateInputValue(code.startDate),
    endDate: toDateInputValue(code.endDate),
    maxUses: code.maxUses != null ? String(code.maxUses) : '',
    maxUsesPerPharmacy: code.maxUsesPerPharmacy != null ? String(code.maxUsesPerPharmacy) : '',
    scope: code.pharmacyId ? 'pharmacy' : 'general',
    pharmacy: code.pharmacy ? { id: code.pharmacy.id, nameAr: code.pharmacy.nameAr, nameEn: code.pharmacy.nameEn } : null,
  };
}

function parseLimit(raw) {
  if (raw === '' || raw == null) return { ok: true, value: null };
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? { ok: true, value } : { ok: false };
}

// Validates the form and builds the request body - or returns the i18n key of
// the first problem. The server validates the same rules; this only saves the
// round trip. `isEdit`: who a code is for is fixed at creation, so an edit
// never sends the pharmacy.
export function buildDiscountCodePayload(form, { isEdit = false } = {}) {
  const value = Number(form.value);
  if (form.value === '' || !Number.isFinite(value)) return { error: 'discountCodes.form.errors.value' };
  if (form.type === 'percentage') {
    if (value <= 0 || value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-9) {
      return { error: 'discountCodes.form.errors.percentage' };
    }
  } else if (!Number.isInteger(value) || value <= 0) {
    return { error: 'discountCodes.form.errors.fixed' };
  }

  if (!form.startDate || !form.endDate) return { error: 'common.requiredFields' };
  if (form.endDate < form.startDate) return { error: 'common.endAfterStart' };

  const maxUses = parseLimit(form.maxUses);
  const maxUsesPerPharmacy = parseLimit(form.maxUsesPerPharmacy);
  if (!maxUses.ok || !maxUsesPerPharmacy.ok) return { error: 'discountCodes.form.errors.limit' };

  if (!isEdit && form.scope === 'pharmacy' && !form.pharmacy) {
    return { error: 'discountCodes.form.errors.pharmacy' };
  }

  const payload = {
    type: form.type,
    value,
    startDate: startOfDayIso(form.startDate),
    endDate: endOfDayIso(form.endDate),
    maxUses: maxUses.value,
    maxUsesPerPharmacy: maxUsesPerPharmacy.value,
  };
  if (!isEdit && form.scope === 'pharmacy') payload.pharmacyId = form.pharmacy.id;
  return { payload };
}

// The panel's text for an error code the discount-code endpoints return, or
// null to fall back to the server's message.
const ERROR_KEYS = {
  INVALID_DISCOUNT_CODE_TYPE: 'discountCodes.form.errors.value',
  INVALID_DISCOUNT_CODE_VALUE: 'discountCodes.form.errors.value',
  INVALID_DISCOUNT_CODE_LIMIT: 'discountCodes.form.errors.limit',
  INVALID_DATE_RANGE: 'common.endAfterStart',
  DISCOUNT_CODE_LIMIT_BELOW_USED: 'discountCodes.errors.limitBelowUsed',
  DISCOUNT_CODE_PHARMACY_NOT_CUSTOMER: 'discountCodes.errors.pharmacyNotCustomer',
  DISCOUNT_CODE_PHARMACY_NOT_FOUND: 'discountCodes.errors.pharmacyNotFound',
  DISCOUNT_CODE_NOT_EDITABLE: 'discountCodes.errors.notEditable',
  DISCOUNT_CODE_VERSION_CONFLICT: 'discountCodes.errors.versionConflict',
  DISCOUNT_CODE_NOT_IN_REVIEW: 'discountCodes.errors.notInReview',
  REJECTION_NOTE_REQUIRED: 'discountCodes.errors.rejectionNoteRequired',
};

export function discountCodeErrorKey(code) {
  return ERROR_KEYS[code] ?? null;
}
