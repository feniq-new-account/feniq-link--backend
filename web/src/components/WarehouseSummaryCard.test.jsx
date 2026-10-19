import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18next from 'i18next';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import { SummaryFigures, percentChange } from './WarehouseSummaryCard';

// The summary's figures rendered to static HTML (the project's vitest runs in
// node with no DOM, same approach as NavBadge.test.jsx). The fetching shell is
// not under test here; the server side of the numbers is covered in
// backend/test/warehouseSummary.test.js.

function makeI18n(lng) {
  const instance = i18next.createInstance();
  instance.use(initReactI18next).init({
    lng,
    fallbackLng: lng,
    resources: { en: { translation: en }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
  });
  return instance;
}

const AR = makeI18n('ar');
const EN = makeI18n('en');

const pharmacy = (id, nameAr, nameEn = nameAr) => ({ id, nameAr, nameEn, phone: '0900000000' });

const summary = {
  period: { kind: 'today' },
  current: { salesSyp: 150000, collectionsSyp: 40000, returnsSyp: 5000, invoiceCount: 3, paymentCount: 2 },
  previous: { salesSyp: 100000, collectionsSyp: 80000, returnsSyp: 0, invoiceCount: 2, paymentCount: 4 },
  topBuyers: [
    { pharmacy: pharmacy('p1', 'صيدلية الأمل'), salesSyp: 90000 },
    { pharmacy: pharmacy('p2', 'صيدلية النور'), salesSyp: 60000 },
  ],
  outstanding: {
    totalDebtSyp: 700000,
    totalCreditSyp: 20000,
    debtorCount: 4,
    topDebtors: [{ pharmacy: pharmacy('p3', 'صيدلية الشفاء'), balanceSyp: 500000 }],
  },
};

function render(node, i18n = AR) {
  return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

describe('percentChange', () => {
  it('compares against the previous period', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(40, 80)).toBe(-50);
    expect(percentChange(100, 100)).toBe(0);
  });

  it('has nothing to compare with when the previous period was empty', () => {
    expect(percentChange(500, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });

  it('never calls a rise a fall when the previous period netted below zero', () => {
    // Yesterday's net sales were -50 (a reversal of an older charge); today 100.
    expect(percentChange(100, -50)).toBeNull();
  });

  it('handles very large amounts without losing precision', () => {
    expect(percentChange(3_000_000_000_000, 1_000_000_000_000)).toBe(200);
  });
});

describe('SummaryFigures', () => {
  it('shows the four headline tiles with their labels', () => {
    const html = render(<SummaryFigures summary={summary} />, AR);
    for (const label of ['المبيعات', 'التحصيل', 'المرتجعات', 'إجمالي الديون']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('3 فاتورة');
    expect(html).toContain('2 دفعة');
    expect(html).toContain('4 صيدلية مدينة لك');
  });

  it('marks sales up and collections down against the previous period', () => {
    const html = render(<SummaryFigures summary={summary} />, EN);
    expect(html).toContain('wh-summary-change is-up');
    expect(html).toContain('▲ 50% vs previous period');
    expect(html).toContain('wh-summary-change is-down');
    expect(html).toContain('▼ 50% vs previous period');
  });

  it('lists the top buyers and debtors in order, with their amounts', () => {
    const html = render(<SummaryFigures summary={summary} />, AR);
    expect(html.indexOf('صيدلية الأمل')).toBeGreaterThan(-1);
    expect(html.indexOf('صيدلية الأمل')).toBeLessThan(html.indexOf('صيدلية النور'));
    expect(html).toContain('صيدلية الشفاء');
  });

  it('shows held credit only when there is some', () => {
    expect(render(<SummaryFigures summary={summary} />, EN)).toContain('Credit held for pharmacies');
    const noCredit = { ...summary, outstanding: { ...summary.outstanding, totalCreditSyp: 0 } };
    expect(render(<SummaryFigures summary={noCredit} />, EN)).not.toContain('Credit held');
  });

  it('renders an empty warehouse without comparison lines or errors', () => {
    const zero = { salesSyp: 0, collectionsSyp: 0, returnsSyp: 0, invoiceCount: 0, paymentCount: 0 };
    const empty = {
      period: { kind: 'today' },
      current: zero,
      previous: zero,
      topBuyers: [],
      outstanding: { totalDebtSyp: 0, totalCreditSyp: 0, debtorCount: 0, topDebtors: [] },
    };
    const html = render(<SummaryFigures summary={empty} />, EN);
    expect(html).not.toContain('wh-summary-change');
    expect(html).toContain('No sales in this period.');
    expect(html).toContain('No outstanding debts.');
  });

  it('says a first-ever sale had nothing before it', () => {
    const first = { ...summary, previous: { ...summary.previous, salesSyp: 0 } };
    expect(render(<SummaryFigures summary={first} />, EN)).toContain('Nothing in the previous period');
  });

  it('does not call a previous period that netted below zero empty', () => {
    // Yesterday: -40,000 net (a reversal of an older charge); today: 100,000.
    const reversed = {
      ...summary,
      current: { ...summary.current, salesSyp: 100000 },
      previous: { ...summary.previous, salesSyp: -40000 },
    };
    const html = render(<SummaryFigures summary={reversed} />, EN);
    expect(html).not.toContain('Nothing in the previous period');
    // Only collections (40,000 vs 80,000) still gets a comparison line.
    expect(html.match(/wh-summary-change/g)).toHaveLength(1);
    expect(html).toContain('▼ 50% vs previous period');
  });
});
