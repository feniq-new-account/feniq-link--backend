import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18next from 'i18next';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import { ProductPicker } from './CatalogPickers';
import { OfferModal } from './OfferModal';

// Catalog overhaul Phase 10 (H4): the banner, offer and order-edit product
// pickers search a page at a time instead of rendering a <select> of every
// product the warehouse (or the platform) owns.

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

function render(node, lng = 'en') {
  return renderToStaticMarkup(<I18nextProvider i18n={i18nFor(lng)}>{node}</I18nextProvider>);
}

const noSearch = () => Promise.resolve([]);
const label = (product) => product.nameEn;

describe('ProductPicker', () => {
  it('starts as a search box, not a list of every product', () => {
    const html = render(<ProductPicker search={noSearch} selected={null} onChange={() => {}} renderLabel={label} />);
    expect(html).toContain('type="search"');
    expect(html).toContain('Search products by name or company');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('<option');
  });

  it('shows the pick with a change button', () => {
    const html = render(
      <ProductPicker search={noSearch} selected={{ id: 'p1', nameEn: 'Panadol' }} onChange={() => {}} renderLabel={label} />
    );
    expect(html).toContain('Panadol');
    expect(html).toContain('Change');
    expect(html).not.toContain('type="search"');
  });

  it('offers "remove" where the link is optional, in Arabic too', () => {
    const html = render(
      <ProductPicker
        search={noSearch}
        selected={{ id: 'p1', nameEn: 'Panadol' }}
        onChange={() => {}}
        renderLabel={label}
        allowClear
      />,
      'ar'
    );
    expect(html).toContain('إزالة');
  });
});

describe('OfferModal product field', () => {
  // Product names follow the panel's language (utils/displayName.js reads the
  // shared i18next instance) - English here, as the labels are.
  beforeAll(() => i18next.init({ lng: 'en', resources: {} }));

  const offer = { productId: 'p1', productNameEn: 'Panadol', productNameAr: 'بنادول', titleAr: 'ع', titleEn: 'O', discountPercentage: 10, startDate: '2026-09-01', isPermanent: true };

  it('the warehouse edits the product through the picker, starting on the current one', () => {
    const html = render(
      <OfferModal mode="edit" offer={offer} searchProducts={noSearch} usdToSyp={130} onClose={() => {}} onSubmit={() => {}} onSaved={() => {}} />
    );
    expect(html).toContain('Panadol');
    expect(html).toContain('Change');
    expect(html).not.toContain('<select');
  });

  it('the admin sees the product read-only', () => {
    const html = render(
      <OfferModal mode="edit" offer={offer} searchProducts={null} usdToSyp={130} onClose={() => {}} onSubmit={() => {}} onSaved={() => {}} />
    );
    expect(html).toContain('value="Panadol"');
    expect(html).toContain('disabled');
    expect(html).not.toContain('Change');
  });
});
