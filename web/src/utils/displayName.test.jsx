import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18next from 'i18next';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import { displayName } from './displayName';
import { OfferModal } from '../components/OfferModal';
import { hasArabicLetters } from '../pages/AdminCatalogRequestsPage';

// Product names (pre-merge review): the Arabic name is the one shown, in
// either panel language. A medicine's English name is a search helper only.

function i18nFor(lng) {
  const instance = i18next.createInstance();
  instance.use(initReactI18next).init({
    lng,
    fallbackLng: lng,
    resources: { en: { translation: en }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
  });
  return instance;
}

describe('displayName', () => {
  it('is the Arabic name, whatever the panel language', () => {
    expect(displayName('Panadol', 'بنادول')).toBe('بنادول');
  });

  it('falls back to the English name only for a record with no Arabic name, and is never empty', () => {
    expect(displayName('Warehouse One', null)).toBe('Warehouse One');
    expect(displayName(null, null)).toBe('-');
    expect(displayName(' ', '')).toBe('-');
  });
});

describe('the English panel shows the Arabic product name', () => {
  it('in the offer form', () => {
    const offer = { productId: 'p1', productNameEn: 'Panadol', productNameAr: 'بنادول', titleAr: 'ع', titleEn: 'O', discountPercentage: 10, startDate: '2026-09-01', isPermanent: true };
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18nFor('en')}>
        <OfferModal mode="edit" offer={offer} searchProducts={null} usdToSyp={130} onClose={() => {}} onSubmit={() => {}} onSaved={() => {}} />
      </I18nextProvider>
    );
    expect(html).toContain('Edit offer'); // the English panel
    expect(html).toContain('value="بنادول"');
    expect(html).not.toContain('Panadol');
  });
});

describe('approving a catalog request', () => {
  it('prefills the English field only when the name as written has no Arabic letters', () => {
    expect(hasArabicLetters('Metformin 850')).toBe(false);
    expect(hasArabicLetters('ميتفورمين 850')).toBe(true);
    expect(hasArabicLetters('500')).toBe(false);
  });
});
