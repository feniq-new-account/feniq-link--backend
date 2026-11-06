// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WarehouseDebtsPage } from './WarehouseDebtsPage';
import { api } from '../api/client';
import { downloadReportCsv } from '../utils/reportCsv';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key, i18n: { language: 'ar' } }) }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { role: 'warehouse', status: 'active', warehouseRole: 'accountant' }, warehouse: { nameEn: 'My Warehouse' } }) }));
vi.mock('../context/ExchangeRateContext', () => ({ useExchangeRate: () => 10000 }));
vi.mock('../components/WarehouseSummaryCard', () => ({ WarehouseSummaryCard: () => null }));
vi.mock('../components/WarehouseGroupSubNav', () => ({ WarehouseGroupSubNav: () => null }));
vi.mock('../utils/reportCsv', () => ({ downloadReportCsv: vi.fn() }));
vi.mock('../api/client', () => ({ api: { warehouseBalanceDetail: vi.fn(), warehouseBalances: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const statement = { asOf: '2026-11-06T12:00:00Z', period: { from: '2026-10-01T00:00:00Z', to: '2026-10-31T20:59:59Z' },
  pharmacy: { nameAr: 'صيدلية', nameEn: 'A pharmacy', phone: '+963944123456' }, opening: { syp: 900 }, closing: { syp: 1250 }, outstandingDebtSyp: 1250,
  creditBalanceSyp: 0, summary: { chargesSyp: 400, paymentsSyp: 50, returnCreditsSyp: 0 },
  reconciliation: { netMovementSyp: 350, differenceSyp: 0, reconciled: true }, rows: [{ id: 'e1', entryNumber: 77, kind: 'charge',
    effectiveAt: '2026-10-20T12:00:00Z', postedAt: '2026-10-21T14:00:00Z', debitSyp: 400, creditSyp: 0, balanceSyp: 1300, reference: { invoiceNumber: 20 } }] };
function data(value = statement) { return { statement: value, payments: [{ id: 'pay', amount: 50, currency: 'SYP', amountSyp: 50, paidAt: '2026-10-20', status: 'posted' }], paymentsScope: 'all' }; }
beforeEach(() => {
  vi.clearAllMocks(); api.warehouseBalanceDetail.mockResolvedValue(data());
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(path = '/warehouse/debts?pharmacy=p1') { await act(async () => root.render(<MemoryRouter initialEntries={[path]}><WarehouseDebtsPage /></MemoryRouter>)); }
const button = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent === label);
it('renders opening, closing and reconciliation from the server and exports the loaded range', async () => {
  await render();
  expect(host.textContent).toContain('1,250'); expect(host.textContent).toContain('statement.reconciled');
  expect(host.textContent).toContain('My Warehouse'); expect(host.textContent).toContain('statement.postedAt');
  await act(async () => button('statement.exportCsv').click());
  expect(downloadReportCsv).toHaveBeenCalledOnce(); expect(downloadReportCsv.mock.calls[0][1]).toContainEqual(['statement.closing', 1250, 'SYP']);
});
it('date-filtered statements hide posting and reversal actions, and current view restores them', async () => {
  await render(); expect(button('debts.reverse')).toBeDefined();
  await act(async () => button('statement.applyPeriod').click());
  expect(api.warehouseBalanceDetail.mock.lastCall[1]).toMatchObject({ from: expect.any(String), to: expect.any(String) });
  expect(button('debts.reverse')).toBeUndefined(); expect(host.textContent).toContain('statement.historyReadOnly');
  await act(async () => button('statement.currentView').click());
  expect(api.warehouseBalanceDetail.mock.lastCall[1]).toEqual({}); expect(button('debts.reverse')).toBeDefined();
});
it('a failed refresh removes old amounts and export controls, while keeping retry available', async () => {
  await render(); api.warehouseBalanceDetail.mockRejectedValueOnce(new Error('offline'));
  await act(async () => button('statement.currentView').click());
  expect(host.textContent).toContain('offline'); expect(host.textContent).not.toContain('1,250'); expect(button('statement.exportCsv')).toBeUndefined();
  await act(async () => button('statement.currentView').click()); expect(host.textContent).toContain('1,250');
});
it('empty periods still render opening and closing balances instead of hiding the statement', async () => {
  api.warehouseBalanceDetail.mockResolvedValue(data({ ...statement, rows: [], opening: { syp: 1250 } }));
  await render(); expect(host.textContent).toContain('statement.empty');
  expect(host.querySelectorAll('.wh-statement-opening').length).toBe(2);
});
it('balance type is a server filter and resets the cursor', async () => {
  api.warehouseBalances.mockResolvedValue({ pharmacies: [], pagination: { hasMore: false } });
  await render('/warehouse/debts');
  await act(async () => { const select = host.querySelector('select'); select.value = 'credit'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(api.warehouseBalances.mock.lastCall[0]).toMatchObject({ after: null, balanceState: 'credit' });
});
