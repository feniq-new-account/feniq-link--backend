// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DemoWarehousePurgeCard } from './DemoWarehousePurgeCard';
import { api } from '../api/client';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key, values) => (values ? `${key}:${JSON.stringify(values)}` : key) }) }));
vi.mock('../api/client', () => ({ api: { previewDemoWarehousePurge: vi.fn(), executeDemoWarehousePurge: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PHRASE = 'احذف المستودعات التجريبية';
const preview = {
  warehouses: [{ id: 'w1', nameAr: 'تجريبي أ', city: 'Latakia' }],
  logins: [{ id: 'u1', name: 'Demo A', phone: '0930000101', role: 'warehouse' }],
  counts: { Order: 3, Product: 10 }, pharmacyAccountsKept: 28, planToken: 'abcdef0123456789', confirmPhrase: PHRASE,
};
let root, host;
const button = (text) => [...host.querySelectorAll('button')].find(b => b.textContent.startsWith(text));
function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
beforeEach(async () => {
  vi.clearAllMocks();
  api.previewDemoWarehousePurge.mockResolvedValue({ preview });
  api.executeDemoWarehousePurge.mockResolvedValue({ result: { warehouses: preview.warehouses, logins: preview.logins, pharmacyAccountsKept: 28 } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<DemoWarehousePurgeCard />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it('loads nothing until asked, then shows what goes and that pharmacy accounts stay', async () => {
  expect(api.previewDemoWarehousePurge).not.toHaveBeenCalled();
  await act(async () => button('maintenance.demoPurge.preview').click());
  expect(host.textContent).toContain('0930000101');
  expect(host.querySelector('[data-testid="demo-purge-kept"]').textContent).toContain('"count":28');
});

it('deletes only with the backup ticked and the exact phrase, echoing the previewed plan', async () => {
  await act(async () => button('maintenance.demoPurge.preview').click());
  const del = button('maintenance.demoPurge.execute');
  expect(del.disabled).toBe(true);
  await act(async () => host.querySelector('input[type="checkbox"]').click());
  await act(async () => type(host.querySelector('input[type="text"]'), 'احذف'));
  expect(button('maintenance.demoPurge.execute').disabled).toBe(true);
  await act(async () => type(host.querySelector('input[type="text"]'), PHRASE));
  expect(button('maintenance.demoPurge.execute').disabled).toBe(false);
  await act(async () => button('maintenance.demoPurge.execute').click());
  expect(api.executeDemoWarehousePurge).toHaveBeenCalledWith({ planToken: 'abcdef0123456789', confirm: PHRASE });
  expect(host.querySelector('[data-testid="demo-purge-result"]')).not.toBeNull();
});
