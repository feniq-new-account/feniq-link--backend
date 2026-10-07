import { describe, expect, it } from 'vitest';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import {
  VISIT_STATUSES,
  daysSince,
  isVisitDue,
  lastSeenKey,
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
    const keys = (obj, prefix = '') =>
      Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(ar.reps).sort()).toEqual(keys(en.reps).sort());
    expect(en.nav.reps).toBeTruthy();
    expect(ar.nav.reps).toBeTruthy();
  });
});
