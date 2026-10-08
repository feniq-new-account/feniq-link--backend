import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { matchPharmacies, normalize, parseVoicePayment, paymentFor } from './voicePayment';

// The same lines the app's parser is tested against (phoenix/test/features/
// warehouse/voice_payment_test.dart): the two must agree on every one.
const cases = JSON.parse(
  readFileSync(new URL('../../../tools/voice-payment/cases.json', import.meta.url), 'utf8')
);

describe('parseVoicePayment', () => {
  it.each(cases.parse)('reads "$say"', ({ say, name, kind, paid, left }) => {
    expect(parseVoicePayment(say)).toEqual({ name, kind, paid, left });
  });
});

describe('matchPharmacies', () => {
  it.each(cases.match)('"$name" -> $best', ({ name, best }) => {
    const found = matchPharmacies(name, cases.accounts);
    expect(found[0]?.id ?? null).toBe(best);
    expect(found.length).toBeLessThanOrEqual(3);
  });
});

describe('paymentFor', () => {
  it('takes the sum said and what is left after it', () => {
    expect(paymentFor({ kind: 'amount', paid: 40000, left: null }, 100000)).toEqual({ paid: 40000, left: 60000 });
  });
  it('a sum above what is owed is refused', () => {
    expect(paymentFor({ kind: 'amount', paid: 150000, left: null }, 100000)).toBeNull();
    expect(paymentFor({ kind: 'amount', paid: 100000, left: null }, 100000)).toEqual({ paid: 100000, left: 0 });
  });
  it('"all" pays the balance, but only when something is owed', () => {
    expect(paymentFor({ kind: 'full' }, 100000)).toEqual({ paid: 100000, left: 0 });
    expect(paymentFor({ kind: 'full' }, 0)).toBeNull();
  });
  it('"left X" pays the difference, but only when X is below the balance', () => {
    expect(paymentFor({ kind: 'left', left: 30000 }, 100000)).toEqual({ paid: 70000, left: 30000 });
    expect(paymentFor({ kind: 'left', left: 130000 }, 100000)).toBeNull();
  });
  it('an unclear sentence records nothing', () => {
    expect(paymentFor({ kind: 'unknown' }, 100000)).toBeNull();
  });
});

describe('normalize', () => {
  it('folds digits, letter variants and grouping', () => {
    expect(normalize('٥٠،٠٠٠ أمل')).toBe('50000 امل');
    expect(normalize('الصَّيدلِيَّة')).toBe('الصيدليه');
  });
});
