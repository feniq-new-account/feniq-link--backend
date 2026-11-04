import { describe, expect, it } from 'vitest';
import { amountLeft, isValidPartial, parseWholeLiras } from './collectPayment';

describe('parseWholeLiras', () => {
  it('reads Western and Arabic-Indic digits, ignoring grouping', () => {
    expect(parseWholeLiras('150000')).toBe(150000);
    expect(parseWholeLiras('١٥٠٬٠٠٠'.replace('٬', ','))).toBe(150000);
    expect(parseWholeLiras('١٥٠،٠٠٠')).toBe(150000);
    expect(parseWholeLiras(' 1 500 ')).toBe(1500);
  });
  it('does not silently turn a decimal/grouping typo into another payment', () => {
    expect(parseWholeLiras('10,5')).toBeNull();
    expect(parseWholeLiras('١٠٫٥')).toBeNull();
    expect(parseWholeLiras('0,500')).toBeNull();
    expect(parseWholeLiras('9,007,199,254,740,992')).toBeNull();
    expect(parseWholeLiras('۱۵۰٬۰۰۰')).toBe(150000);
  });
  it('is null for anything that is not a whole number', () => {
    expect(parseWholeLiras('')).toBeNull();
    expect(parseWholeLiras('abc')).toBeNull();
    expect(parseWholeLiras('12.5')).toBeNull();
    expect(parseWholeLiras('-5')).toBeNull();
  });
});

describe('isValidPartial', () => {
  it('needs more than zero and less than the total', () => {
    expect(isValidPartial(50, 100)).toBe(true);
    expect(isValidPartial(0, 100)).toBe(false);
    expect(isValidPartial(100, 100)).toBe(false);
    expect(isValidPartial(null, 100)).toBe(false);
  });
});

describe('amountLeft', () => {
  it('is what remains, never negative', () => {
    expect(amountLeft(100, 30)).toBe(70);
    expect(amountLeft(100, 150)).toBe(0);
    expect(amountLeft(100, null)).toBe(100);
  });
});
