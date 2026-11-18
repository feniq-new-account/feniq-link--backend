// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QuickPaymentModal } from './QuickPaymentModal';
import { CollectPaymentModal } from './CollectPaymentModal';
import { api } from '../api/client';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../api/client', () => ({ api: { createPayment: vi.fn(), warehouseSettings: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const submit = (form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
it('full confirmation stays inline, focuses its button, and cannot submit twice while sending', async () => {
  let resolve;
  api.createPayment.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const done = vi.fn(), openRow = vi.fn(), busy = vi.fn();
  await act(async () => root.render(<div onClick={openRow}><QuickPaymentModal mode="full" pharmacyId="p1"
    pharmacyName="Pharmacy" owedSyp={1500} onClose={vi.fn()} onDone={done} onBusyChange={busy} /></div>));
  expect(host.querySelector('.modal-overlay')).toBeNull();
  expect(document.activeElement).toBe(host.querySelector('button[type="submit"]'));
  await act(async () => { submit(host.querySelector('form')); submit(host.querySelector('form')); });
  expect(api.createPayment).toHaveBeenCalledTimes(1);
  expect(host.querySelectorAll('button:disabled').length).toBe(2);
  await act(async () => resolve({ payment: { id: 'paid' } }));
  expect(done).toHaveBeenCalledWith(1500);
  expect(busy.mock.calls.map((row) => row[0])).toEqual([true, false]);
  expect(openRow).not.toHaveBeenCalled();
});
it('a lost response retries the original payment key without changing the confirmed balance', async () => {
  api.createPayment.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({});
  await act(async () => root.render(<QuickPaymentModal mode="full" pharmacyId="p1" pharmacyName="Pharmacy"
    owedSyp={1500} onClose={vi.fn()} onDone={vi.fn()} />));
  await act(async () => submit(host.querySelector('form')));
  expect(host.querySelector('[role="alert"]').textContent).toBe('Connection lost');
  const original = api.createPayment.mock.calls[0][0];
  await act(async () => submit(host.querySelector('form')));
  expect(api.createPayment.mock.calls[1][0]).toEqual(original);
});
it('delivery collection is inline and cancel records nothing; a full choice fires only once', async () => {
  const choose = vi.fn(), close = vi.fn();
  await act(async () => root.render(<CollectPaymentModal orderNumber="42" totalSyp={2500} onChoose={choose} onClose={close} />));
  expect(host.querySelector('.modal-overlay')).toBeNull();
  await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'common.cancel').click());
  expect(close).toHaveBeenCalledTimes(1); expect(choose).not.toHaveBeenCalled();
  const full = [...host.querySelectorAll('button')].find((b) => b.textContent === 'collect.full');
  await act(async () => { full.click(); full.click(); });
  expect(choose).toHaveBeenCalledExactlyOnceWith(2500);
});

const labels = () => [...host.querySelectorAll('button')].map((b) => b.textContent);
it('a cash-only warehouse is offered paid in full or the rep collected it, never part or later', async () => {
  api.warehouseSettings.mockResolvedValue({ settings: { allowsCredit: false } });
  const choose = vi.fn();
  await act(async () => root.render(<CollectPaymentModal orderNumber="42" totalSyp={2500} onChoose={choose} onClose={vi.fn()} />));
  expect(labels()).toEqual(expect.arrayContaining(['collect.full', 'collect.repCollected']));
  expect(labels()).not.toContain('collect.partial');
  expect(labels()).not.toContain('collect.later');
  await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'collect.repCollected').click());
  expect(choose).toHaveBeenCalledExactlyOnceWith(0);
});
it('a warehouse the admin allows credit is offered part and later too', async () => {
  api.warehouseSettings.mockResolvedValue({ settings: { allowsCredit: true } });
  await act(async () => root.render(<CollectPaymentModal orderNumber="42" totalSyp={2500} onChoose={vi.fn()} onClose={vi.fn()} />));
  expect(labels()).toEqual(expect.arrayContaining(['collect.full', 'collect.partial', 'collect.later']));
  expect(labels()).not.toContain('collect.repCollected');
});
it('while the setting cannot be read the cash-only choices show', async () => {
  api.warehouseSettings.mockRejectedValue(new Error('offline'));
  await act(async () => root.render(<CollectPaymentModal orderNumber="42" totalSyp={2500} onChoose={vi.fn()} onClose={vi.fn()} />));
  expect(labels()).toContain('collect.repCollected');
  expect(labels()).not.toContain('collect.later');
});
