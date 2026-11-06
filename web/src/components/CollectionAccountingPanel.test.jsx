// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { CollectionAccountingPanel } from './CollectionAccountingPanel';
import { api } from '../api/client';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
vi.mock('../api/client', () => ({ api: { collectionAccounting: vi.fn(), adminCollectionAccounting: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const result = { asOf: '2026-11-06T12:00:00Z', summary: { originalSyp: 4000, feniqSyp: 2000, repSyp: 2000,
  returnCreditAvailableSyp: 10000, returnCreditReservedSyp: 5000, returnCreditLiabilitySyp: 15000,
  invoiceStates: { open: 0, partial: 1, paid: 0, void: 0 } },
  invoices: [{ id: 'i', orderId: 'o', pharmacyId: 'p', pharmacy: { nameEn: 'Pharmacy A' }, state: 'partial', cashRecordedSyp: 50000,
    creditAppliedSyp: 15000, outstandingSyp: 35000, eligibleCollectedSyp: 40000, accruedFeniqSyp: 2000, accruedRepSyp: 2000 }],
  events: [{ id: 'e', at: '2026-11-06', orderId: 'o', sourceKey: 'return:source', reason: 'Correction', originalCommissionSyp: -1000, feniqSyp: -500, repSyp: -500 }],
  invoicePagination: { hasMore: true, nextCursor: 'invoice-cursor' }, pagination: { hasMore: true, nextCursor: 'event-cursor' } };
beforeEach(() => { vi.clearAllMocks(); api.collectionAccounting.mockResolvedValue(result); api.adminCollectionAccounting.mockResolvedValue(result);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(props = {}) { await act(async () => root.render(<MemoryRouter><CollectionAccountingPanel {...props} /></MemoryRouter>)); }
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text);
it('renders distinct server cash, credit, fee shares and signed corrections with source time and scoped links', async () => {
  await render();
  for (const value of ['50,000', '15,000', '35,000', '40,000', '2,000', '-500', 'return:source']) expect(host.textContent).toContain(value);
  expect(host.querySelector('time').dateTime).toBe(result.asOf);
  expect(host.querySelector('a[href="/warehouse/orders/o"]')).not.toBeNull();
  expect(host.querySelector('a[href="/warehouse/debts?pharmacy=p"]')).not.toBeNull();
  expect(host.textContent).toContain('collectionAccounting.scope');
});
it('uses server cursors independently and resets both when filters change', async () => {
  await render(); await act(async () => button('collectionAccounting.nextInvoices').click());
  expect(api.collectionAccounting.mock.lastCall[0]).toEqual({ period: 'month', invoiceAfter: 'invoice-cursor' });
  await act(async () => button('collectionAccounting.nextEvents').click());
  expect(api.collectionAccounting.mock.lastCall[0]).toMatchObject({ after: 'event-cursor', invoiceAfter: 'invoice-cursor' });
  await act(async () => { const state = host.querySelectorAll('select')[1]; state.value = 'paid'; state.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => button('accounting.refresh').click());
  expect(api.collectionAccounting.mock.lastCall[0]).toEqual({ period: 'month', state: 'paid' });
});
it('removes stale amounts while refreshing and on failure; retry remains available', async () => {
  await render(); let reject;
  api.collectionAccounting.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  await act(async () => button('accounting.refresh').click()); expect(host.textContent).not.toContain('50,000');
  await act(async () => reject(new Error('Offline'))); expect(host.querySelector('[role=alert]').textContent).toBe('Offline');
  expect(host.textContent).not.toContain('2,000');
  await act(async () => button('accounting.refresh').click()); expect(host.textContent).toContain('50,000');
});
it('ignores late results and uses an explicit warehouse for admin reads without warehouse-only links', async () => {
  let old;
  api.adminCollectionAccounting.mockImplementationOnce(() => new Promise(resolve => { old = resolve; }));
  await render({ warehouseId: 'w' }); await act(async () => button('accounting.refresh').click());
  await act(async () => old({ ...result, invoices: [], summary: { ...result.summary, feniqSyp: 99999 } }));
  expect(host.textContent).not.toContain('99,999'); expect(api.collectionAccounting).not.toHaveBeenCalled();
  expect(api.adminCollectionAccounting).toHaveBeenCalledWith('w', { period: 'month' });
  expect(host.querySelector('a')).toBeNull();
});
it('shows actual empty data without fabricating figures', async () => {
  api.collectionAccounting.mockResolvedValue({ ...result, summary: null, invoices: [], events: [], invoicePagination: {}, pagination: {} });
  await render(); expect(host.textContent).toContain('collectionAccounting.noInvoices');
  expect(host.textContent).toContain('collectionAccounting.noEvents'); expect(host.textContent).not.toContain('2,000');
});
