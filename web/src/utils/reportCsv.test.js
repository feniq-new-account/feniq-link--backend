import { expect, it } from 'vitest';
import { reportCsv } from './reportCsv';
it('preserves phone zeros and escapes spreadsheet formulas while leaving amounts numeric', () => {
  const csv = reportCsv([['=1+1', '0944123456', -500], ['  +SUM(1,2)', '+963944123456', 1000], ['A "quoted" pharmacy', 'normal', 0]]);
  expect(csv.startsWith('\ufeff')).toBe(true);
  expect(csv).toContain(`"'=1+1","'0944123456",-500`);
  expect(csv).toContain(`"'  +SUM(1,2)","'+963944123456",1000`);
  expect(csv).toContain('"A ""quoted"" pharmacy"');
});
