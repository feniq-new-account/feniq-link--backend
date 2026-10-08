// Pure helpers for the warehouse's Reps pages (WarehouseRepsPage,
// WarehouseRepDetailPage). Kept out of JSX so they can be unit-tested without
// a DOM - there is no jsdom harness in this project.
import { passwordPolicyError } from './passwordPolicy';

// The four outcomes of a QR scan - backend/src/models/repVisit.model.js.
export const VISIT_STATUSES = ['verified', 'out_of_range', 'no_pharmacy_location', 'mock_location'];

export function visitStatusKey(status) {
  return VISIT_STATUSES.includes(status) ? `reps.visitStatus.${status}` : 'reps.visitStatus.unknown';
}

// Badge colour: a verified visit is good news, a pharmacy with no saved
// location is merely unverifiable, the other two are worth a second look.
export function visitStatusTone(status) {
  if (status === 'verified') return 'ok';
  if (status === 'no_pharmacy_location') return 'muted';
  return 'warn';
}

// Whole days between a timestamp and now; null when there is no timestamp.
export function daysSince(value, now = new Date()) {
  if (!value) return null;
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86400000));
}

// "never" / "today" / "N days ago", as a translation key + count, so the
// component renders it in either language.
export function lastSeenKey(value, now = new Date()) {
  const days = daysSince(value, now);
  if (days === null) return { key: 'reps.never', count: 0 };
  if (days === 0) return { key: 'reps.today', count: 0 };
  return { key: 'reps.daysAgo', count: days };
}

// A pharmacy is "due" once no verified visit has happened for this many days.
export const VISIT_DUE_DAYS = 10;

export function isVisitDue(lastVerifiedVisitAt, now = new Date()) {
  const days = daysSince(lastVerifiedVisitAt, now);
  return days === null || days >= VISIT_DUE_DAYS;
}

const PHONE_PATTERN = /^(?:\+963|0)9\d{8}$/;

export function normalizePhoneInput(value) {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
}

// The rep's commission is a percentage of the value of the orders placed under
// them through Feniq - backend/src/utils/repCommission.js. It is split in
// quarters: Feniq, the pharmacy (credit off its next order), the rep, and the
// warehouse - which keeps its quarter or gives it to the rep.
export const MAX_REP_COMMISSION_RATE = 10;

// Text from the form -> a number of percent. Blank means "no commission" (0).
// Returns null when it is not a rate the server would accept (0..10, at most
// two decimals).
export function parseCommissionInput(value) {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (text === '') return 0;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return null;
  const rate = Number(text.replace(',', '.'));
  return rate >= 0 && rate <= MAX_REP_COMMISSION_RATE ? rate : null;
}

// Where a rate ends up, in percent of the order value. With `shareToRep` the
// warehouse gives the rep its own quarter, and keeps nothing.
export function commissionSplit(rate, shareToRep = false) {
  const total = Number(rate) || 0;
  const round = (n) => Math.round(n * 10000) / 10000;
  const quarter = round(total / 4);
  return {
    feniq: quarter,
    pharmacy: quarter,
    rep: shareToRep ? round(total / 2) : quarter,
    saving: shareToRep ? 0 : quarter,
  };
}

// "2" -> "2", "0.5" -> "0.5": no trailing zeros, no locale digits.
export function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100) / 100}%`;
}

// Mirrors backend rep.service.js createRep's checks so the form says what is
// wrong before the round trip. Returns { key, values } for the first problem,
// or null. The server still has the last word.
export function repFormError({ name, phone, password, commissionRate }) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length < 2 || trimmed.length > 60) return { key: 'reps.errors.name' };
  if (!PHONE_PATTERN.test(normalizePhoneInput(phone))) return { key: 'reps.errors.phone' };
  const min = passwordPolicyError(password, 'rep');
  if (min !== null) return { key: 'reps.errors.password', values: { min } };
  if (parseCommissionInput(commissionRate) === null) {
    return { key: 'reps.errors.commission', values: { max: MAX_REP_COMMISSION_RATE } };
  }
  return null;
}

// Reps are stored in the +963 form the app signs in with; people read and
// type the local 09 form.
export function toLocalPhone(phone) {
  if (typeof phone !== 'string') return '';
  return phone.startsWith('+963') ? `0${phone.slice(4)}` : phone;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The printable sticker for a pharmacy's glass: its name, the QR, and one line
// telling the rep what to do. Returned as a complete HTML document for a print
// window. `svg` is the QR as an SVG string (from the qrcode package).
export function visitStickerHtml({ pharmacyName, address, svg, code, labels }) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(labels.title)} - ${escapeHtml(pharmacyName)}</title>
<style>
  @page { size: A6; margin: 8mm; }
  body { font-family: system-ui, "Segoe UI", Tahoma, sans-serif; color: #16283F; margin: 0; text-align: center; }
  .card { border: 2px solid #16283F; border-radius: 6px; padding: 6mm; }
  .brand { color: #F2760A; font-weight: 800; font-size: 14pt; letter-spacing: 0.02em; }
  h1 { font-size: 15pt; margin: 2mm 0 1mm; }
  .addr { font-size: 9pt; color: #46566B; margin-bottom: 3mm; }
  .qr svg { width: 62mm; height: 62mm; }
  .hint { font-size: 10pt; margin-top: 3mm; }
  .code { font-family: monospace; font-size: 9pt; color: #46566B; margin-top: 1mm; letter-spacing: 0.08em; direction: ltr; }
</style>
</head>
<body>
<div class="card">
  <div class="brand">${escapeHtml(labels.brand)}</div>
  <h1>${escapeHtml(pharmacyName)}</h1>
  ${address ? `<div class="addr">${escapeHtml(address)}</div>` : ''}
  <div class="qr">${svg}</div>
  <div class="hint">${escapeHtml(labels.hint)}</div>
  <div class="code">${escapeHtml(code)}</div>
</div>
<script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}
