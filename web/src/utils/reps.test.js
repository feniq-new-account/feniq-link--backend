import { describe, expect, it } from 'vitest';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import {
  VISIT_STATUSES,
  daysSince,
  MAX_REP_COMMISSION_RATE,
  commissionSplit,
  formatPercent,
  isVisitDue,
  lastSeenKey,
  parseCommissionInput,
  repFormError,
  toLocalPhone,
  visitStatusKey,
  visitStatusTone,
  visitStickerHtml,
} from './reps';

const NOW = new Date('2026-10-06T12:00:00Z');

describe('visit statuses', () => {
  it('maps every server status to a translated label in both languages', () => {
    for (const status of [...VISIT_STATUSES, 'something-new']) {
      const key = visitStatusKey(status).replace('reps.visitStatus.', '');
      expect(en.reps.visitStatus[key], status).toBeTruthy();
      expect(ar.reps.visitStatus[key], status).toBeTruthy();
    }
    expect(visitStatusKey('something-new')).toBe('reps.visitStatus.unknown');
  });

  it('only calls a verified visit good news', () => {
    expect(visitStatusTone('verified')).toBe('ok');
    expect(visitStatusTone('no_pharmacy_location')).toBe('muted');
    expect(visitStatusTone('out_of_range')).toBe('warn');
    expect(visitStatusTone('mock_location')).toBe('warn');
  });
});

describe('days since a visit', () => {
  it('counts whole days and treats missing or bad dates as never', () => {
    expect(daysSince('2026-10-06T08:00:00Z', NOW)).toBe(0);
    expect(daysSince('2026-10-03T11:00:00Z', NOW)).toBe(3);
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince('not a date', NOW)).toBeNull();
  });

  it('labels never / today / N days ago', () => {
    expect(lastSeenKey(null, NOW)).toEqual({ key: 'reps.never', count: 0 });
    expect(lastSeenKey('2026-10-06T01:00:00Z', NOW)).toEqual({ key: 'reps.today', count: 0 });
    expect(lastSeenKey('2026-09-26T12:00:00Z', NOW)).toEqual({ key: 'reps.daysAgo', count: 10 });
  });

  it('marks a pharmacy due after 10 days without a verified visit, or never visited', () => {
    expect(isVisitDue(null, NOW)).toBe(true);
    expect(isVisitDue('2026-09-27T12:00:00Z', NOW)).toBe(false);
    expect(isVisitDue('2026-09-26T12:00:00Z', NOW)).toBe(true);
  });
});

describe('the add-rep form', () => {
  const valid = { name: 'سامر', phone: '0933 123 456', password: 'temp-pass' };

  it('accepts a good rep, with spaces in the phone', () => {
    expect(repFormError(valid)).toBeNull();
    expect(repFormError({ ...valid, phone: '+963933123456' })).toBeNull();
  });

  it('names the first problem, as a key both languages have', () => {
    const cases = [
      [{ ...valid, name: ' ' }, 'reps.errors.name'],
      [{ ...valid, phone: '0812345678' }, 'reps.errors.phone'],
      [{ ...valid, password: 'short' }, 'reps.errors.password'],
    ];
    for (const [input, key] of cases) {
      const error = repFormError(input);
      expect(error.key).toBe(key);
      const leaf = key.split('.').pop();
      expect(en.reps.errors[leaf]).toBeTruthy();
      expect(ar.reps.errors[leaf]).toBeTruthy();
    }
    expect(repFormError({ ...valid, password: 'short' }).values).toEqual({ min: 8 });
  });
});

describe('phones', () => {
  it('shows the stored +963 form as the local 09 one', () => {
    expect(toLocalPhone('+963933123456')).toBe('0933123456');
    expect(toLocalPhone('0933123456')).toBe('0933123456');
    expect(toLocalPhone(undefined)).toBe('');
  });
});

describe('the printable visit sticker', () => {
  const labels = { title: 'Visit QR', brand: 'Feniq', hint: 'Scan me' };

  it('carries the pharmacy, the QR and the code, and prints itself', () => {
    const html = visitStickerHtml({
      pharmacyName: 'صيدلية الرازي',
      address: 'الرمل الشمالي',
      svg: '<svg id="qr"></svg>',
      code: 'ABCDEFGHJKMNPQRS',
      labels,
    });
    expect(html).toContain('صيدلية الرازي');
    expect(html).toContain('الرمل الشمالي');
    expect(html).toContain('<svg id="qr"></svg>');
    expect(html).toContain('ABCDEFGHJKMNPQRS');
    expect(html).toContain('window.print()');
  });

  it('escapes the names it is given', () => {
    const html = visitStickerHtml({ pharmacyName: '<b>x</b>', address: '', svg: '', code: 'C', labels });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});

describe('translations', () => {
  it('has the same rep keys in both languages', () => {
    // A plural key has a different number of forms per language (Arabic has six).
    const keys = (obj, prefix = '') =>
      Object.entries(obj).flatMap(([k, v]) =>
        typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k.replace(/_(zero|one|two|few|many|other)$/, '')}`]
      );
    const unique = (list) => [...new Set(list)].sort();
    expect(unique(keys(ar.reps))).toEqual(unique(keys(en.reps)));
    expect(en.nav.reps).toBeTruthy();
    expect(ar.nav.reps).toBeTruthy();
  });
});

describe('rep commission', () => {
  it('reads a percentage the server would accept, and rejects the rest', () => {
    expect(parseCommissionInput('')).toBe(0);
    expect(parseCommissionInput('  ')).toBe(0);
    expect(parseCommissionInput('2')).toBe(2);
    expect(parseCommissionInput('1,5')).toBe(1.5);
    expect(parseCommissionInput('0.25')).toBe(0.25);
    expect(parseCommissionInput(String(MAX_REP_COMMISSION_RATE))).toBe(MAX_REP_COMMISSION_RATE);
    for (const bad of ['10.01', '11', '-1', '1.234', 'abc', '1e2', '2%']) {
      expect(parseCommissionInput(bad), bad).toBeNull();
    }
  });

  it('splits a rate: half to the rep, a quarter to Feniq, a quarter saved', () => {
    expect(commissionSplit(2)).toEqual({ rep: 1, feniq: 0.5, saving: 0.5 });
    expect(commissionSplit(1)).toEqual({ rep: 0.5, feniq: 0.25, saving: 0.25 });
    expect(commissionSplit(0)).toEqual({ rep: 0, feniq: 0, saving: 0 });
    const { rep, feniq, saving } = commissionSplit(3.33);
    expect(rep + feniq + saving).toBeCloseTo(3.33, 4);
  });

  it('shows percentages without trailing zeros', () => {
    expect(formatPercent(2)).toBe('2%');
    expect(formatPercent(0.5)).toBe('0.5%');
    expect(formatPercent(0.125)).toBe('0.13%');
    expect(formatPercent(undefined)).toBe('0%');
  });

  it('the rep form refuses a bad commission and accepts a blank one', () => {
    const ok = { name: 'سامر', phone: '0931000009', password: 'Abcdef12!' };
    expect(repFormError({ ...ok, commissionRate: '' })).toBeNull();
    expect(repFormError({ ...ok, commissionRate: '2' })).toBeNull();
    expect(repFormError({ ...ok, commissionRate: '50' })).toEqual({
      key: 'reps.errors.commission',
      values: { max: MAX_REP_COMMISSION_RATE },
    });
  });

  it('has a translation for every commission string in both languages', () => {
    const keys = [
      'commissionRate', 'commissionHint', 'commissionSplit', 'commission', 'monthCommission', 'commissionRep',
      'commissionFeniq', 'commissionSaving', 'commissionNone', 'editCommission', 'editCommissionPrompt',
      'commissionUpdated', 'commissionCountsDelivered',
    ];
    for (const key of keys) {
      expect(en.reps[key], key).toBeTruthy();
      expect(ar.reps[key], key).toBeTruthy();
    }
    expect(en.reps.errors.commission).toBeTruthy();
    expect(ar.reps.errors.commission).toBeTruthy();
  });
});
