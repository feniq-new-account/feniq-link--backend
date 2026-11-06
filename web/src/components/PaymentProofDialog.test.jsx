// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { PaymentProofDialog } from './PaymentProofDialog';
import { api } from '../api/client';
let user;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user }) }));
vi.mock('../api/client', () => ({ api: { paymentProofs: vi.fn(), submitPaymentProof: vi.fn(), reviewPaymentProof: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
const payment = { id: 'payment-a', amountSyp: 10000, status: 'posted' };
const source = (extra = {}) => ({ paymentId: payment.id, paymentStatus: 'posted', paidAt: '2026-11-01T10:00:00Z',
  asOf: '2026-11-06T12:00:00Z', rows: [], hasMore: false, nextBefore: null, ...extra });
const proof = (extra = {}) => ({ id: 'proof-a', revision: 1, amountSyp: 10000, paidAt: '2026-11-01T10:00:00Z',
  proofReference: 'synthetic-reference', review: null, effectiveApproval: false, ...extra });
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent === label);
async function render(props = {}) { await act(async () => root.render(<PaymentProofDialog payment={payment} onClose={vi.fn()} {...props} />)); }
async function input(element, value) {
  const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  user = { role: 'warehouse', status: 'active', warehouseRole: 'accountant', permissions: { paymentRecord: true, paymentProofReview: true } };
  api.paymentProofs.mockResolvedValue(source());
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('shows exact server proof, actual cash time, review state and updated time without a second cash action', async () => {
  api.paymentProofs.mockResolvedValue(source({ rows: [proof({ review: { decision: 'approved', at: '2026-11-06T12:00:00Z' }, effectiveApproval: true })] }));
  await render();
  expect(host.textContent).toContain('synthetic-reference');
  expect(host.textContent).toContain('paymentProof.approved');
  expect(host.textContent).toContain('paymentProof.cashTime');
  expect(host.textContent).toContain('paymentProof.updated');
  expect(host.querySelector('form')).toBeNull();
  expect(button('paymentProof.approve')).toBeUndefined();
  expect(api.submitPaymentProof).not.toHaveBeenCalled();
});
it('owner and historical views render evidence read-only, while an ungranted permission stays denied', async () => {
  user = { ...user, warehouseRole: 'owner', permissions: { paymentRecord: false, paymentProofReview: false } };
  api.paymentProofs.mockResolvedValue(source({ rows: [proof()] }));
  await render();
  expect(button('paymentProof.approve')).toBeUndefined(); expect(host.querySelector('form')).toBeNull();
  user = { ...user, warehouseRole: 'accountant', permissions: { paymentRecord: true, paymentProofReview: true } };
  await render({ readOnly: true });
  expect(button('paymentProof.approve')).toBeUndefined();
  user = { ...user, permissions: { paymentRecord: true } };
  await render();
  expect(button('paymentProof.approve')).toBeUndefined();
});
it('pending proof can be approved only once during an in-flight request', async () => {
  api.paymentProofs.mockResolvedValue(source({ rows: [proof()] }));
  let finish;
  api.reviewPaymentProof.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render();
  await act(async () => { button('paymentProof.approve').click(); button('paymentProof.approve').click(); });
  expect(api.reviewPaymentProof).toHaveBeenCalledTimes(1);
  expect(api.reviewPaymentProof.mock.calls[0][2]).toMatchObject({ decision: 'approved', reason: null });
  expect(api.reviewPaymentProof.mock.calls[0][2].idempotencyKey).toBeTruthy();
  api.paymentProofs.mockResolvedValue(source({ rows: [proof({ review: { decision: 'approved', at: '2026-11-06T12:00:00Z' }, effectiveApproval: true })] }));
  await act(async () => finish({}));
  expect(button('paymentProof.approve')).toBeUndefined();
});
it('lost approval response hides stale data and reuses the same key after refreshing and retrying', async () => {
  api.paymentProofs.mockResolvedValue(source({ rows: [proof()] }));
  api.reviewPaymentProof.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({});
  await render();
  await act(async () => button('paymentProof.approve').click());
  expect(host.querySelector('[role="alert"]').textContent).toBe('Connection lost');
  expect(host.textContent).not.toContain('synthetic-reference');
  await act(async () => button('paymentProof.refresh').click());
  await act(async () => button('paymentProof.approve').click());
  expect(api.reviewPaymentProof.mock.calls[1]).toEqual(api.reviewPaymentProof.mock.calls[0]);
});
it('submits a reference and no client amount, cash date, tenant, collector or approval flag', async () => {
  api.submitPaymentProof.mockResolvedValue({});
  await render();
  await input(host.querySelector('input'), '  receipt-reference  ');
  await input(host.querySelector('textarea'), '  optional note  ');
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.submitPaymentProof).toHaveBeenCalledTimes(1);
  const [id, body] = api.submitPaymentProof.mock.calls[0];
  expect(id).toBe(payment.id);
  expect(body).toEqual({ proofReference: 'receipt-reference', note: 'optional note', idempotencyKey: expect.any(String) });
});
it('rejecting proof requires a nonblank reason, and reversed payments cannot be reviewed', async () => {
  api.paymentProofs.mockResolvedValue(source({ rows: [proof()] }));
  await render();
  expect(button('paymentProof.reject').disabled).toBe(true);
  await input(host.querySelector('textarea'), 'missing receipt');
  api.reviewPaymentProof.mockResolvedValue({});
  await act(async () => button('paymentProof.reject').click());
  expect(api.reviewPaymentProof.mock.calls[0][2]).toMatchObject({ decision: 'rejected', reason: 'missing receipt' });
  api.paymentProofs.mockResolvedValue(source({ paymentStatus: 'reversed', rows: [proof({ review: { decision: 'approved', at: '2026-11-06T12:00:00Z' } })] }));
  await act(async () => button('paymentProof.refresh').click());
  expect(host.textContent).toContain('paymentProof.ineffective');
  expect(button('paymentProof.approve')).toBeUndefined(); expect(host.querySelector('form')).toBeNull();
});
it('older evidence is read-only and a failed refresh clears previously approved figures', async () => {
  api.paymentProofs.mockResolvedValueOnce(source({ rows: [proof()], hasMore: true, nextBefore: 2 }))
    .mockResolvedValueOnce(source({ rows: [proof({ revision: 1, proofReference: 'older-proof' })] }));
  await render();
  await act(async () => button('paymentProof.older').click());
  expect(api.paymentProofs).toHaveBeenLastCalledWith(payment.id, 2);
  expect(button('paymentProof.approve')).toBeUndefined();
  api.paymentProofs.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => button('paymentProof.refresh').click());
  expect(host.textContent).not.toContain('older-proof');
  expect(host.querySelector('[role="alert"]').textContent).toBe('Offline');
});
