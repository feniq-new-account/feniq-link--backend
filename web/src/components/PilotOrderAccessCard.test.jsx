// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PilotOrderAccessCard } from './PilotOrderAccessCard';
import { api } from '../api/client';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
vi.mock('../api/client', () => ({ api: {
  getPilotOrderAccess: vi.fn(),
  updatePilotOrderAccess: vi.fn(),
} }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
beforeEach(async () => {
  vi.resetAllMocks();
  api.getPilotOrderAccess.mockResolvedValue({
    configuration: { revision: 4, allowedPhones: ['0944000201'] },
  });
  api.updatePilotOrderAccess.mockImplementation(async payload =>
    ({ configuration: { ...payload, revision: payload.revision + 1 } }));
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<PilotOrderAccessCard />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it('shows existing authorized testers and keeps revision on save', async () => {
  expect(host.querySelector('textarea').value).toContain('0944000201');
  await act(async () => host.querySelector('form').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.updatePilotOrderAccess).toHaveBeenCalledWith({
    revision: 4, allowedPhones: ['0944000201'],
  });
  expect(host.querySelector('[role="status"]').textContent).toContain('pilotAccess.saved');
});
it('sends an empty list to safely stop pilot access, not permanently open orders', async () => {
  await act(async () => {
    const input = host.querySelector('textarea');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.querySelector('form').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.updatePilotOrderAccess).toHaveBeenCalledWith({
    revision: 4, allowedPhones: [],
  });
});
