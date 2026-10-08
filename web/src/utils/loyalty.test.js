import { describe, expect, it } from 'vitest';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import { MAX_LOYALTY_TIERS, parseSyp, readTiers, tiersToRows } from './loyalty';

describe('loyalty tiers form', () => {
  it('reads amounts with or without thousands separators', () => {
    expect(parseSyp('100,000')).toBe(100000);
    expect(parseSyp(' 200 000 ')).toBe(200000);
    expect(parseSyp('2٬000')).toBe(2000);
    expect(parseSyp('1.5')).toBeNaN();
    expect(parseSyp('')).toBeNaN();
  });

  it('turns rows into tiers sorted by minimum, skipping empty rows', () => {
    expect(
      readTiers(
        [
          { minSyp: '200,000', discountSyp: '5,000' },
          { minSyp: '', discountSyp: '' },
          { minSyp: '100000', discountSyp: '2000' },
        ],
        { enabled: true }
      )
    ).toEqual({ tiers: [{ minSyp: 100000, discountSyp: 2000 }, { minSyp: 200000, discountSyp: 5000 }] });
  });

  it('refuses a discount that is not below its minimum, a missing number, or a repeated minimum', () => {
    for (const rows of [
      [{ minSyp: '1000', discountSyp: '1000' }],
      [{ minSyp: '1000', discountSyp: '' }],
      [{ minSyp: 'abc', discountSyp: '10' }],
      [{ minSyp: '1000', discountSyp: '10' }, { minSyp: '1000', discountSyp: '20' }],
    ]) {
      expect(readTiers(rows, { enabled: false })).toEqual({ error: 'warehouseSettings.loyalty.errorTier' });
    }
    const tooMany = Array.from({ length: MAX_LOYALTY_TIERS + 1 }, (_, i) => ({ minSyp: String(1000 + i), discountSyp: '1' }));
    expect(readTiers(tooMany, { enabled: false })).toEqual({ error: 'warehouseSettings.loyalty.errorTier' });
  });

  it('needs a tier before it can be switched on, but can be saved off with none', () => {
    expect(readTiers([{ minSyp: '', discountSyp: '' }], { enabled: true })).toEqual({
      error: 'warehouseSettings.loyalty.errorEmpty',
    });
    expect(readTiers([{ minSyp: '', discountSyp: '' }], { enabled: false })).toEqual({ tiers: [] });
  });

  it('shows stored tiers as rows, and one empty row when there are none', () => {
    expect(tiersToRows([{ minSyp: 100000, discountSyp: 2000 }])).toEqual([{ minSyp: '100000', discountSyp: '2000' }]);
    expect(tiersToRows([])).toEqual([{ minSyp: '', discountSyp: '' }]);
  });

  it('has every string in both languages', () => {
    for (const key of Object.keys(en.warehouseSettings.loyalty)) {
      expect(ar.warehouseSettings.loyalty[key], key).toBeTruthy();
    }
  });
});
