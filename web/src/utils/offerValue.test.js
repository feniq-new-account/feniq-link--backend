import { describe, expect, it } from 'vitest';
import { offerValueLabel } from './offerValue';

const t = (key, vars) => `${key}:${vars?.bonus ?? ''}`;

describe('offerValueLabel', () => {
  it('a discount reads as a percentage, a bonus offer as its bonus', () => {
    expect(offerValueLabel({ offerType: 'discount', discountPercentage: 15 }, t)).toBe('15%');
    expect(offerValueLabel({ discountPercentage: 10 }, t)).toBe('10%');
    expect(offerValueLabel({ offerType: 'bonus', discountPercentage: 0, bonuses: [{ buy: 10, free: 3 }] }, t)).toBe(
      'offers.warehouse.bonusValue:10+3'
    );
  });
});
