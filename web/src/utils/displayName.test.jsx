import { afterEach, describe, expect, it } from 'vitest';
import i18next from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import { localizedName } from './displayName';
import { ProductPicker } from '../components/CatalogPickers';

// Names in one language only (catalog overhaul, pre-merge review): every
// product and manufacturer name on the panels shows in the panel's language,
// else in the other one - never empty.

async function panelLanguage(lng) {
  if (!i18next.isInitialized) await i18next.init({ lng, resources: {} });
  else await i18next.changeLanguage(lng);
}

describe('localizedName', () => {
  afterEach(() => panelLanguage('ar'));

  it('the Arabic panel shows the Arabic name, else the English one', async () => {
    await panelLanguage('ar');
    expect(localizedName('Panadol', 'بنادول')).toBe('بنادول');
    // A medicine named in English only still shows, in English.
    expect(localizedName('Zyrtec 10mg', null)).toBe('Zyrtec 10mg');
    expect(localizedName('Zyrtec 10mg', '  ')).toBe('Zyrtec 10mg');
  });

  it('the English panel shows the English name, else the Arabic one', async () => {
    await panelLanguage('en');
    expect(localizedName('Panadol', 'بنادول')).toBe('Panadol');
    // An Arabic-only medicine still works in the English UI.
    expect(localizedName(null, 'بنادول')).toBe('بنادول');
    expect(localizedName('', 'بنادول')).toBe('بنادول');
  });

  it('never an empty name', async () => {
    await panelLanguage('en');
    expect(localizedName(null, null)).toBe('-');
    expect(localizedName(' ', '')).toBe('-');
  });

  it('an explicit language wins over the panel one', () => {
    expect(localizedName('Panadol', 'بنادول', 'en')).toBe('Panadol');
    expect(localizedName('Panadol', 'بنادول', 'ar')).toBe('بنادول');
  });
});

describe('a catalog screen renders an English-only medicine in the Arabic panel', () => {
  it('the product picker labels it with its English name', async () => {
    await panelLanguage('ar');
    const i18n = i18next.createInstance();
    await i18n.use(initReactI18next).init({
      lng: 'ar',
      resources: { en: { translation: en }, ar: { translation: ar } },
      interpolation: { escapeValue: false },
    });
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ProductPicker
          search={() => Promise.resolve([])}
          selected={{ id: 'p1', nameAr: null, nameEn: 'Zyrtec 10mg' }}
          onChange={() => {}}
          renderLabel={(product) => localizedName(product.nameEn, product.nameAr)}
        />
      </I18nextProvider>
    );
    expect(html).toContain('Zyrtec 10mg');
  });
});
