// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TrialOrderResetCard } from './TrialOrderResetCard';
import { api } from '../api/client';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key, values) => (values ? `${key}:${JSON.stringify(values)}` : key) }) }));
vi.mock('../api/client', () => ({ api: { previewTrialOrderReset: vi.fn(), executeTrialOrderReset: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const preview = {
  before: '2026-11-30T21:00:00.000Z', generatedAt: '2026-11-30T21:00:01.000Z',
  includeOutForDelivery: false, resettableStatuses: ['pending', 'confirmed', 'preparing'],
  statusCounts: { pending: 2, confirmed: 1, out_for_delivery: 1, delivered: 1 }, resettableCount: 3, affectedPharmacies: 2,
  onTheRoad: { orders: 1, truncated: false, list: [{ id: 'o9', orderNumber: 9, nameAr: 'مستودع التجربة', finalPriceSyp: 850000, sentAt: '2026-11-30T10:00:00.000Z' }] },
  warehouses: [{ id: 'w1', nameAr: 'مستودع التجربة', orders: 3 }],
  deliveredUntouched: { orders: 1, warehouses: [] }, tooMany: false, maxOrdersPerRun: 5000,
};
let root, host;
const tick = (n) => host.querySelectorAll('input[type="checkbox"]')[n];
const button = (text) => [...host.querySelectorAll('button')].find(b => b.textContent.startsWith(text));
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('confirm', vi.fn(() => true));
  api.previewTrialOrderReset.mockResolvedValue({ preview });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<TrialOrderResetCard />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('loads nothing until the admin asks for a preview', () => {
  expect(api.previewTrialOrderReset).not.toHaveBeenCalled();
  expect(host.querySelector('[data-testid="trial-reset-preview"]')).toBeNull();
});

it('needs a preview, a reason and an explicit tick before cancelling, then sends the previewed count', async () => {
  await act(async () => button('maintenance.trialReset.preview').click());
  expect(host.textContent).toContain('maintenance.trialReset.deliveredWarning');
  const execute = button('maintenance.trialReset.execute');
  expect(execute.disabled).toBe(true);
  await act(async () => tick(1).click());
  expect(execute.disabled).toBe(false);
  api.executeTrialOrderReset.mockResolvedValue({ result: { cancelled: 3, skipped: 0, failed: [], notifiedPharmacies: 2,
    after: { ...preview, resettableCount: 0, statusCounts: { cancelled: 3, delivered: 1 } } } });
  await act(async () => execute.click());
  expect(window.confirm).toHaveBeenCalled();
  expect(api.executeTrialOrderReset).toHaveBeenCalledWith({
    before: preview.before, reason: 'maintenance.trialReset.defaultReason', confirmCount: 3, includeOutForDelivery: false });
  expect(host.querySelector('[data-testid="trial-reset-result"]').textContent).toContain('"cancelled":3');
  expect(host.textContent).toContain('maintenance.trialReset.nothing');
});

it('a stale preview is explained and nothing is claimed as done', async () => {
  await act(async () => button('maintenance.trialReset.preview').click());
  await act(async () => tick(1).click());
  api.executeTrialOrderReset.mockRejectedValue(Object.assign(new Error('changed'), { code: 'TRIAL_RESET_CHANGED' }));
  await act(async () => button('maintenance.trialReset.execute').click());
  expect(host.querySelector('[role="alert"]').textContent).toBe('maintenance.trialReset.changed');
  expect(host.querySelector('[data-testid="trial-reset-result"]')).toBeNull();
});

it('declining the browser confirmation writes nothing', async () => {
  window.confirm.mockReturnValue(false);
  await act(async () => button('maintenance.trialReset.preview').click());
  await act(async () => tick(1).click());
  await act(async () => button('maintenance.trialReset.execute').click());
  expect(api.executeTrialOrderReset).not.toHaveBeenCalled();
});

it('sends the cutoff as Damascus time and lists on-the-road orders without cancelling them by default', async () => {
  const input = host.querySelector('input[type="datetime-local"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(input, '2026-12-01T00:00'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => button('maintenance.trialReset.preview').click());
  expect(api.previewTrialOrderReset).toHaveBeenCalledWith('2026-11-30T21:00:00.000Z', false);
  const road = host.querySelector('[data-testid="trial-reset-road"]');
  expect(road.textContent).toContain('roadExcluded');
  expect(road.textContent).toContain('#9');
  expect(road.textContent).toContain('850,000');
});

it('including on-the-road orders needs a fresh preview and is sent explicitly', async () => {
  await act(async () => tick(0).click());
  api.previewTrialOrderReset.mockResolvedValue({ preview: { ...preview, includeOutForDelivery: true, resettableCount: 4,
    resettableStatuses: [...preview.resettableStatuses, 'out_for_delivery'] } });
  await act(async () => button('maintenance.trialReset.preview').click());
  expect(api.previewTrialOrderReset).toHaveBeenLastCalledWith(expect.any(String), true);
  expect(host.querySelector('[data-testid="trial-reset-road"]').textContent).toContain('roadIncluded');
  await act(async () => tick(1).click());
  api.executeTrialOrderReset.mockResolvedValue({ result: { cancelled: 4, skipped: 0, failed: [], notifiedPharmacies: 2, notifiedWarehouses: 1,
    after: { ...preview, includeOutForDelivery: true, resettableCount: 0, onTheRoad: { orders: 0, list: [], truncated: false } } } });
  await act(async () => button('maintenance.trialReset.execute').click());
  expect(api.executeTrialOrderReset).toHaveBeenCalledWith(expect.objectContaining({ confirmCount: 4, includeOutForDelivery: true }));
});
