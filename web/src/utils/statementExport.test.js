import { expect, it } from 'vitest';
import { statementCsvRows } from './statementExport';
import { reportCsv } from './reportCsv';
it('exports server balances, reversal references and raw timestamps with safe spreadsheet cells', () => {
  const data = { pharmacy: { nameEn: '=BAD()', phone: '0944123456' }, period: { from: '2026-10-01', to: '2026-10-31' },
    asOf: '2026-11-06T10:30:00Z', opening: { syp: 900 }, closing: { syp: 1250 },
    reconciliation: { netMovementSyp: 350, differenceSyp: 0 }, rows: [{ entryNumber: 7, kind: 'payment_reversal',
      effectiveAt: '2026-10-20T12:00:00Z', postedAt: '2026-10-21T14:00:00Z', debitSyp: 350, creditSyp: 0, balanceSyp: 1250,
      reference: { paymentNumber: 42 }, reversalOf: 'original', reason: '=unsafe' }] };
  const rows = statementCsvRows(data, (key) => key, { nameEn: 'Warehouse' });
  expect(rows).toContainEqual(['statement.closing', 1250, 'SYP']);
  expect(rows.at(-1)).toContain('original'); expect(rows.at(-1)).toContain(42); expect(rows.at(-1)).toContain(data.rows[0].postedAt);
  const csv = reportCsv(rows); expect(csv).toContain('"\'=BAD()"'); expect(csv).toContain('"\'0944123456"');
  expect(csv).toContain(',350,0,1250,'); expect(csv).toContain('"\'=unsafe"');
});
