// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { FeatureControlCenter } from './FeatureControlCenter';
import { api } from '../api/client';
import { MemoryRouter } from 'react-router-dom';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
vi.mock('../api/client', () => ({ api: Object.fromEntries(['getFeatureControl', 'getWarehouseEntitlements', 'getFeatureBundles', 'getFeatureAudit',
  'saveFeatureControl', 'grantWarehouseFeatures', 'revokeWarehouseGrant', 'createFeatureBundle'].map(key => [key, vi.fn()])) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const right = { revision: 4, features: { ownerMobileAccess: true }, decisions: { ownerMobileAccess: { reason: 'grant' } }, configuration: { grants: [] } };
async function input(node, value) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true })); });
}
beforeEach(async () => {
  vi.clearAllMocks();
  api.getFeatureControl.mockResolvedValue({ platform: { revision: 2, features: {} }, featureNames: ['ownerMobileAccess'] });
  api.getWarehouseEntitlements.mockResolvedValue(right);
  api.getFeatureBundles.mockResolvedValue({ bundles: [] }); api.getFeatureAudit.mockResolvedValue({ events: [] });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<FeatureControlCenter warehouseId="warehouse-a" />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('global saves carry the loaded revision and reason without granting warehouse features or charging', async () => {
  await input(host.querySelector('input:not([type])'), 'Approved operational change');
  await act(async () => host.querySelector('input[type="checkbox"]').click());
  api.saveFeatureControl.mockResolvedValue({});
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.saveFeatureControl).toHaveBeenCalledWith({ revision: 2, reason: 'Approved operational change', features: { ownerMobileAccess: false } });
  expect(api.grantWarehouseFeatures).not.toHaveBeenCalled();
  expect(host.textContent).toContain('featureControl.saved');
});
it('a stale configuration fails visibly and can be reloaded without automatic resubmission', async () => {
  await input(host.querySelector('input:not([type])'), 'Second operator');
  api.saveFeatureControl.mockRejectedValue(new Error('Changed; reload'));
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(host.textContent).toContain('Changed; reload');
  const retry = [...host.querySelectorAll('button')].find(b => b.textContent === 'common.retry');
  await act(async () => retry.click());
  expect(api.saveFeatureControl).toHaveBeenCalledTimes(1);
  expect(api.getFeatureControl).toHaveBeenCalledTimes(2);
});
it('global controls work without a warehouse and do not request or invent warehouse entitlements', async () => {
  api.getWarehouseEntitlements.mockClear();
  await act(async () => root.render(<MemoryRouter><FeatureControlCenter /></MemoryRouter>));
  expect(host.querySelector('h1').textContent).toBe('featureControl.title');
  expect(api.getWarehouseEntitlements).not.toHaveBeenCalled();
  expect(host.querySelector('a').getAttribute('href')).toBe('/admin/warehouse-access');
  expect(host.textContent).not.toContain('featureControl.grant');
});
it('admin saves mutualRatings OFF and ON with the persisted platform revision', async () => {
  api.getFeatureControl.mockResolvedValue({ platform: { revision: 3, features: { mutualRatings: false } },
    featureNames: [], platformFeatureNames: ['mutualRatings'], platformFeatureDefaults: { mutualRatings: true } });
  await act(async () => root.render(<MemoryRouter><FeatureControlCenter /></MemoryRouter>));
  const checkbox = host.querySelector('input[type="checkbox"]');
  expect(checkbox.checked).toBe(false);
  await input(host.querySelector('input:not([type])'), 'Enable mutual ratings');
  await act(async () => checkbox.click());
  api.saveFeatureControl.mockResolvedValue({});
  api.getFeatureControl.mockResolvedValue({ platform: { revision: 4, features: { mutualRatings: true } }, featureNames: [], platformFeatureNames: ['mutualRatings'] });
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.saveFeatureControl).toHaveBeenLastCalledWith({ revision: 3, reason: 'Enable mutual ratings', features: { mutualRatings: true } });
  expect(host.querySelector('input[type="checkbox"]').checked).toBe(true);
  await input(host.querySelector('input:not([type])'), 'Pause mutual ratings');
  await act(async () => host.querySelector('input[type="checkbox"]').click());
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.saveFeatureControl).toHaveBeenLastCalledWith({ revision: 4, reason: 'Pause mutual ratings', features: { mutualRatings: false } });
});
