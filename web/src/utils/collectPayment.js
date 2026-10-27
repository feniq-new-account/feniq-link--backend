import { createIdempotencyKeys } from './payments';

// "Delivered" asks one thing: did the warehouse collect the money? All, part,
// or later. Same rules as the app's collect_payment_sheet.dart.

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

// Whole liras from what was typed: Western or Arabic-Indic digits, grouping
// commas and spaces ignored. Null when it isn't a whole number.
export function parseWholeLiras(text) {
  const western = String(text ?? '')
    .split('')
    .map((c) => {
      const i = ARABIC_INDIC.indexOf(c);
      return i >= 0 ? String(i) : c;
    })
    .join('')
    .replace(/[,،\s]/g, '');
  return /^\d+$/.test(western) ? Number(western) : null;
}

// A part payment must be more than nothing and less than the whole amount.
export function isValidPartial(paid, total) {
  return paid !== null && paid > 0 && paid < total;
}

// What is still owed after `paid`, never negative.
export function amountLeft(total, paid) {
  return Math.max(0, total - (paid ?? 0));
}

// Records what was collected as a cash payment from the pharmacy. True when
// the server took it.
export async function recordCollectedPayment(api, { pharmacyId, amountSyp, note }) {
  try {
    const body = {
      pharmacyId,
      amount: amountSyp,
      currency: 'SYP',
      method: 'cash',
      note,
    };
    const keys = createIdempotencyKeys();
    await keys.submit(body, (idempotencyKey) => api.createPayment({ ...body, idempotencyKey }));
    return true;
  } catch {
    return false;
  }
}
