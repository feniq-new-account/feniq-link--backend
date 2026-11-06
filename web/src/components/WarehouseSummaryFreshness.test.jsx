// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { WarehouseSummaryCard } from './WarehouseSummaryCard';
import { api } from '../api/client';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../api/client', () => ({ api: { warehouseSummary: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('removes previous-period values during the next load and after its network failure', async () => {
  const summary = { current: { salesSyp: 12345 }, previous: {}, topBuyers: [], outstanding: { topDebtors: [], totalDebtSyp: 0 } };
  api.warehouseSummary.mockResolvedValueOnce({ summary });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<WarehouseSummaryCard />)); expect(host.textContent).toContain('12,345');
  let reject;
  api.warehouseSummary.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'whSummary.periodWeek').click());
  expect(host.textContent).not.toContain('12,345');
  await act(async () => reject(new Error('Disconnected')));
  expect(host.textContent).toContain('Disconnected'); expect(host.textContent).not.toContain('12,345');
});
