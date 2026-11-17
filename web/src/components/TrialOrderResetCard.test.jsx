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
  resettableStatuses: ['pending', 'confirmed', 'preparing', 'out_for_delivery'],
  statusCounts: { pending: 2, out_for_delivery: 1, delivered: 1 }, resettableCount: 3, affectedPharmacies: 2,
  warehouses: [{ id: 'w1', nameAr: 'مستودع التجربة', orders: 3 }],
  deliveredUntouched: { orders: 1, warehouses: [] }, tooMany: false, maxOrdersPerRun: 5000,
};
let root, host;
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
  await act(async () => host.querySelector('input[type="checkbox"]').click());
  expect(execute.disabled).toBe(false);
  api.executeTrialOrderReset.mockResolvedValue({ result: { cancelled: 3, skipped: 0, failed: [], notifiedPharmacies: 2,
    after: { ...preview, resettableCount: 0, statusCounts: { cancelled: 3, delivered: 1 } } } });
  await act(async () => execute.click());
  expect(window.confirm).toHaveBeenCalled();
  expect(api.executeTrialOrderReset).toHaveBeenCalledWith({
    before: preview.before, reason: 'maintenance.trialReset.defaultReason', confirmCount: 3 });
  expect(host.querySelector('[data-testid="trial-reset-result"]').textContent).toContain('"cancelled":3');
  expect(host.textContent).toContain('maintenance.trialReset.nothing');
});

it('a stale preview is explained and nothing is claimed as done', async () => {
  await act(async () => button('maintenance.trialReset.preview').click());
  await act(async () => host.querySelector('input[type="checkbox"]').click());
  api.executeTrialOrderReset.mockRejectedValue(Object.assign(new Error('changed'), { code: 'TRIAL_RESET_CHANGED' }));
  await act(async () => button('maintenance.trialReset.execute').click());
  expect(host.querySelector('[role="alert"]').textContent).toBe('maintenance.trialReset.changed');
  expect(host.querySelector('[data-testid="trial-reset-result"]')).toBeNull();
});

it('declining the browser confirmation writes nothing', async () => {
  window.confirm.mockReturnValue(false);
  await act(async () => button('maintenance.trialReset.preview').click());
  await act(async () => host.querySelector('input[type="checkbox"]').click());
  await act(async () => button('maintenance.trialReset.execute').click());
  expect(api.executeTrialOrderReset).not.toHaveBeenCalled();
});
