// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChangePasswordModal } from './ChangePasswordModal';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../api/client', () => ({ api: { changePassword: vi.fn() }, setSession: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it('a temporary-password gate cannot be dismissed by Escape, backdrop or a cancel button', async () => {
  const close = vi.fn();
  await act(async () => root.render(<ChangePasswordModal required role="warehouse" onClose={close} />));
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    host.querySelector('.modal-overlay').click();
  });
  expect(close).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('common.cancel');
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
});

it('an optional password change still supports cancellation', async () => {
  const close = vi.fn();
  await act(async () => root.render(<ChangePasswordModal role="warehouse" onClose={close} />));
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(close).toHaveBeenCalledOnce();
});
