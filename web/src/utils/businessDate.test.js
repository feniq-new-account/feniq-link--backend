import { describe, expect, it } from 'vitest';
import {
  businessDateInputValue,
  formatBusinessDate,
  startOfBusinessMonthInputValue,
} from './businessDate';

// The report pages pick and show Damascus dates whatever the browser's own
// time zone - the server reads a bare date as that whole Damascus day
// (backend utils/businessTime.js). These instants sit either side of local
// midnight, where a UTC date (the old toISOString()) is a day behind.

describe('the business calendar', () => {
  it('names the Damascus date, not the UTC one, just after local midnight', () => {
    // 00:10 on 25 September in Damascus = 21:10 on the 24th in UTC.
    expect(businessDateInputValue(new Date('2026-09-24T21:10:00Z'))).toBe('2026-09-25');
    // 23:30 on the 24th in Damascus.
    expect(businessDateInputValue(new Date('2026-09-24T20:30:00Z'))).toBe('2026-09-24');
  });

  it('starts "this month" on the Damascus 1st, even while UTC is still in the old month', () => {
    // 00:30 on 1 October in Damascus.
    expect(startOfBusinessMonthInputValue(new Date('2026-09-30T21:30:00Z'))).toBe('2026-10-01');
    expect(startOfBusinessMonthInputValue(new Date('2026-09-15T12:00:00Z'))).toBe('2026-09-01');
  });

  it('shows a stored period bound as the Damascus day it belongs to', () => {
    // The server stores "from 25 September" as local midnight = 21:00Z on the 24th.
    const shown = formatBusinessDate('2026-09-24T21:00:00.000Z');
    const expected = new Date(Date.UTC(2026, 8, 25, 12)).toLocaleDateString(undefined, { timeZone: 'UTC' });
    expect(shown).toBe(expected);
    expect(formatBusinessDate(null)).toBe('');
    expect(businessDateInputValue('garbage')).toBe('');
  });
});
