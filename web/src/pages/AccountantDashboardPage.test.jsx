// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountantDashboardPage } from './AccountantDashboardPage';
import { api } from '../api/client';
let flags;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../context/WarehouseSubscriptionContext', () => ({ useWarehouseSubscription: () => ({ hasFeature: (key) => !!flags[key], loading: false }) }));
vi.mock('../components/WarehouseGroupSubNav', () => ({ WarehouseGroupSubNav: () => null }));
vi.mock('../api/client', () => ({ api: { accountantDashboard: vi.fn(), warehouseFollowUp: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const result = { asOf: '2026-11-06T10:00:00Z', summary: { period: { from: '2026-11-01', to: '2026-11-06' },
  current: { salesSyp: 12345, collectionsSyp: 6789, returnsSyp: 800, invoiceCount: 2, paymentCount: 1 }, previous: {},
  outstanding: { totalDebtSyp: 9000, totalCreditSyp: 0, debtorCount: 1, topDebtors: [] }, topBuyers: [] },
  activity: [{ id: 'entry', pharmacyId: 'p1', pharmacy: { nameEn: 'A pharmacy' }, entryNumber: 42, kind: 'payment_reversal', direction: 'debit',
    amountSyp: 500, effectiveAt: '2026-11-04', postedAt: '2026-11-06', reason: 'Correction', reference: { paymentNumber: 21 } }] };
const button = () => host.querySelector('button[type=submit]');
async function render() { await act(async () => root.render(<MemoryRouter><AccountantDashboardPage /></MemoryRouter>)); }
beforeEach(() => {
  vi.clearAllMocks(); flags = {}; api.accountantDashboard.mockResolvedValue(result);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('renders server totals, source time, correction references and pharmacy links without write actions', async () => {
  await render();
  expect(host.textContent).toContain('12,345'); expect(host.textContent).toContain('6,789');
  expect(host.querySelector('time').dateTime).toBe(result.asOf);
  expect(host.textContent).toContain('LE-42'); expect(host.textContent).toContain('Correction');
  expect(host.querySelector('a[href="/warehouse/debts?pharmacy=p1"]')).not.toBeNull();
  expect(host.textContent).not.toContain('quickPay.fullButton'); expect(api.warehouseFollowUp).not.toHaveBeenCalled();
});
it('clears old amounts during refresh and after failure, and allows retry', async () => {
  await render(); let reject;
  api.accountantDashboard.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  await act(async () => button().click());
  expect(host.textContent).not.toContain('12,345'); expect(host.querySelector('[role=status]')).not.toBeNull();
  await act(async () => reject(new Error('Network unavailable')));
  expect(host.textContent).toContain('Network unavailable'); expect(host.textContent).not.toContain('6,789');
  await act(async () => button().click()); expect(host.textContent).toContain('12,345');
});
it('ignores an old response after a later request succeeds', async () => {
  let resolveOld;
  api.accountantDashboard.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  await render(); await act(async () => button().click());
  await act(async () => resolveOld({ ...result, summary: { ...result.summary, current: { ...result.summary.current, salesSyp: 99999 } } }));
  expect(host.textContent).toContain('12,345'); expect(host.textContent).not.toContain('99,999');
});
it('uses the existing entitled overdue endpoint and shows its independent read time', async () => {
  flags.overdueReceivables = true;
  api.warehouseFollowUp.mockResolvedValue({ asOfBusiness: '2026-11-06 14:00', rows: [{ pharmacy: { id: 'p2', nameAr: 'B' }, overdueSyp: 900 }] });
  await render();
  expect(api.warehouseFollowUp).toHaveBeenCalledWith({ kind: 'overdue', limit: 5, force: true });
  expect(host.textContent).toContain('2026-11-06 14:00'); expect(host.querySelector('a[href="/warehouse/debts?pharmacy=p2"]')).not.toBeNull();
});
it('shows empty activity and submits a custom range with a table-only kind filter', async () => {
  api.accountantDashboard.mockResolvedValue({ ...result, activity: [] }); await render();
  expect(host.textContent).toContain('accounting.noActivity');
  await act(async () => { const select = host.querySelector('select'); select.value = 'custom'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.querySelectorAll('input[type=date]').length).toBe(2);
  await act(async () => button().click());
  expect(api.accountantDashboard.mock.lastCall[0]).toMatchObject({ period: 'custom' });
  expect(api.accountantDashboard.mock.lastCall[0].from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it('submits a current balance filter for activity without deriving new KPI totals locally', async () => {
  await render();
  await act(async () => {
    const select = host.querySelectorAll('select')[1]; select.value = 'credit'; select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => button().click());
  expect(api.accountantDashboard.mock.lastCall[0]).toMatchObject({ period: 'month', balanceState: 'credit' });
  expect(host.textContent).toContain('12,345');
});


it('offers clear report hierarchy, accessible source time and mobile table labels', async () => {
  await render();
  expect(host.querySelector('.accounting-hero h1').textContent).toBe('accounting.title');
  expect(host.querySelector('.accounting-filter-panel [aria-labelledby="accounting-filter-title"]')).not.toBeNull();
  expect(host.querySelectorAll('.accounting-links a')).toHaveLength(3);
  expect(host.querySelector('td[data-label="accounting.date"]')).not.toBeNull();
  expect(host.querySelector('td[data-label="accounting.debit"]')).not.toBeNull();
  expect(host.querySelector('.accounting-activity-table .accounting-pharmacy-link')).not.toBeNull();
  expect(host.querySelector('.accounting-freshness time').dateTime).toBe(result.asOf);
  expect(host.querySelector('.accounting-debit').textContent).toContain('500');
});

it('clear filters resets editable controls and re-reads the default unfiltered period', async () => {
  await render();
  await act(async () => {
    const balance = host.querySelectorAll('select')[1];
    balance.value = 'credit';
    balance.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => button().click());
  expect(api.accountantDashboard.mock.lastCall[0]).toMatchObject({ period: 'month', balanceState: 'credit' });
  expect(host.textContent).toContain('accounting.filtersApplied');
  await act(async () => host.querySelector('.accounting-filter-actions .accounting-reset').click());
  expect(api.accountantDashboard.mock.lastCall[0]).toEqual({ period: 'month' });
  expect(host.querySelectorAll('select')[1].value).toBe('');
  expect(host.textContent).not.toContain('accounting.filtersApplied');
});

it('error panel retries without retaining old financial totals', async () => {
  api.accountantDashboard.mockRejectedValueOnce(new Error('Disconnected'));
  await render();
  expect(host.querySelector('[role=alert]').textContent).toContain('Disconnected');
  expect(host.textContent).not.toContain('12,345');
  await act(async () => host.querySelector('.accounting-feedback-error button').click());
  expect(host.textContent).toContain('12,345');
});
