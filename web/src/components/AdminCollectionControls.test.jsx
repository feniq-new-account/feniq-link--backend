// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AdminCollectionControls } from './AdminCollectionControls';
import { api } from '../api/client';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
vi.mock('../api/client', () => ({ api: { adminCollectionAccounting: vi.fn(), activateCollectionContract: vi.fn(), confirmCollectionSettlement: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const result = { asOf: '2026-11-06T12:00:00Z', summary: { contractRevision: 1 }, period: { from: '2026-11-01T00:00:00Z', to: '2026-11-07T20:59:59Z' },
  settlementCandidates: { rows: [{ id: 'review1', proofReference: 'receipt-proof', amountSyp: 4500, paidAt: '2026-11-06', paymentId: 'payment1', pharmacy: { nameEn: 'Pharmacy A' } }], hasMore: false } };
let root, host;
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); api.adminCollectionAccounting.mockResolvedValue(result); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render() { await act(async () => root.render(<AdminCollectionControls warehouseId="w" />)); }
async function setInput(input, value) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function submit(form) { await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }
it('shows actual approved proofs and submits only selected review IDs and the server-applied period, without cash amounts', async () => {
  api.confirmCollectionSettlement.mockResolvedValue({ success: true }); await render();
  expect(host.textContent).toContain('4,500'); expect(host.querySelector('time').dateTime).toBe(result.asOf);
  const selected = host.querySelector('input[aria-label]'); await act(async () => selected.click());
  const form = selected.closest('form'); await setInput(form.querySelector('input[maxlength="500"]'), 'weekly-document');
  await submit(form);
  expect(api.confirmCollectionSettlement).toHaveBeenCalledWith('w', { periodFrom: result.period.from, periodTo: result.period.to,
    proofReviewIds: ['review1'], reference: 'weekly-document', idempotencyKey: expect.any(String) });
  expect(host.textContent).toContain('collectionControls.settlementSaved');
});
it('requires explicit new-order confirmation and captures an agreement reference without supplying rates', async () => {
  api.activateCollectionContract.mockResolvedValue({ success: true }); await render();
  const form = host.querySelector('details form');
  expect(form.querySelector('button').disabled).toBe(true);
  await setInput(form.querySelector('input[maxlength="500"]'), 'approved-agreement');
  await act(async () => form.querySelector('input[type=checkbox]').click());
  await submit(form);
  expect(api.activateCollectionContract).toHaveBeenCalledWith('w', { agreementReference: 'approved-agreement', basis: 'net_pharmacy_invoice',
    deliveryFeeSyp: null, expectedRevision: 1, idempotencyKey: expect.any(String) });
  expect(host.textContent).toContain('collectionControls.contractSaved');
});
it('hides stale proof data after a lost response and exposes a retry independent of the form', async () => {
  api.confirmCollectionSettlement.mockRejectedValue(new Error('Lost write response')); await render();
  const checkbox = host.querySelector('input[aria-label]'); await act(async () => checkbox.click());
  const form = checkbox.closest('form'); await setInput(form.querySelector('input[maxlength="500"]'), 'weekly-document');
  await submit(form);
  const original = api.confirmCollectionSettlement.mock.lastCall[1];
  expect(host.textContent).not.toContain('4,500');
  expect(host.textContent).toContain('Lost write response');
  const retry = [...host.querySelectorAll('button')].find(button => button.textContent === 'collectionControls.retrySettlement');
  await act(async () => retry.click());
  expect(api.confirmCollectionSettlement.mock.lastCall[1]).toEqual(original);
});
it('has no monetary controls on a failed initial read and never activates automatically', async () => {
  api.adminCollectionAccounting.mockRejectedValue(new Error('Offline')); await render();
  expect(host.querySelector('[role=alert]').textContent).toBe('Offline'); expect(host.querySelector('details')).toBeNull();
  expect(api.activateCollectionContract).not.toHaveBeenCalled(); expect(api.confirmCollectionSettlement).not.toHaveBeenCalled();
});
it('replays the exact contract body after a lost POST response, changed GET revision and remount', async () => {
  api.activateCollectionContract.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({ success: true });
  await render();
  const form = host.querySelector('details form');
  await setInput(form.querySelector('input[maxlength="500"]'), 'contract-v1');
  await act(async () => form.querySelector('input[type=checkbox]').click());
  await submit(form);
  const original = api.activateCollectionContract.mock.calls[0][1];
  expect(original.expectedRevision).toBe(1);
  await act(async () => root.unmount());
  root = createRoot(host);
  api.adminCollectionAccounting.mockResolvedValue({ ...result, summary: { contractRevision: 2 } });
  await render();
  expect(host.textContent).toContain('2');
  const retry = [...host.querySelectorAll('button')].find(button => button.textContent === 'collectionControls.retryContract');
  expect(retry).toBeTruthy();
  await act(async () => retry.click());
  expect(api.activateCollectionContract).toHaveBeenCalledTimes(2);
  expect(api.activateCollectionContract.mock.calls[1][1]).toEqual(original);
  expect(host.textContent).toContain('collectionControls.contractSaved');
  expect([...Object.keys(localStorage)].some(key => key.startsWith('feniq.collection-pending:'))).toBe(false);
});
it('replays exact settlement after a lost POST response and a GET with no eligible proofs', async () => {
  api.confirmCollectionSettlement.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({ success: true });
  await render();
  const checkbox = host.querySelector('input[aria-label]');
  await act(async () => checkbox.click());
  await setInput(checkbox.closest('form').querySelector('input[maxlength="500"]'), 'settlement-v1');
  await submit(checkbox.closest('form'));
  const original = api.confirmCollectionSettlement.mock.calls[0][1];
  await act(async () => root.unmount());
  root = createRoot(host);
  api.adminCollectionAccounting.mockResolvedValue({ ...result, settlementCandidates: { rows: [], hasMore: false } });
  await render();
  expect(host.textContent).toContain('collectionControls.noCandidates');
  const retry = [...host.querySelectorAll('button')].find(button => button.textContent === 'collectionControls.retrySettlement');
  expect(retry).toBeTruthy();
  await act(async () => retry.click());
  expect(api.confirmCollectionSettlement).toHaveBeenCalledTimes(2);
  expect(api.confirmCollectionSettlement.mock.calls[1][1]).toEqual(original);
  expect(host.textContent).toContain('collectionControls.settlementSaved');
});
