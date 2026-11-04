import { expect, it } from 'vitest';
import { asciiDigits } from './digits';
it('normalizes both keyboard digit sets without losing phone leading zeros or signs', () => {
  expect(asciiDigits('٠٩٤٤١٢٣٤٥٦')).toBe('0944123456');
  expect(asciiDigits('۰۹۴۴۱۲۳۴۵۶')).toBe('0944123456');
  expect(asciiDigits('-٣٥.٥١')).toBe('-35.51');
});
