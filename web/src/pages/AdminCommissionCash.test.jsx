// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AdminCommissionPage, RecordCollectionForm, ReverseCollectionModal } from './AdminCommissionPage';
import { api } from '../api/client';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { language: 'ar' } }) }));
vi.mock('../api/client', () => ({ api: { recordCommissionCollection: vi.fn(), adminCommissionWarehouse: vi.fn(), adminCommissionOverview: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
const props = { warehouseId: 'w', period: { from: '2026-11-01T00:00:00Z', to: '2026-11-07T23:59:59Z' }, outstandingSyp: 1200 };
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(element) { await act(async () => root.render(element)); }
async function submit() { await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }
it('retains the same cash request key after a lost response and after reopening the form', async () => {
  api.recordCommissionCollection.mockRejectedValue(new Error('Lost response'));
  await render(<RecordCollectionForm {...props} onSaved={vi.fn()} />); await submit();
  const first = api.recordCommissionCollection.mock.lastCall[0];
  expect(first).toMatchObject({ warehouseId: 'w', amountSyp: 1200, direction: 'from_warehouse', idempotencyKey: expect.any(String) });
  expect(host.textContent).toContain('Lost response');
  await render(null); await render(<RecordCollectionForm {...props} onSaved={vi.fn()} />); await submit();
  expect(api.recordCommissionCollection.mock.lastCall[0].idempotencyKey).toBe(first.idempotencyKey);
});
it('retains a confirmed request key when refreshing balances fails, and uses a new key only after confirmed success', async () => {
  api.recordCommissionCollection.mockResolvedValue({ success: true });
  const onSaved = vi.fn().mockRejectedValueOnce(new Error('Read failed')).mockResolvedValue(undefined);
  await render(<RecordCollectionForm {...props} onSaved={onSaved} />); await submit();
  const first = api.recordCommissionCollection.mock.lastCall[0].idempotencyKey;
  expect(host.textContent).toContain('Read failed');
  await submit(); expect(api.recordCommissionCollection.mock.lastCall[0].idempotencyKey).toBe(first);
  await submit(); expect(api.recordCommissionCollection.mock.lastCall[0].idempotencyKey).not.toBe(first);
});
it('prefills a payout from the server negative outstanding and records only a positive magnitude', async () => {
  api.recordCommissionCollection.mockResolvedValue({ success: true });
  await render(<RecordCollectionForm {...props} outstandingSyp={-2400} onSaved={vi.fn()} />); await submit();
  expect(api.recordCommissionCollection.mock.lastCall[0]).toMatchObject({ amountSyp: 2400, direction: 'to_warehouse' });
});
it('persists reversal key across an uncertain response and keeps its reason bound to the collection', async () => {
  const onConfirm = vi.fn().mockRejectedValue(new Error('Uncertain reversal'));
  await render(<ReverseCollectionModal collection={{ id: 'c', amountSyp: 1200 }} onClose={vi.fn()} onConfirm={onConfirm} />);
  const input = host.querySelector('input');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Wrong receipt'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await submit(); const key = onConfirm.mock.lastCall[1]; expect(key).toEqual(expect.any(String));
  await submit(); expect(onConfirm.mock.lastCall).toEqual(['Wrong receipt', key]);
});
it('keeps the original payment key when the real detail hook swallows a failed read after POST, then the user reopens', async () => {
  const row = { warehouseId: 'w', nameEn: 'Synthetic Warehouse', salesSyp: 2000, returnsSyp: 0,
    commissionOwedSyp: 1200, compensationOwedSyp: 0, alreadyCollectedSyp: 0, paidOutSyp: 0, outstandingSyp: 1200 };
  api.adminCommissionOverview.mockResolvedValue({ overview: { warehouses: [row], totals: { ...row, warehouseCount: 1 } } });
  api.adminCommissionWarehouse.mockResolvedValue({ detail: { warehouse: { nameEn: row.nameEn }, period: props.period,
    summary: row, orders: [], collections: [], pagination: { hasMore: false, nextCursor: null } } });
  api.recordCommissionCollection.mockResolvedValue({ success: true });
  await render(<AdminCommissionPage />);
  await act(async () => host.querySelector('tr.clickable-row').click());
  api.adminCommissionWarehouse.mockRejectedValueOnce(new Error('Actual detail GET failed'));
  await submit(); const first = api.recordCommissionCollection.mock.lastCall[0].idempotencyKey;
  expect(host.textContent).toContain('Actual detail GET failed');
  await act(async () => host.querySelector('.wh-detail-back').click());
  await act(async () => host.querySelector('tr.clickable-row').click());
  await submit();
  expect(api.recordCommissionCollection.mock.lastCall[0].idempotencyKey).toBe(first);
});
