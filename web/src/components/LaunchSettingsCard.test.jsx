// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LaunchSettingsCard } from './LaunchSettingsCard';
import { api } from '../api/client';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
vi.mock('../api/client', () => ({ api: { getLaunchSettings: vi.fn(), updateLaunchSettings: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
beforeEach(async () => {
  vi.clearAllMocks();
  api.getLaunchSettings.mockResolvedValue({ configuration: { mode: 'registration_only', message: 'Preparing launch', revision: 2 } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<LaunchSettingsCard />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('saves the selected mode with a UTC pilot deadline and current revision', async () => {
  const localDeadline = '2099-11-09T00:00';
  const orderingClosesAt = new Date(localDeadline).toISOString();
  api.updateLaunchSettings.mockResolvedValue({ configuration: { mode: 'ordering_open', message: 'Preparing launch', revision: 3, orderingClosesAt } });
  await act(async () => { const input = host.querySelector('select'); input.value = 'ordering_open'; input.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { const input = host.querySelector('input[type="datetime-local"]'); input.value = localDeadline; input.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.updateLaunchSettings).toHaveBeenCalledWith({ mode: 'ordering_open', message: 'Preparing launch', revision: 2, orderingClosesAt });
  expect(host.querySelector('input[type="datetime-local"]').value).toBe(localDeadline);
});
it('shows a stale save and reloads the new revision', async () => {
  api.updateLaunchSettings.mockRejectedValue(new Error('Launch settings changed. Reload before saving.'));
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(host.querySelector('[role="alert"]').textContent).toContain('Launch settings changed');
  api.getLaunchSettings.mockResolvedValue({ configuration: { mode: 'ordering_open', message: 'Ready', revision: 4 } });
  await act(async () => host.querySelector('[role="alert"] button').click());
  expect(host.querySelector('select').value).toBe('ordering_open');
});

it('warns when opening without an automatic closing time', async () => {
  await act(async () => { const input = host.querySelector('select'); input.value = 'ordering_open'; input.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.querySelector('[role="note"]').textContent).toContain('launch.deadlineRequired');
  expect(host.querySelector('form button.btn-primary').disabled).toBe(true);
});
