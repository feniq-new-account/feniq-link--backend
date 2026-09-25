import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18next from 'i18next';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import { AdminPanel } from './AdminPanel';

// The admin sidebar. Duplicate review is not in it: the unique identityKey
// index keeps duplicate catalog items from being created, so the screen is
// only needed after migrating a legacy database (MIGRATIONS.md, 04) - its
// route stays, reachable by URL, so it can be put back in the menu later.

vi.mock('../realtime/UnreadBadgesProvider', () => ({
  useUnreadBadges: () => ({ countUnder: () => 0, total: 0 }),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Tester', role: 'admin' }, warehouse: null, logout: () => {} }),
}));

function renderAt(pathname, lng = 'en') {
  const i18n = i18next.createInstance();
  i18n.use(initReactI18next).init({
    lng,
    resources: { en: { translation: en }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[pathname]}>
        <AdminPanel />
      </MemoryRouter>
    </I18nextProvider>
  );
}

const navLinks = (html) => [...html.matchAll(/<a[^>]*href="(\/admin\/[^"]*)"/g)].map((m) => m[1]);

describe('the admin menu', () => {
  it('has no Duplicate review entry, in either language', () => {
    const html = renderAt('/admin/dashboard');
    expect(navLinks(html)).not.toContain('/admin/catalog-duplicates');
    expect(html).not.toContain('Duplicate review');
    expect(renderAt('/admin/dashboard', 'ar')).not.toContain('مراجعة المكرر');
    // The rest of the catalog section is still there.
    for (const path of ['/admin/catalog', '/admin/catalog-requests', '/admin/manufacturers', '/admin/categories']) {
      expect(navLinks(html), path).toContain(path);
    }
  });

  it('still opens the Duplicate review page by its URL', () => {
    const html = renderAt('/admin/catalog-duplicates');
    expect(html).toContain('<h1>Duplicate review</h1>');
    expect(navLinks(html)).not.toContain('/admin/catalog-duplicates');
  });
});
