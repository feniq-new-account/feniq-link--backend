// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18next from 'i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import { AdminPanel } from './AdminPanel';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Admin Test', role: 'admin' }, logout: () => {} }),
}));
vi.mock('../realtime/UnreadBadgesProvider', () => ({
  useUnreadBadges: () => ({ countUnder: () => 0, total: 0 }),
}));
vi.mock('../hooks/useStackedTableLabels', () => ({ useStackedTableLabels: () => {} }));
vi.mock('./AdminDashboardPage', () => ({
  AdminDashboardPage: () => <div data-testid="admin-dashboard">Dashboard</div>,
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root, host, i18n;
beforeEach(async () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({
    lng: 'ar',
    resources: { ar: { translation: ar }, en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  await i18n?.changeLanguage('ar');
});

async function render(path = '/admin/dashboard') {
  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[path]}><AdminPanel /></MemoryRouter>
      </I18nextProvider>,
    );
  });
}
const sidebarLinks = () => Array.from(host.querySelectorAll('.adm-nav a'))
  .map((link) => link.getAttribute('href'));

function typeSearch(value) {
  const search = host.querySelector('#admin-nav-search');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(search, value);
  search.dispatchEvent(new Event('input', { bubbles: true }));
}

it('groups original admin destinations without exposing hidden legacy routes', async () => {
  await render();
  const paths = sidebarLinks();
  for (const path of ['/admin/dashboard','/admin/analytics','/admin/accounts',
    '/admin/commission','/admin/exchange-rate','/admin/catalog',
    '/admin/features','/admin/maintenance','/admin/app-release']) {
    expect(paths).toContain(path);
  }
  expect(paths).not.toContain('/admin/catalog-duplicates');
  expect(paths).not.toContain('/admin/discount-codes');
  expect(host.querySelectorAll('.adm-nav-section')).toHaveLength(6);
  expect(host.textContent).toContain('المالية');
  expect(host.querySelector('.adm-topbar-title').textContent).toBe('لوحة التحكم');
});

it('searches Arabic sidebar labels while keeping route links and empty feedback', async () => {
  await render();
  await act(async () => { typeSearch('العمولات'); });
  expect(sidebarLinks()).toEqual(['/admin/commission']);
  expect(host.querySelectorAll('.adm-nav-section')).toHaveLength(1);
  await act(async () => { typeSearch('قسم-غير-موجود-نهائياً'); });
  expect(sidebarLinks()).toHaveLength(0);
  expect(host.querySelector('.adm-nav-empty[role=status]')).not.toBeNull();
  await act(async () => { typeSearch(''); });
  expect(sidebarLinks()).toContain('/admin/commission');
});

it('mobile drawer has correct expanded semantics and closes with escape', async () => {
  await render();
  const open = host.querySelector('.adm-hamburger');
  expect(open.getAttribute('aria-controls')).toBe('admin-sidebar-navigation');
  expect(open.getAttribute('aria-expanded')).toBe('false');
  await act(async () => { open.click(); });
  expect(open.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('.adm-sidebar-open')).not.toBeNull();
  await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(open.getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('.adm-sidebar-open')).toBeNull();
});

it('marks nested admin pages active and keeps the active page title', async () => {
  await render('/admin/advertisements/general');
  const link = host.querySelector('.adm-nav a[href="/admin/advertisements"]');
  expect(link).not.toBeNull();
  expect(link.getAttribute('aria-current')).toBe('page');
  expect(host.querySelector('.adm-topbar-title').textContent).toBe('الإعلانات');
});
