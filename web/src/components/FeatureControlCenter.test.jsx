// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { FeatureControlCenter } from './FeatureControlCenter';
import { api } from '../api/client';
import { MemoryRouter } from 'react-router-dom';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
vi.mock('../api/client', () => ({ api: Object.fromEntries(['getFeatureControl', 'getWarehouseEntitlements', 'getFeatureBundles', 'getFeatureAudit',
  'saveFeatureControl', 'grantWarehouseFeatures', 'revokeWarehouseGrant', 'createFeatureBundle', 'getLaunchSettings', 'updateLaunchSettings', 'getPilotNotice', 'savePilotNotice'].map(key => [key, vi.fn()])) }));
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
  api.getLaunchSettings.mockResolvedValue({ configuration: { mode: 'registration_only', message: 'Closed', revision: 4, orderingClosesAt: null } });
  api.getPilotNotice.mockResolvedValue({ configuration: {
    revision: 1, enabled: true, textAr: 'نسخة تجريبية من فينيق', textEn: 'Feniq trial version',
  } });
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

it('dashboard quick switches open ordering globally without enabling a timed restricted pilot, then turn it off', async () => {
  api.getFeatureControl.mockResolvedValue({ platform: { revision: 5, features: { mutualRatings: false } },
    featureNames: [], platformFeatureNames: ['mutualRatings'], platformFeatureDefaults: { mutualRatings: true } });
  api.getLaunchSettings.mockResolvedValue({ configuration: { mode: 'registration_only', message: 'Closed', revision: 4,
    orderingClosesAt: '2026-11-01T00:00:00.000Z' } });
  api.updateLaunchSettings.mockImplementation(async payload => ({ configuration: { ...payload, revision: payload.revision + 1 } }));
  await act(async () => root.render(<MemoryRouter><FeatureControlCenter quickOnly /></MemoryRouter>));
  const orderButton = [...host.querySelectorAll('button')].find(b => b.textContent.includes('استقبال الطلبات:'));
  expect(orderButton.textContent).toContain('OFF');
  expect(host.querySelector('input[type="checkbox"]').checked).toBe(false);
  await act(async () => orderButton.click());
  expect(api.updateLaunchSettings).toHaveBeenLastCalledWith({
    mode: 'ordering_open', revision: 4, orderingClosesAt: null, message: 'استقبال الطلبات متاح الآن.',
  });
  expect(orderButton.textContent).toContain('ON');
  await act(async () => orderButton.click());
  expect(api.updateLaunchSettings).toHaveBeenLastCalledWith({
    mode: 'registration_only', revision: 5, orderingClosesAt: null,
    message: 'التسجيل والتصفح متاحان. استقبال الطلبات متوقف حالياً.',
  });
  expect(orderButton.textContent).toContain('OFF');
  expect(api.saveFeatureControl).not.toHaveBeenCalled();
  expect(api.grantWarehouseFeatures).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('featureControl.defineBundle');
});

it('dashboard ordering toggle does not falsely switch ON when the server rejects a stale revision', async () => {
  api.updateLaunchSettings.mockRejectedValue(new Error('Launch settings changed'));
  await act(async () => root.render(<MemoryRouter><FeatureControlCenter quickOnly /></MemoryRouter>));
  const orderButton = [...host.querySelectorAll('button')].find(b => b.textContent.includes('استقبال الطلبات:'));
  await act(async () => orderButton.click());
  expect(orderButton.textContent).toContain('OFF');
  expect(host.querySelector('[role="alert"]').textContent).toContain('Launch settings changed');
});

it('admin can edit the persistent trial notice separately from the ordering switch', async () => {
  api.savePilotNotice.mockResolvedValue({ configuration: {
    revision: 2, enabled: false, textAr: 'نسخة تجريبية من فينيق', textEn: 'Feniq trial version',
  } });
  await act(async () => root.render(<MemoryRouter><FeatureControlCenter /></MemoryRouter>));
  const section = host.querySelector('section[aria-label="التنبيه التجريبي الدائم"]');
  expect(section).not.toBeNull();
  const checkbox = section.querySelector('input[type="checkbox"]');
  expect(checkbox.checked).toBe(true);
  expect(section.querySelector('textarea').value).toBe('نسخة تجريبية من فينيق');
  await act(async () => checkbox.click());
  await act(async () => section.querySelector('form').dispatchEvent(new Event('submit',
    { bubbles: true, cancelable: true })));
  expect(api.savePilotNotice).toHaveBeenCalledWith({
    revision: 1, enabled: false,
    textAr: 'نسخة تجريبية من فينيق', textEn: 'Feniq trial version',
  });
  expect(checkbox.checked).toBe(false);
  expect(api.updateLaunchSettings).not.toHaveBeenCalled();
  expect(api.saveFeatureControl).not.toHaveBeenCalled();
  expect(host.textContent).toContain('تم حفظ التنبيه');
});

it('warehouse-specific feature settings never request the admin pilot notice', async () => {
  expect(api.getPilotNotice).not.toHaveBeenCalled();
  expect(host.querySelector('section[aria-label="التنبيه التجريبي الدائم"]')).toBeNull();
});
