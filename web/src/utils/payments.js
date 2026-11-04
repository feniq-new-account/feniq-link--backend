// Money-Flow V2. Shared between the two places a warehouse can record a
// payment - the Invoices tab and the order-detail modal - so the two can never
// drift from each other or from the backend.

// Mirrors payment.service.js's METHODS. Reconciliation detail only; none of
// these change a figure.
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'other'];

// SYP first: it is the default currency for every amount in the panel.
export const PAYMENT_CURRENCIES = ['SYP', 'USD'];

// Mints one idempotency key. Never call this per submit: a key minted inside
// the submit is new on every retry, so the server cannot recognise the retry
// and records the payment again. Forms get their keys from
// createIdempotencyKeys below.
//
// crypto.randomUUID exists in every browser this panel supports; the fallback
// keeps it working on an insecure origin in dev, where it is unavailable.
export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

// A request body as a stable string: keys sorted, and undefined fields dropped
// exactly as JSON.stringify drops them when the body is sent - so two bodies
// that put the same request on the wire compare equal.
export function paymentRequestFingerprint(body) {
  return JSON.stringify(canonical(body));
}

// The idempotency keys of one open payment form (record or reverse). The form
// creates this once when it mounts and asks it for the key of each request it
// sends:
//
//   - the same request again (a lost response, a second click) gets the same
//     key, so the server replays the payment instead of recording it twice;
//   - a request with different details is a different payment and gets its
//     own key - and going back to details already tried reuses THEIR key, so
//     editing a field and changing it back cannot duplicate a payment either;
//   - reset() after a success: whatever comes next is a new payment, even with
//     the same details;
//   - forget(body) after IDEMPOTENCY_KEY_REUSED: the server holds that key for
//     something else, so the next attempt needs a fresh one.
//
// submit(body, send) is all three rules in one call, and what the forms use:
// it hands `send` the body's key, clears that confirmed request and forgets after an
// IDEMPOTENCY_KEY_REUSED refusal, rethrowing every error for the form to show.
//
// Unconfirmed keys survive reopening in account-scoped browser storage.
// Confirming one payload does not discard keys of other uncertain attempts.
export function createIdempotencyKeys(mintKey = newIdempotencyKey) {
  const keys = new Map();
  let account = 'anonymous';
  try {
    const token = localStorage.getItem('phoenix.admin.token');
    const encoded = token?.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    account = encoded ? JSON.parse(atob(encoded)).sub || account : account;
  } catch { /* No authenticated storage in unit tests or a blocked browser. */ }
  const storageKey = (fingerprint) => `feniq.pending-payment-key:${account}:${fingerprint}`;
  const readStored = (fingerprint) => {
    try { return localStorage.getItem(storageKey(fingerprint)); } catch { return null; }
  };
  const removeStored = (fingerprint) => {
    try { localStorage.removeItem(storageKey(fingerprint)); } catch { /* In-memory retries still work. */ }
  };
  const store = {
    keyFor(body) {
      const fingerprint = paymentRequestFingerprint(body);
      let key = keys.get(fingerprint) || readStored(fingerprint);
      if (!key) {
        key = mintKey();
        try { localStorage.setItem(storageKey(fingerprint), key); } catch { /* In-memory retries still work. */ }
      }
      keys.set(fingerprint, key);
      return key;
    },
    forget(body) {
      const fingerprint = paymentRequestFingerprint(body);
      removeStored(fingerprint);
      keys.delete(fingerprint);
    },
    reset() {
      for (const fingerprint of keys.keys()) removeStored(fingerprint);
      keys.clear();
    },
    async submit(body, send) {
      try {
        const result = await send(store.keyFor(body));
        store.forget(body);
        return result;
      } catch (err) {
        if (err?.code === 'IDEMPOTENCY_KEY_REUSED') store.forget(body);
        throw err;
      }
    },
  };
  return store;
}
