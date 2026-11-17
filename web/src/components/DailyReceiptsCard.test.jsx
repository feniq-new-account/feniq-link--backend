// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DailyReceiptsCard } from './DailyReceiptsCard';
import { api } from '../api/client';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key, values) => (values ? `${key}:${JSON.stringify(values)}` : key) }) }));
vi.mock('../api/client', () => ({ api: { dailyReceipts: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const receipts = {
  date: '2026-11-20', receivedSyp: 158000, receivedCount: 4, reversedSyp: 7000, reversedCount: 1, netSyp: 151000,
  unknownAmountCount: 0, truncated: false, enteredTodayDatedEarlier: [],
  byMethod: { cash: 101000, bank_transfer: 50000 },
  byRecorder: [{ userId: 'm', name: 'Manager', role: 'owner', amountSyp: 108000, count: 3 },
    { userId: 'a', name: 'Accountant', role: 'accountant', amountSyp: 50000, count: 1 }],
  payments: [{ id: 'p1', paymentNumber: 1, pharmacy: { nameAr: 'صيدلية النور', nameEn: 'Al Nour' }, amountSyp: 100000,
    method: 'cash', paidAt: '2026-11-20T06:00:00Z', status: 'posted', kind: 'settlement', recordedBy: { name: 'Manager', role: 'owner' } },
    { id: 'p4', paymentNumber: 4, pharmacy: null, amountSyp: 7000, method: 'cash', paidAt: '2026-11-20T04:30:00Z',
      status: 'posted', kind: 'reversal', recordedBy: { name: 'Accountant', role: 'accountant' } }],
};
let root, host;
beforeEach(async () => {
  vi.clearAllMocks();
  api.dailyReceipts.mockResolvedValue({ receipts });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<DailyReceiptsCard />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it("loads today's receipts and shows the total, the methods and who took what", () => {
  expect(api.dailyReceipts).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[data-testid="daily-receipts-total"]').textContent).toContain('151,000');
  const recorders = host.querySelector('[data-testid="daily-receipts-recorders"]').textContent;
  expect(recorders).toContain('Manager');
  expect(recorders).toContain('accounting.receipts.role_owner');
  expect(recorders).toContain('Accountant');
  expect(host.textContent).toContain('accounting.receipts.reversedTotal');
  expect(host.textContent).toContain('−');
  expect(host.textContent).toContain('accounting.receipts.reversal');
});
