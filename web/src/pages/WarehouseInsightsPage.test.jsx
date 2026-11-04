// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WarehouseInsightsPage } from './WarehouseInsightsPage';
import { api } from '../api/client';
import { downloadReportCsv } from '../utils/reportCsv';
let featureFlags;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { warehouseRole: 'owner' } }) }));
vi.mock('../context/WarehouseSubscriptionContext', () => ({ useWarehouseSubscription: () => ({ hasFeature: (key) => featureFlags[key] === true, loading: false }) }));
vi.mock('../components/WarehouseGroupSubNav', () => ({ WarehouseGroupSubNav: () => null }));
vi.mock('../utils/reportCsv', () => ({ downloadReportCsv: vi.fn() }));
vi.mock('../api/client', () => ({ api: { warehouseInsights: vi.fn(), warehouseFollowUp: vi.fn(), warehouseInsightAlerts: vi.fn(),
  warehouseFollowUpExport: vi.fn(), saveWarehouseFollowUp: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const data = { asOfBusiness: '2026-10-29 14:30', settings: { overdueDays: 15, inactiveDays: 15, revision: 0 },
  totals: { netSalesSyp: 12345, collectionsSyp: 5000, returnsSyp: 1000 }, aging: { totalDebtSyp: 30000, buckets: [10000, 20000, 0, 0] },
  daily: [{ date: '2026-10-29', netSalesSyp: 12345, collectionsSyp: 5000, returnsSyp: 1000 }] };
const row = { pharmacy: { id: 'p1', nameAr: 'صيدلية الشفاء', nameEn: 'Al Shifa', city: 'Latakia', phone: '0944123456' }, oldestAgeDays: 27, overdueSyp: 20000 };
beforeEach(() => {
  vi.clearAllMocks(); featureFlags = { ownerInsights: true, overdueReceivables: true, inactivePharmacies: true, ownerAlerts: true };
  api.warehouseInsights.mockResolvedValue(data);
  api.warehouseInsightAlerts.mockResolvedValue({ alerts: [], settings: data.settings, asOfBusiness: data.asOfBusiness });
  api.warehouseFollowUp.mockResolvedValue({ asOfBusiness: data.asOfBusiness, settings: data.settings, rows: [row], total: 1, pagination: { hasMore: false } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(path = '/warehouse/insights') { await act(async () => root.render(<MemoryRouter initialEntries={[path]}><WarehouseInsightsPage /></MemoryRouter>)); }
it('shows the matching KPI, inspectable chart, FIFO aging and source timestamp', async () => {
  await render();
  expect(host.textContent).toContain('12,345'); expect(host.textContent).toContain('2026-10-29 14:30');
  expect(host.querySelector('input[type="range"]')).not.toBeNull();
  expect(host.querySelectorAll('.insights-aging-row').length).toBe(4);
  expect(host.textContent).toContain('insights.scopeShort');
});
it('a paid report switch hides the report while leaving an independently active follow-up list usable', async () => {
  featureFlags = { overdueReceivables: true };
  await render();
  expect(api.warehouseInsights).not.toHaveBeenCalled();
  expect(api.warehouseFollowUp).toHaveBeenCalledWith({ kind: 'overdue', force: false });
  expect(host.querySelector('a[href="/warehouse/debts?pharmacy=p1"]')).not.toBeNull();
  expect(host.textContent).toContain('20,000');
});
it('an old failed period cannot overwrite the newly selected day', async () => {
  let reject;
  api.warehouseInsights.mockImplementation(({ period }) => period === 'month' ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve(data));
  await render();
  await act(async () => { const select = host.querySelector('select'); select.value = 'today'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => reject(new Error('old month failed')));
  expect(host.textContent).toContain('12,345'); expect(host.textContent).not.toContain('old month failed');
});
it('export uses the timestamp of the complete exported list rather than a previous page', async () => {
  api.warehouseFollowUpExport.mockResolvedValue({ rows: [row], asOfBusiness: '2026-10-30 09:15' });
  await render('/warehouse/insights?tab=overdue');
  await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'insights.export').click());
  expect(downloadReportCsv.mock.calls[0][0]).toBe('feniq-overdue-2026-10-30.csv');
  expect(downloadReportCsv.mock.calls[0][1][0]).toEqual(['insights.asOf', '2026-10-30 09:15', 'Asia/Damascus']);
});

it('switches a loaded overview to overdue rows without rendering the old response shape', async () => {
  await render();
  await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'insights.tabs.overdue').click());
  expect(host.querySelector('a[href="/warehouse/debts?pharmacy=p1"]')).not.toBeNull();
  expect(host.querySelector('.insights-kpis')).toBeNull();
});
