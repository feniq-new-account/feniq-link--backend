// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CashCustodyPanel } from './CashCustodyPanel';
import { api } from '../api/client';
import { cashPendingRequests } from '../utils/cashPendingRequests';
vi.mock('../api/client', () => ({ api: { cashCustody: vi.fn(), cashOperation: vi.fn(), cashSnapshot: vi.fn() } }));
const auth = vi.hoisted(() => ({ user: { id: 'admin-a' }, warehouse: { id: 'wh-a' } }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
let host, root;
const fixture = () => ({ writerEnabled: true, asOf: '2026-11-07T10:00:00Z', summary: {
  ready: true, grossCollectedSyp: 100000, cashInCustodySyp: 100000, feniqSyp: 1000, repSyp: 1000,
  cumulativeWarehouseDueSyp: 98000, remittedSyp: 0, netWarehouseDueSyp: 98000, accounts: [], blockers: [],
}, reconciliation: { _id: 'snapshot-a' }, reconciliationCurrent: true,
  permissions: { record_remittance: true, reverse_remittance: true, confirm_remittance: false },
  pharmacies: [], receipts: [], custody: [], movements: [], grantActors: [], actorGrants: [], hasMore: false });
async function mount(warehouseId = 'wh-a') {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<CashCustodyPanel warehouseId={warehouseId} />));
}
async function unmount() { if (root) { await act(async () => root.unmount()); root = null; host.remove(); } }
async function setInput(node, value) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); });
}
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text));
const form = legend => [...host.querySelectorAll('form')].find(f => f.querySelector('legend')?.textContent === legend);
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); auth.user.id = 'admin-a'; api.cashCustody.mockResolvedValue(fixture()); });
afterEach(unmount);

it('saves exact transfer payload across a lost response, changed GET and reopening; never reconstructs the amount or snapshot', async () => {
  await mount();
  const transfer = form('cashCustody.recordTransfer');
  await setInput(transfer.querySelector('input[type="number"]'), '98000');
  await setInput(transfer.querySelector('input[type="datetime-local"]'), '2026-11-07T10:00');
  await setInput(transfer.querySelector('input[type="text"]'), 'Proof A');
  api.cashOperation.mockRejectedValueOnce(new Error('Response lost after POST committed'));
  await act(async () => transfer.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  const original = structuredClone(api.cashOperation.mock.calls[0]);
  expect(original[1]).toBe('transfer'); expect(original[3].amountSyp).toBe(98000);
  expect(original[3].reconciliationId).toBe('snapshot-a'); expect(original[3].idempotencyKey).toBeTruthy();
  await unmount();
  const changed = fixture(); changed.summary.netWarehouseDueSyp = 0; changed.reconciliation._id = 'snapshot-b'; changed.permissions = {};
  api.cashCustody.mockResolvedValue(changed); api.cashOperation.mockResolvedValue({ replay: true });
  await mount();
  await act(async () => button('cashCustody.retrySaved').click());
  expect(api.cashOperation.mock.calls[1]).toEqual(original);
  expect(cashPendingRequests('admin-a', 'wh-a').read()).toEqual({});
});

it('replays the original receipt approval after its pending receipt disappears from GET', async () => {
  const data = fixture(); data.receipts = [{ id: 'receipt-a', amountSyp: 50000, status: 'pending', canReview: true, actualReceivedAt: data.asOf, reference: 'Cash A' }];
  api.cashCustody.mockResolvedValue(data); await mount();
  api.cashOperation.mockRejectedValueOnce(new Error('Reply lost'));
  await act(async () => button('cashCustody.statuses.approved').click());
  const original = structuredClone(api.cashOperation.mock.calls[0]);
  expect(original[1]).toBe('receiptReview'); expect(original[2]).toBe('receipt-a');
  await unmount(); api.cashCustody.mockResolvedValue(fixture()); api.cashOperation.mockResolvedValue({ replay: true });
  await mount(); await act(async () => button('cashCustody.retrySaved').click());
  expect(api.cashOperation.mock.calls[1]).toEqual(original);
});

it('isolates saved requests by account, warehouse and operation', () => {
  const request = { operation: 'transfer', resourceId: null, body: { amountSyp: 100, idempotencyKey: 'original-key' } };
  cashPendingRequests('admin-a', 'wh-a').save(request);
  cashPendingRequests('admin-a', 'wh-a').save({ ...request, operation: 'review', resourceId: 'movement-a' });
  expect(Object.keys(cashPendingRequests('admin-a', 'wh-a').read())).toEqual(['transfer', 'review']);
  expect(cashPendingRequests('admin-b', 'wh-a').read()).toEqual({});
  expect(cashPendingRequests('admin-a', 'wh-b').read()).toEqual({});
});

it('clears stale financial numbers when a refresh fails', async () => {
  await mount(); expect(host.querySelector('dl')).not.toBeNull();
  api.cashCustody.mockRejectedValueOnce(new Error('Source read failed'));
  await act(async () => button('common.retry').click());
  expect(host.querySelector('dl')).toBeNull(); expect(host.textContent).toContain('Source read failed');
});

it('uses server permissions and the OFF flag to disable cash operations', async () => {
  const data = fixture(); data.writerEnabled = false; api.cashCustody.mockResolvedValue(data); await mount();
  expect(host.textContent).toContain('cashCustody.writerOff');
  expect(button('cashCustody.reconcile').disabled).toBe(true);
  expect(form('cashCustody.recordTransfer').querySelector('fieldset').disabled).toBe(true);
  expect(api.cashOperation).not.toHaveBeenCalled();
  const denied = fixture(); denied.permissions = {}; api.cashCustody.mockResolvedValue(denied);
  await act(async () => button('common.retry').click());
  expect(form('cashCustody.recordTransfer')).toBeUndefined();
});

it('warehouse accountant confirmation uses its own scope and the unchanged stored decision on retries', async () => {
  auth.user.id = 'accountant-a';
  const data = fixture(); data.permissions = { confirm_remittance: true };
  data.movements = [{ _id: 'transfer-a', status: 'pending', kind: 'transfer', amountSyp: 98000, transferredAt: data.asOf, reference: 'Bank A' }];
  api.cashCustody.mockResolvedValue(data); await mount(null);
  const reason = [...host.querySelectorAll('label')].find(l => l.textContent.startsWith('cashCustody.reason')).querySelector('input');
  await setInput(reason, 'Verified bank statement');
  api.cashOperation.mockRejectedValueOnce(new Error('Reply lost'));
  await act(async () => button('cashCustody.statuses.confirmed').click());
  const original = structuredClone(api.cashOperation.mock.calls[0]);
  expect(original.slice(0, 3)).toEqual([null, 'review', 'transfer-a']);
  await unmount(); const changed = fixture(); changed.movements = []; changed.permissions = {};
  api.cashCustody.mockResolvedValue(changed); api.cashOperation.mockResolvedValue({ replay: true });
  await mount(null); await act(async () => button('cashCustody.retrySaved').click());
  expect(api.cashOperation.mock.calls[1]).toEqual(original);
});

it('blocks financial POST if exact retry storage is unavailable', async () => {
  await mount(); const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });
  try { await act(async () => button('cashCustody.reconcile').click()); expect(api.cashOperation).not.toHaveBeenCalled(); }
  finally { save.mockRestore(); }
});

it('never displays an unverified net as zero in the source statement', async () => {
  const data = fixture(); data.summary.ready = false; data.summary.netWarehouseDueSyp = null;
  data.summary.blockers = [{ accountId: 'account-a', code: 'CUSTODY_UNALLOCATED_CASH' }];
  data.summary.accounts = [{ accountId: 'account-a', allocationRunId: 'run-a', ledgerSequence: 2,
    rows: [{ receiptId: 'blocked-receipt', paymentId: 'payment-a', netWarehouseDueSyp: null, allocations: [] }],
    commissionEventIds: [], returnAdjustmentIds: [], creditIds: [], creditUseIds: [] }];
  api.cashCustody.mockResolvedValue(data); await mount();
  const receipt = [...host.querySelectorAll('summary')].find(node => node.textContent.includes('blocked-receipt'));
  expect(receipt.textContent).toContain('—');
  expect(button('cashCustody.recordTransfer').disabled).toBe(true);
});
