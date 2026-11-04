import { asciiDigits } from './digits';
import { createIdempotencyKeys } from './payments';

// "Delivered" asks one thing: did the warehouse collect the money? All, part,
// or later. Same rules as the app's collect_payment_sheet.dart.

// Whole amounts and complete thousand groups only; never convert a decimal
// comma into another payment amount by deleting it.
export function parseWholeLiras(text) {
  const value = asciiDigits(text).trim().replace(/\s+/g, ' ');
  if (!/^(?:[0-9]+|[1-9][0-9]{0,2}(?:[, ][0-9]{3})+)$/.test(value)) return null;
  const number = Number(value.replace(/[, ]/g, ''));
  return Number.isSafeInteger(number) ? number : null;
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
