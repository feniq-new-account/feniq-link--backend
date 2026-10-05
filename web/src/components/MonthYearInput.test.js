import { describe, expect, it } from 'vitest';
import { monthYearValue } from './MonthYearInput';

describe('monthYearValue', () => {
  it('only a whole month counts as a date', () => {
    expect(monthYearValue('2027-06-01')).toBe('2027-06-01');
    expect(monthYearValue('2027-')).toBe('');
    expect(monthYearValue('-06')).toBe('');
    expect(monthYearValue('')).toBe('');
    expect(monthYearValue(undefined)).toBe('');
  });
});
