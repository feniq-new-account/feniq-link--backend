// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminAppReleasePage } from './AdminAppReleasePage';
import { api } from '../api/client';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../api/client', () => ({ api: { getAdminAppRelease: vi.fn(), inspectAdminAppRelease: vi.fn(), updateAdminAppRelease: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const configuration = {
  enabled: true, revision: 3, latestBuild: 1050, versionName: '1.0.1', apkUrl: 'https://feniq-site.onrender.com/feniq.apk',
  size: 80000000, notes: '', roles: {
    pharmacy: { minimumBuild: 1, recommendedBuild: 1049, mandatoryAfter: null },
    rep: { minimumBuild: 1, recommendedBuild: 1050, mandatoryAfter: null },
    warehouse: { minimumBuild: 1, recommendedBuild: 1050, mandatoryAfter: null },
  },
};
beforeEach(async () => {
  vi.clearAllMocks();
  api.getAdminAppRelease.mockResolvedValue({ configuration, defaultOrigin: 'https://feniq-site.onrender.com' });
  api.updateAdminAppRelease.mockImplementation(async (body) => ({ configuration: { ...configuration, ...body, revision: 4 } }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<AdminAppReleasePage />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it('a seven-day deadline changes only the chosen role and preserves the revision for stale-save protection', async () => {
  const rep = [...host.querySelectorAll('fieldset')].find((element) => element.querySelector('legend')?.textContent === 'appRelease.roles.rep');
  await act(async () => rep.querySelector('button').click());
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  const body = api.updateAdminAppRelease.mock.calls[0][0];
  expect(body.revision).toBe(3);
  expect(body.roles.rep.minimumBuild).toBe(1050);
  expect(new Date(body.roles.rep.mandatoryAfter).getTime()).toBeGreaterThan(Date.now() + 6 * 86400000);
  expect(body.roles.pharmacy).toEqual(configuration.roles.pharmacy);
});

it('the administrator can disable an update without requiring a new inspection', async () => {
  await act(async () => host.querySelector('input[type="checkbox"]').click());
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.updateAdminAppRelease).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, revision: 3 }));
  expect(api.inspectAdminAppRelease).not.toHaveBeenCalled();
  expect(host.textContent).toContain('appRelease.saved');
});

it('inspection uses the actual APK version', async () => {
  api.inspectAdminAppRelease.mockResolvedValue({ artifact: { ...configuration, versionName: '1.1.0' } });
  const inspect = [...host.querySelectorAll('button')].find(button => button.textContent === 'appRelease.inspect');
  await act(async () => inspect.click());
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.updateAdminAppRelease).toHaveBeenCalledWith(expect.objectContaining({ versionName: '1.1.0' }));
});
